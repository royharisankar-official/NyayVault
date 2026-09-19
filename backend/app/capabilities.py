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
import re
import secrets
import shutil
import struct
import time
import urllib.error
import urllib.parse
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
        return local_document_summary(text)
    document_text = text[:30000].strip()
    if not document_text:
        return "No readable text was extracted from this document. Open the original file and use OCR or a text-readable version before requesting a Gemini Summary."
    payload = json.dumps({
        "contents": [{"parts": [{"text": (
            "Create a detailed internal document report from the source text below. "
            "Use only facts explicitly present in the document; never invent or infer missing facts. "
            "Preserve names, organisations, dates, reference numbers, amounts, locations, allegations, "
            "actions, deadlines, evidence mentioned, and the document's stated status. "
            "Clearly distinguish documented facts from uncertainty. Return these headings: "
            "Executive summary, Document purpose, People and organisations, Key facts and events, "
            "Important dates and deadlines, Reference numbers and amounts, Evidence or attachments mentioned, "
            "Risks or inconsistencies, Recommended follow-up, and Missing or unclear information. "
            "If a section is not present in the source, write 'Not stated in the document'. "
            "This is a source-grounded summary, not legal advice.\n\nDocument:\n" + document_text
        )}]}]
    }).encode()
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?"
        + urllib.parse.urlencode({"key": settings.GEMINI_API_KEY}),
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Gemini request failed ({error.code}): {detail}") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(f"Gemini request failed: {error}") from error
    try:
        return result["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError) as error:
        raise RuntimeError("Gemini returned an unexpected response") from error


def local_document_summary(text: str) -> str:
    """Create a grounded summary without an external model or API key."""
    normalized = re.sub(r"\s+", " ", text or "").strip()
    if not normalized:
        return "The document has no readable text available for summarization."
    sentences = re.split(r"(?<=[.!?])\s+", normalized)
    selected = [sentence.strip() for sentence in sentences if sentence.strip()][:3]
    if len(selected) == 1 and len(selected[0]) > 420:
        selected[0] = selected[0][:417].rsplit(" ", 1)[0] + "..."
    return " ".join(selected)


def local_document_analysis(text: str) -> dict:
    """Extract a useful, source-grounded intelligence report without an API."""
    normalized = re.sub(r"\s+", " ", text or "").strip()
    if not normalized:
        return {
            "summary": "The document has no readable text available for analysis.",
            "key_points": [],
            "entities": {"dates": [], "emails": [], "phone_numbers": [], "reference_numbers": []},
            "risk_flags": ["Readable text is unavailable; important facts may be missing."],
            "recommended_actions": ["Run OCR or upload a text-readable copy.", "Review the original document manually."],
            "open_questions": ["What facts, dates, parties or obligations are contained in the original?"],
            "confidence": "low",
            "limitations": ["Analysis was limited because no extractable text was available."],
        }

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", normalized) if part.strip()]
    sentence_scores = []
    signal_terms = (
        "must", "shall", "deadline", "due", "notice", "complaint", "incident",
        "payment", "evidence", "agreement", "order", "court", "date", "required",
        "violation", "risk", "response", "submit", "expires",
    )
    for index, sentence in enumerate(sentences):
        score = sum(1 for term in signal_terms if term in sentence.lower())
        sentence_scores.append((score, -index, sentence))
    key_points = [item[2] for item in sorted(sentence_scores, reverse=True)[:5]]
    dates = sorted(set(re.findall(
        r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+"
        r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
        r"Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|"
        r"Dec(?:ember)?)[,]?\s+\d{2,4})\b", normalized, re.IGNORECASE)))
    emails = sorted(set(re.findall(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", normalized, re.IGNORECASE)))
    phone_candidates = re.findall(r"(?<![\w])(?:\+?\d[\d\s().-]{8,}\d)(?![\w])", normalized)
    phones = sorted(set(item.strip() for item in phone_candidates
                        if len(re.sub(r"\D", "", item)) >= 10))
    references = sorted(set(re.findall(
        r"\b(?:FIR|CASE|CNR|REF|NO\.?|S\.?C\.?|WP)\s*[-:#/]?\s*[A-Z0-9/-]{3,}\b",
        normalized, re.IGNORECASE)))
    risk_flags = []
    lowered = normalized.lower()
    if any(term in lowered for term in ("urgent", "immediately", "within 24 hours", "deadline", "expires")):
        risk_flags.append("The text indicates a possible deadline or urgency; verify the exact date and time.")
    if any(term in lowered for term in ("missing", "not provided", "unavailable", "incomplete", "unsigned")):
        risk_flags.append("The document may contain missing, incomplete or unsigned information.")
    if any(term in lowered for term in ("confidential", "sensitive", "personal data", "identity")):
        risk_flags.append("Sensitive or personal information may require restricted handling.")
    if not risk_flags:
        risk_flags.append("No obvious urgency or completeness risk was detected by the local checks.")
    actions = [
        "Verify names, reference numbers and dates against the original source.",
        "Preserve the original file and record its hash and source.",
    ]
    if dates:
        actions.append("Confirm whether any extracted date is a filing, response or expiry deadline.")
    if references:
        actions.append("Cross-check the extracted reference number with the issuing authority or case record.")
    open_questions = []
    if not dates:
        open_questions.append("What are the relevant event, filing and response dates?")
    if not references:
        open_questions.append("What official case, filing or reference number identifies this document?")
    open_questions.append("Which facts still require confirmation from an authorised person or official source?")
    return {
        "summary": local_document_summary(normalized),
        "key_points": key_points,
        "entities": {
            "dates": dates,
            "emails": emails,
            "phone_numbers": phones,
            "reference_numbers": references,
        },
        "risk_flags": risk_flags,
        "recommended_actions": actions,
        "open_questions": open_questions,
        "confidence": "high" if len(normalized) >= 300 and len(sentences) >= 3 else "medium",
        "limitations": [
            "This is source-grounded extraction, not legal advice.",
            "The local analyser does not determine truth, authenticity, liability or legal outcome.",
        ],
    }


def gemini_generate(prompt: str) -> str:
    """Generate a response for a grounded prompt without changing summary behavior."""
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt[:30000]}]}]
    }).encode()
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?"
        + urllib.parse.urlencode({"key": settings.GEMINI_API_KEY}),
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Gemini request failed ({error.code}): {detail}") from error
    except (urllib.error.URLError, TimeoutError) as error:
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
