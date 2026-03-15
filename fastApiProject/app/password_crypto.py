"""
密码加密/解密工具
使用 AES-256-CBC 加密密码字段
"""
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from Crypto.Util.Padding import pad, unpad
import base64
import os

def _get_password_encryption_key() -> bytes:
    raw = os.getenv("TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY", "").encode("utf-8")
    if not raw:
        raise RuntimeError("Missing TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY environment variable")
    return raw.ljust(32, b'\0')


def encrypt_password(plaintext: str) -> str:
    """
    加密密码
    
    Args:
        plaintext: 明文密码
        
    Returns:
        Base64 编码的加密密码（格式：IV + 密文）
    """
    if not plaintext:
        return ""
    
    # 生成随机 IV
    iv = get_random_bytes(16)
    
    # 创建加密器
    cipher = AES.new(_get_password_encryption_key(), AES.MODE_CBC, iv)
    
    # 加密（需要 padding）
    ciphertext = cipher.encrypt(pad(plaintext.encode('utf-8'), AES.block_size))
    
    # 返回 IV + 密文，Base64 编码
    return base64.b64encode(iv + ciphertext).decode('utf-8')


def decrypt_password(encrypted: str) -> str:
    """
    解密密码
    
    Args:
        encrypted: Base64 编码的加密密码
        
    Returns:
        明文密码
    """
    if not encrypted:
        return ""
    
    try:
        # Base64 解码
        data = base64.b64decode(encrypted)
        
        # 提取 IV 和密文
        iv = data[:16]
        ciphertext = data[16:]
        
        # 创建解密器
        cipher = AES.new(_get_password_encryption_key(), AES.MODE_CBC, iv)
        
        # 解密并去除 padding
        plaintext = unpad(cipher.decrypt(ciphertext), AES.block_size)
        
        return plaintext.decode('utf-8')
    except Exception as e:
        print(f"Failed to decrypt password: {e}")
        return ""
