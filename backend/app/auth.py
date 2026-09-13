import base64
import bcrypt
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone

from app.config import Settings

settings = Settings()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if hashed_password.startswith("$2"):
        return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())
    try:
        algorithm, iterations, salt, expected = hashed_password.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", plain_password.encode(), _b64decode(salt), int(iterations))
        return hmac.compare_digest(_b64decode(expected), actual)
    except (ValueError, TypeError):
        return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire.timestamp()})
    header = {"alg": settings.ALGORITHM, "typ": "JWT"}
    encoded_header = _b64encode(json.dumps(header, separators=(",", ":")).encode())
    encoded_payload = _b64encode(json.dumps(to_encode, separators=(",", ":"), default=str).encode())
    signing_input = f"{encoded_header}.{encoded_payload}".encode()
    signature = hmac.new(settings.SECRET_KEY.encode(), signing_input, hashlib.sha256).digest()
    return f"{encoded_header}.{encoded_payload}.{_b64encode(signature)}"


def decode_access_token(token: str) -> dict | None:
    try:
        header, payload, signature = token.split(".")
        expected = hmac.new(
            settings.SECRET_KEY.encode(), f"{header}.{payload}".encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_b64decode(signature), expected):
            return None
        data = json.loads(_b64decode(payload))
        if datetime.now(timezone.utc).timestamp() > float(data["exp"]):
            return None
        return data
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None