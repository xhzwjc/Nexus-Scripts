import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.orm_models import (
    TeamResourceCredential,
    TeamResourceEnvironment,
    TeamResourceGroup,
    TeamResourceSystem,
)
from app.password_crypto import decrypt_password, encrypt_password
from app.services.team_resource_service import TeamResourceService


def _make_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
            TeamResourceGroup.__table__,
            TeamResourceSystem.__table__,
            TeamResourceEnvironment.__table__,
            TeamResourceCredential.__table__,
        ],
    )
    return sessionmaker(bind=engine)()


def test_get_all_data_respects_decrypt_flag(monkeypatch):
    monkeypatch.setenv("TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY", "test-password-key")
    db = _make_session()
    try:
        group = TeamResourceGroup(group_id="g1", name="集团")
        system = TeamResourceSystem(system_id="s1", group_id="g1", name="系统")
        env = TeamResourceEnvironment(system_id="s1", env_type="prod", url="https://example.com")
        db.add_all([group, system, env])
        db.flush()
        db.add(
            TeamResourceCredential(
                cred_id="c1",
                environment_id=env.id,
                label="管理员",
                username="root",
                password=encrypt_password("secret-123"),
            )
        )
        db.commit()

        service = TeamResourceService(db)
        safe_result = service.get_all_data()
        safe_credential = safe_result[0]["systems"][0]["environments"]["prod"]["creds"][0]
        full_result = service.get_all_data(decrypt_pass=True)
        full_credential = full_result[0]["systems"][0]["environments"]["prod"]["creds"][0]

        assert safe_credential["hasPassword"] is True
        assert "password" not in safe_credential
        assert full_credential["password"] == "secret-123"
    finally:
        db.close()
        monkeypatch.delenv("TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY", raising=False)


def test_save_all_data_preserves_existing_password_when_password_not_provided(monkeypatch):
    monkeypatch.setenv("TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY", "test-password-key")
    db = _make_session()
    try:
        group = TeamResourceGroup(group_id="g1", name="集团")
        system = TeamResourceSystem(system_id="s1", group_id="g1", name="系统")
        env = TeamResourceEnvironment(system_id="s1", env_type="prod", url="https://example.com")
        db.add_all([group, system, env])
        db.flush()
        credential = TeamResourceCredential(
            cred_id="c1",
            environment_id=env.id,
            label="管理员",
            username="root",
            password=encrypt_password("secret-123"),
            note="旧备注",
        )
        db.add(credential)
        db.commit()

        service = TeamResourceService(db)
        payload = [
            {
                "id": "g1",
                "name": "集团",
                "logo": "",
                "systems": [
                    {
                        "id": "s1",
                        "name": "系统",
                        "description": "",
                        "environments": {
                            "prod": {
                                "url": "https://example.com",
                                "adminUrl": "",
                                "skipHealthCheck": False,
                                "skipCertCheck": False,
                                "creds": [
                                    {
                                        "id": "c1",
                                        "label": "管理员",
                                        "username": "root",
                                        "note": "新备注",
                                    }
                                ],
                            }
                        },
                    }
                ],
            }
        ]

        assert service.save_all_data(payload) is True

        stored = db.query(TeamResourceCredential).filter(TeamResourceCredential.cred_id == "c1").first()
        assert stored is not None
        assert stored.note == "新备注"
        assert decrypt_password(stored.password) == "secret-123"
    finally:
        db.close()
        monkeypatch.delenv("TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY", raising=False)
