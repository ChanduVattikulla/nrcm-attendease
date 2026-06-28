from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from database import Base

# --- USERS TABLE ---
# Stores student login information
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    roll_number = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)  # bcrypt hash for login verification
    scraper_password = Column(String, nullable=False)  # fernet encrypted for scraping
    created_at = Column(DateTime, default=func.now())

# --- ATTENDANCE CACHE TABLE ---
# Stores scraped attendance data temporarily
class AttendanceCache(Base):
    __tablename__ = "attendance_cache"

    id = Column(Integer, primary_key=True, index=True)
    roll_number = Column(String, index=True, nullable=False)
    data = Column(Text, nullable=False)  # stores full attendance JSON as text
    scraped_at = Column(DateTime, default=func.now())  # when was it last scraped