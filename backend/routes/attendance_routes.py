from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import AttendanceCache, User
from auth import verify_token
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timezone
import json
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scraper import get_attendance as scrape_attendance

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

CACHE_HOURS = int(os.getenv("CACHE_HOURS", 4))

# Get current student from token
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    roll_number = verify_token(token)
    if not roll_number:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.roll_number == roll_number).first()
    if not user:
        raise HTTPException(status_code=404, detail="Student not found")
    return user

# --- GET ATTENDANCE (with cache) ---
@router.get("/attendance")
def get_attendance(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Check if cached data exists and is fresh
    cache = db.query(AttendanceCache).filter(
        AttendanceCache.roll_number == current_user.roll_number
    ).first()

    if cache:
        hours_passed = (datetime.now(timezone.utc) - cache.scraped_at.replace(tzinfo=timezone.utc)).total_seconds() / 3600
        if hours_passed < CACHE_HOURS:
            return {
                "roll_number": current_user.roll_number,
                "data": json.loads(cache.data),
                "scraped_at": str(cache.scraped_at),
                "from_cache": True
            }

    # Cache is old or doesn't exist — scrape fresh data
    return fetch_fresh_attendance(current_user, db)

# --- FORCE REFRESH ---
@router.get("/attendance/refresh")
def refresh_attendance(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return fetch_fresh_attendance(current_user, db)

# --- SHARED SCRAPING LOGIC ---
def fetch_fresh_attendance(current_user: User, db: Session):
    from auth import pwd_context
    
    # Get plain password — we need it to scrape NRCM portal
    user = db.query(User).filter(
        User.roll_number == current_user.roll_number
    ).first()

    # Scrape fresh data
    try:
        from auth import decrypt_password
        plain_password = decrypt_password(current_user.scraper_password)
        data = scrape_attendance(current_user.roll_number, plain_password)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraping failed: {str(e)}")

    # Save or update cache
    cache = db.query(AttendanceCache).filter(
        AttendanceCache.roll_number == current_user.roll_number
    ).first()

    if cache:
        cache.data = json.dumps(data)
        cache.scraped_at = datetime.now(timezone.utc)
    else:
        cache = AttendanceCache(
            roll_number=current_user.roll_number,
            data=json.dumps(data),
            scraped_at=datetime.now(timezone.utc)
        )
        db.add(cache)

    db.commit()

    return {
        "roll_number": current_user.roll_number,
        "data": data,
        "scraped_at": str(datetime.now(timezone.utc)),
        "from_cache": False
    }