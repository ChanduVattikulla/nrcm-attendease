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

# Create connection to PostgreSQL
engine = create_engine(DATABASE_URL)

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