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
# NOTE: This endpoint's behavior is intentionally UNCHANGED by the
# Force Refresh restrictions. Even if the cache has expired and this
# triggers a fresh scrape, that's existing CACHE_HOURS behavior and is
# not subject to the college-hours/night-window rules — those rules
# apply ONLY to the explicit /attendance/refresh button below.
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
                "scraped_at": str(cache.scraped_at), # remove + timedelta(...)
                "from_cache": True
            }

    # Cache is old or doesn't exist — scrape fresh data
    # (no refresh_guard check here — see note above)
    return fetch_fresh_attendance(current_user, db)

# --- FORCE REFRESH ---
# This is the ONLY endpoint subject to the college-hours/night-window
# restrictions. See refresh_guard.py for the full rule definitions.
@router.get("/attendance/refresh")
def refresh_attendance(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).replace(tzinfo=None)  # naive local time — server is expected to run in IST

    decision = check_refresh_allowed(
        now=now,
        college_last_refresh_at=current_user.college_last_refresh_at,
        night_window_used_key=current_user.night_window_used_key,
    )

    if not decision.allowed:
        raise HTTPException(status_code=429, detail=decision.reason)

    # Atomically claim this refresh BEFORE scraping, so two concurrent
    # requests (e.g. two browser tabs) can't both pass the check above
    # and both proceed. Whichever request's UPDATE actually matches a
    # row wins; the loser sees rowcount == 0 and is rejected.
    #
    # We build the WHERE clause based on the window type so the
    # condition exactly mirrors what check_refresh_allowed() just
    # verified — this prevents a race where the state changed between
    # the check and this update.
    if decision.window_type == "college_hours":
        result = db.execute(
            User.__table__.update()
            .where(User.id == current_user.id)
            .where(
                (User.college_last_refresh_at.is_(None))
                | (User.college_last_refresh_at == current_user.college_last_refresh_at)
            )
            .values(college_last_refresh_at=now)
        )
    else:  # night
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
        # Someone else (another tab/request) claimed this refresh slot
        # first, in the brief window between our check and our update.
        raise HTTPException(
            status_code=429,
            detail="Another request already used this refresh. Please try again later.",
        )

    return fetch_fresh_attendance(current_user, db)

# --- SHARED SCRAPING LOGIC ---
def fetch_fresh_attendance(current_user: User, db: Session):
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
        "scraped_at": str(datetime.now(timezone.utc)),   # remove + timedelta(...)
        "from_cache": False
    }