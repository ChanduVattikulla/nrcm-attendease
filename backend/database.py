from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv
import os

# Read .env file
load_dotenv()

# Get database URL from .env
DATABASE_URL = os.getenv("DATABASE_URL")
# Render gives URLs starting with "postgres://" but SQLAlchemy 1.4+/2.x
# requires "postgresql://" — fix it automatically here.
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Local fallback: when no Postgres URL is configured, use a SQLite file so the
# app can run without a PostgreSQL server. Postgres URLs are untouched.
if not DATABASE_URL or DATABASE_URL.startswith("sqlite"):
    DATABASE_URL = DATABASE_URL or "sqlite:///./attendance.db"

# SQLite connections must be shared across FastAPI's worker threads
engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

# Create connection to the database
engine = create_engine(DATABASE_URL, **engine_kwargs)

# Each request to our API gets its own database session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all our database table definitions
class Base(DeclarativeBase):
    pass

# This function gives a database session to any file that needs it
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()