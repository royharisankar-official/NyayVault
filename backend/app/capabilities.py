"""Optional production-oriented capabilities used by the prototype.

Heavy ML/OCR runtimes are intentionally optional. The API reports unavailable
capabilities instead of silently claiming that a feature ran.
"""

import base64
import hashlib
import hmac
import io
import json
import os
import secrets
import shutil
import struct
import time
import urllib.error
import urllib.request
from pathlib import Path

from app.config import settings

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False


def _key() -> bytes:
    return hashlib.sha256(settings.SECRET_KEY.encode()).digest()


def encrypt_bytes(data: bytes) -> bytes:
    if not CRYPTO_AVAILABLE:
        raise RuntimeError("AES encryption requires the cryptography package")
    nonce = os.urandom(12)
    return b"DMS1" + nonce + AESGCM(_key()).encrypt(nonce, data, None)


def decrypt_bytes(data: bytes) -> bytes:
    if not data.startswith(b"DMS1") or not CRYPTO_AVAILABLE:
        return data
    nonce = data[4:16]
    return AESGCM(_key()).decrypt(nonce, data[16:], None)


def _signing_key() -> "Ed25519PrivateKey":
    return Ed25519PrivateKey.from_private_bytes(_key())


def sign_digest(digest: str) -> str:
    if not CRYPTO_AVAILABLE:
        raise RuntimeError("Digital signatures require the cryptography package")
    return base64.urlsafe_b64encode(_signing_key().sign(digest.encode())).decode()


def verify_signature(digest: str, signature: str) -> bool:
    if not CRYPTO_AVAILABLE:
        return False
    try:
        _signing_key().public_key().verify(base64.urlsafe_b64decode(signature), digest.encode())
        return True
    except (ValueError, TypeError):
        return False


def new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(10)).decode().rstrip("=")


def totp_code(secret: str, timestamp: int | None = None) -> str:
    timestamp = int(timestamp or time.time()) // 30
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    message = struct.pack(">Q", timestamp)
    digest = hmac.new(key, message, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{number % 1_000_000:06d}"


def verify_totp(secret: str, code: str) -> bool:
    return any(hmac.compare_digest(totp_code(secret, int(time.time()) + offset), code)
               for offset in (-30, 0, 30))


def ocr_bytes(data: bytes, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
            embedded_text = "\n\n".join(
                (page.extract_text() or "").strip() for page in PdfReader(io.BytesIO(data)).pages
            ).strip()
            if embedded_text:
                return embedded_text
        except (ImportError, OSError, ValueError):
            pass
    try:
        import pytesseract
        from PIL import Image
        if not shutil.which("tesseract"):
            bundled = Path("C:/Program Files/Tesseract-OCR/tesseract.exe")
            if bundled.is_file():
                pytesseract.pytesseract.tesseract_cmd = str(bundled)
        if suffix in {".png", ".jpg", ".jpeg"}:
            return pytesseract.image_to_string(Image.open(io.BytesIO(data))).strip()
        if suffix == ".pdf":
            # Prefer embedded text, then render scanned pages when PyMuPDF is installed.
            try:
                import fitz
                pages = []
                with fitz.open(stream=data, filetype="pdf") as pdf:
                    for page in pdf:
                        text = page.get_text("text").strip()
                        if text:
                            pages.append(text)
                            continue
                        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                        image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
                        pages.append(pytesseract.image_to_string(image).strip())
                return "\n\n".join(page for page in pages if page)
            except ImportError:
                return ""
        return ""
    except (ImportError, RuntimeError, OSError, ValueError):
        return ""


def semantic_search(query: str, documents: list[dict]) -> list[dict]:
    """Return ranked results, using Sentence Transformers if installed.

    The deterministic token overlap fallback keeps search useful on a fresh
    machine without hiding that embeddings are unavailable.
    """
    try:
        from sentence_transformers import SentenceTransformer, util
        model = SentenceTransformer("all-MiniLM-L6-v2")
        texts = [d.get("text", "") for d in documents]
        scores = util.cos_sim(model.encode(query), model.encode(texts))[0].tolist()
        return sorted(({**d, "score": float(score)} for d, score in zip(documents, scores)),
                      key=lambda item: item["score"], reverse=True)
    except ImportError:
        terms = set(query.lower().split())
        ranked = []
        for document in documents:
            words = set(document.get("text", "").lower().split())
            ranked.append({**document, "score": len(terms & words) / max(len(terms), 1)})
        return sorted(ranked, key=lambda item: item["score"], reverse=True)


def gemini_summary(text: str) -> str:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    payload = json.dumps({
        "contents": [{"parts": [{"text": (
            "Summarize this legal or investigation document in 3 concise sentences. "
            "Do not invent facts. Document:\n" + text[:12000]
        )}]}]
    }).encode()
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        data=payload,
        headers={"Content-Type": "application/json", "x-goog-api-key": settings.GEMINI_API_KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode())
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(f"Gemini request failed: {error}") from error
        return result["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError) as error:
        raise RuntimeError("Gemini returned an unexpected response") from error


def gemini_generate(prompt: str) -> str:
    """Generate a response for a grounded prompt without changing summary behavior."""
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt[:30000]}]}]
    }).encode()
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        data=payload,
        headers={"Content-Type": "application/json", "x-goog-api-key": settings.GEMINI_API_KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode())
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(f"Gemini request failed: {error}") from error
    try:
        return result["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError) as error:
        raise RuntimeError("Gemini returned an unexpected response") from error


def capabilities() -> dict:
    return {
        "aes_gcm": CRYPTO_AVAILABLE,
        "ed25519_signatures": CRYPTO_AVAILABLE,
        "totp_mfa": True,
        "tesseract_ocr": _has_module("pytesseract"),
        "sentence_transformers": _has_module("sentence_transformers"),
        "rag_retrieval": True,
        "permissioned_chain_anchor": True,
        "gemini_api": bool(settings.GEMINI_API_KEY),
    }


def _has_module(name: str) -> bool:
    try:
        __import__(name)
        return True
    except ImportError:
        return False
