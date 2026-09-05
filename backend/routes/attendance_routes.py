from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import AttendanceCache, User
from auth import verify_token
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timezone, timedelta
import json
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scraper import get_attendance as scrape_attendance
from refresh_guard import check_refresh_allowed

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

CACHE_HOURS = int(os.getenv("CACHE_HOURS", 4))

# IST offset — Render servers run UTC, but our college-hours/night-window
# rules are defined in IST (UTC+5:30). Must convert explicitly.
IST_OFFSET = timedelta(hours=5, minutes=30)

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
# No refresh_guard here — normal page loads always use cache.
# Guard applies ONLY to the explicit Force Refresh button below.
@router.get("/attendance")
def get_attendance(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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

    return fetch_fresh_attendance(current_user, db)

# --- FORCE REFRESH ---
# This is the ONLY endpoint with refresh_guard restrictions.
# College hours (Mon-Sat 9:30-16:30): 60-min rolling cooldown.
# Night window: one refresh per window.
@router.get("/attendance/refresh")
def refresh_attendance(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Convert server UTC time to IST before checking windows
    now_ist = (datetime.now(timezone.utc) + IST_OFFSET).replace(tzinfo=None)

    decision = check_refresh_allowed(
        now=now_ist,
        college_last_refresh_at=current_user.college_last_refresh_at,
        night_window_used_key=current_user.night_window_used_key,
    )

    if not decision.allowed:
        raise HTTPException(status_code=429, detail=decision.reason)

    # Atomically claim the refresh slot BEFORE scraping to prevent
    # race conditions (two tabs clicking refresh at the same time).
    if decision.window_type == "college_hours":
        result = db.execute(
            User.__table__.update()
            .where(User.id == current_user.id)
            .where(
                (User.college_last_refresh_at.is_(None))
                | (User.college_last_refresh_at == current_user.college_last_refresh_at)
            )
            .values(college_last_refresh_at=now_ist)
        )
    else:  # night window
        result = db.execute(
            User.__table__.update()
            .where(User.id == current_user.id)
            .where(
                (User.night_window_used_key.is_(None))
                | (User.night_window_used_key == current_user.night_window_used_key)
            )
            .values(night_window_used_key=decision.night_window_key)
        )
    db.commit()

    if result.rowcount == 0:
        # Another tab/request claimed this slot first
        raise HTTPException(
            status_code=429,
            detail="Another request already used this refresh. Please try again later.",
        )

    return fetch_fresh_attendance(current_user, db)

# --- SHARED SCRAPING LOGIC ---
def fetch_fresh_attendance(current_user: User, db: Session):
    try:
        from auth import decrypt_password
        plain_password = decrypt_password(current_user.scraper_password)
        data = scrape_attendance(current_user.roll_number, plain_password)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraping failed: {str(e)}")

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