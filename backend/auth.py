from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from dotenv import load_dotenv
import hashlib
import os

load_dotenv()
from cryptography.fernet import Fernet
import base64

# Generate a fernet key from our SECRET_KEY
# hashlib.sha256 always produces exactly 32 bytes — required by Fernet
def get_fernet():
    raw = os.getenv("SECRET_KEY").encode()
    key = hashlib.sha256(raw).digest()  # 32 bytes no matter how long SECRET_KEY is
    return Fernet(base64.urlsafe_b64encode(key))

def encrypt_password(plain: str) -> str:
    return get_fernet().encrypt(plain.encode()).decode()

def decrypt_password(encrypted: str) -> str:
    return get_fernet().decrypt(encrypted.encode()).decode()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))

# Password encryption setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Encrypt a plain password
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

# Check if plain password matches encrypted one
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# Create a login token for a student
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# Decode and verify a token
def verify_token(token: str) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        roll_number = payload.get("sub")
        if roll_number is None:
            return None
        return roll_number
    except JWTError:
        return None