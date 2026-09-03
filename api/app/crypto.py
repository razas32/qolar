"""Transparent encryption-at-rest for sensitive columns (Plaid access
tokens grant read access to a real bank account — they shouldn't sit in
Postgres as plaintext).
"""

from cryptography.fernet import Fernet
from sqlalchemy.types import TypeDecorator, String

from app.config import settings

_fernet = Fernet(settings.encryption_key.encode())


class EncryptedString(TypeDecorator):
    """A String column that's encrypted in the database and transparently
    decrypted when read back through the ORM."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return _fernet.encrypt(value.encode()).decode()

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return _fernet.decrypt(value.encode()).decode()
