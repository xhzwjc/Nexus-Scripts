"""
团队资源迁移脚本
从加密 JSON 文件迁移到 MySQL 数据库

使用方法：
    cd fastApiProject
    python migrate_team_resources.py
"""
import json
import sys
import hashlib
import base64
from pathlib import Path

# Add the project root to sys.path to import app modules
sys.path.append(str(Path(__file__).parent))

from Crypto.Cipher import AES
from app.database import engine, Base, SessionLocal
from app.orm_models import (
    TeamResourceGroup, TeamResourceSystem, 
    TeamResourceEnvironment, TeamResourceCredential
)

# 加密密钥（与前端一致）
ENCRYPTION_KEY = "ScriptHub@TeamResources#2024!Secure"


def decrypt_cryptojs_data(encrypted_data: str, password: str) -> str:
    """解密 CryptoJS AES 加密的数据"""
    raw = base64.b64decode(encrypted_data)
    
    if raw[:8] != b'Salted__':
        raise ValueError("Invalid encrypted data format (missing Salted__ prefix)")
    
    salt = raw[8:16]
    ciphertext = raw[16:]
    
    # EVP_BytesToKey 密钥派生（兼容 CryptoJS/OpenSSL）
    def evp_bytes_to_key(pwd: bytes, salt: bytes, key_len: int = 32, iv_len: int = 16):
        d = b''
        d_i = b''
        while len(d) < key_len + iv_len:
            d_i = hashlib.md5(d_i + pwd + salt).digest()
            d += d_i
        return d[:key_len], d[key_len:key_len + iv_len]
    
    key, iv = evp_bytes_to_key(password.encode(), salt)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    decrypted_padded = cipher.decrypt(ciphertext)
    
    # PKCS7 unpadding
    pad_len = decrypted_padded[-1]
    decrypted = decrypted_padded[:-pad_len].decode('utf-8')
    
    return decrypted


def migrate(force_recreate=True):
    print("=" * 60)
    print("团队资源迁移脚本")
    print("=" * 60)
    
    # 1. 创建/重建表
    if force_recreate:
        print("\n[1/4] 删除并重建数据库表...")
        TeamResourceCredential.__table__.drop(engine, checkfirst=True)
        TeamResourceEnvironment.__table__.drop(engine, checkfirst=True)
        TeamResourceSystem.__table__.drop(engine, checkfirst=True)
        TeamResourceGroup.__table__.drop(engine, checkfirst=True)
    
    Base.metadata.create_all(bind=engine)
    print("      ✓ 数据库表已创建")
    
    # 2. 读取加密 JSON 文件
    print("\n[2/4] 读取加密数据文件...")
    json_path = Path(__file__).parent.parent / "my-app" / "data" / "team-resources.enc.json"
    
    if not json_path.exists():
        print(f"      ✗ 文件不存在: {json_path}")
        return False
    
    with open(json_path, 'r', encoding='utf-8') as f:
        encrypted_data = f.read().strip()
    
    print(f"      ✓ 已读取 {len(encrypted_data)} 字节加密数据")
    
    # 3. 解密数据
    print("\n[3/4] 解密数据...")
    try:
        decrypted = decrypt_cryptojs_data(encrypted_data, ENCRYPTION_KEY)
        groups_data = json.loads(decrypted)
        print(f"      ✓ 解密成功，共 {len(groups_data)} 个集团")
    except Exception as e:
        print(f"      ✗ 解密失败: {e}")
        return False
    
    # 4. 写入数据库
    print("\n[4/4] 写入数据库...")
    db = SessionLocal()
    stats = {"groups": 0, "systems": 0, "environments": 0, "credentials": 0}
    
    try:
        for group_idx, group_data in enumerate(groups_data):
            group = TeamResourceGroup(
                group_id=group_data["id"],
                name=group_data["name"],
                logo=group_data.get("logo", ""),
                sort_order=group_idx
            )
            db.add(group)
            stats["groups"] += 1
            
            for sys_idx, system_data in enumerate(group_data.get("systems", [])):
                system = TeamResourceSystem(
                    system_id=system_data["id"],
                    group_id=group_data["id"],
                    name=system_data["name"],
                    description=system_data.get("description", ""),
                    sort_order=sys_idx
                )
                db.add(system)
                stats["systems"] += 1
                
                for env_type, env_data in system_data.get("environments", {}).items():
                    env = TeamResourceEnvironment(
                        system_id=system_data["id"],
                        env_type=env_type,
                        url=env_data.get("url", ""),
                        admin_url=env_data.get("adminUrl", ""),
                        skip_health_check=1 if env_data.get("skipHealthCheck") else 0,
                        skip_cert_check=1 if env_data.get("skipCertCheck") else 0
                    )
                    db.add(env)
                    db.flush()  # 获取 ID
                    stats["environments"] += 1
                    
                    for cred_idx, cred_data in enumerate(env_data.get("creds", [])):
                        # 加密密码字段
                        from app.password_crypto import encrypt_password
                        encrypted_password = encrypt_password(cred_data.get("password", ""))
                        
                        cred = TeamResourceCredential(
                            cred_id=cred_data["id"],
                            environment_id=env.id,
                            label=cred_data.get("label", ""),
                            username=cred_data.get("username", ""),
                            password=encrypted_password,  # 存储加密后的密码
                            note=cred_data.get("note", ""),
                            sort_order=cred_idx
                        )
                        db.add(cred)
                        stats["credentials"] += 1
        
        db.commit()
        print("      ✓ 数据写入完成")
        
        # 生成 JSON 备份
        try:
            print("\n[5/4] 生成 JSON 备份...")
            from app.services.team_resource_service import TeamResourceService
            service = TeamResourceService(db)
            service.save_json_backup()
            print("      ✓ JSON 备份已生成 (my-app/data/team-resources.enc.json)")
        except Exception as e:
            print(f"      ! JSON 备份生成失败: {e}")
            
        print()
        print("=" * 60)
        print("迁移统计:")
        print(f"  - 集团 (groups):     {stats['groups']}")
        print(f"  - 系统 (systems):    {stats['systems']}")
        print(f"  - 环境 (environments): {stats['environments']}")
        print(f"  - 凭证 (credentials): {stats['credentials']}")
        print("=" * 60)
        print("✓ 迁移成功!")
        return True
        
    except Exception as e:
        db.rollback()
        print(f"      ✗ 写入失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
