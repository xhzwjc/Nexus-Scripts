import base64
import os

from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from Crypto.Util.Padding import pad, unpad


def _resolve_secret_key() -> bytes:
    for env_name in (
        "RECRUITMENT_LLM_ENCRYPTION_KEY",
        "TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY",
        "SCRIPT_HUB_SESSION_SECRET",
    ):
        raw = (os.getenv(env_name) or "").encode("utf-8")
        if raw:
            return raw.ljust(32, b"\0")[:32]

    raise RuntimeError(
        "Missing secret encryption key. Configure RECRUITMENT_LLM_ENCRYPTION_KEY or TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY.",
    )


def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        return ""

    iv = get_random_bytes(16)
    cipher = AES.new(_resolve_secret_key(), AES.MODE_CBC, iv)
    ciphertext = cipher.encrypt(pad(plaintext.encode("utf-8"), AES.block_size))
    return base64.b64encode(iv + ciphertext).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    if not ciphertext:
        return ""

    try:
        payload = base64.b64decode(ciphertext)
        iv = payload[:16]
        data = payload[16:]
        cipher = AES.new(_resolve_secret_key(), AES.MODE_CBC, iv)
        plaintext = unpad(cipher.decrypt(data), AES.block_size)
        return plaintext.decode("utf-8")
    except Exception:
        return ""


def mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}{'*' * max(len(value) - 8, 4)}{value[-4:]}"
