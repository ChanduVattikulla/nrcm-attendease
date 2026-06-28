from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import User
from schemas import RegisterRequest, LoginRequest, TokenResponse
from auth import hash_password, verify_password, create_access_token, encrypt_password
import requests

# --- RATE LIMITING IMPORT ---
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()

# Same key_func as main.py so behavior is consistent
limiter = Limiter(key_func=get_remote_address)

# Test if NRCM credentials actually work before registering
def verify_nrcm_credentials(roll_number: str, password: str) -> bool:
    try:
        LOGIN_URL = "https://www.nrcmec.org/Student/login.php"
        session = requests.Session()
        response = session.get(LOGIN_URL, timeout=10)
        payload = {"roll_no": roll_number, "password": password}
        login_response = session.post(LOGIN_URL, data=payload, timeout=10)
        return "index.php" in login_response.url
    except:
        return False

# --- REGISTER ---
# Limited to 5 attempts per minute per IP — prevents spam account creation
# NOTE: slowapi REQUIRES the parameter to be named exactly "request"
@router.post("/register")
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    # Check if student already registered
    existing_user = db.query(User).filter(
        User.roll_number == body.roll_number
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Student already registered")

    # Verify credentials work on NRCM portal
    if not verify_nrcm_credentials(body.roll_number, body.password):
        raise HTTPException(status_code=401, detail="Invalid NRCM credentials")

    # Save student with encrypted password
    new_user = User(
    roll_number=body.roll_number,
    password=hash_password(body.password),
    scraper_password=encrypt_password(body.password)
     )
    db.add(new_user)
    db.commit()

    return {"message": "Registration successful! Please login."}

# --- LOGIN ---
# Limited to 5 attempts per minute per IP — prevents brute-force password guessing
# NOTE: slowapi REQUIRES the parameter to be named exactly "request"
#
# SECURITY: We use the SAME generic error message whether the roll_number
# doesn't exist OR the password is wrong. This prevents "user enumeration" —
# an attacker probing roll numbers to discover which ones are real accounts
# just by comparing error messages. Real-world example: Gmail, banking
# sites, etc. all do this — they never confirm "this email/account exists."
@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    GENERIC_ERROR = "Invalid roll number or password"

    # Find student in database
    user = db.query(User).filter(
        User.roll_number == body.roll_number
    ).first()
    if not user:
        raise HTTPException(status_code=401, detail=GENERIC_ERROR)

    # Check password
    if not verify_password(body.password, user.password):
        raise HTTPException(status_code=401, detail=GENERIC_ERROR)

    # Create and return token
    token = create_access_token({"sub": user.roll_number})
    return TokenResponse(access_token=token)