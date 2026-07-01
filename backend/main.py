from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from database import engine, Base
from routes import auth_routes, attendance_routes
from dotenv import load_dotenv

# --- RATE LIMITING IMPORTS ---
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv()

# Create all database tables if they don't exist
Base.metadata.create_all(bind=engine)

# Create FastAPI app
app = FastAPI(title="NRCM Attendance Tracker")

# --- RATE LIMITER SETUP ---
# get_remote_address identifies WHO is making the request (their IP address)
# This is how slowapi knows "this IP tried 5 times already"
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# --- CUSTOM RATE LIMIT ERROR HANDLER ---
# We do NOT use slowapi's default handler because it leaks the exact
# limit ("5 per 1 minute") in the response — that helps an attacker
# time their next attempt. We return a vague message instead.
@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many attempts. Please try again later."}
    )

# --- CUSTOM VALIDATION ERROR HANDLER ---
# FastAPI's default validation error response includes internal details
# (pydantic version, error type, docs URL, raw input echoed back).
# We strip all that down to just the plain message(s) we wrote ourselves.
@app.exception_handler(RequestValidationError)
def validation_error_handler(request: Request, exc: RequestValidationError):
    # Pull out just the human-readable messages we wrote in our @field_validator functions
    messages = []
    for err in exc.errors():
        msg = err.get("msg", "Invalid input")
        # Pydantic prefixes our custom messages with "Value error, " — strip that off
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        messages.append(msg)

    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(messages) if messages else "Invalid input"}
    )

# --- CORS SETUP ---
# We read allowed origins from .env instead of hardcoding them.
# Locally this is your Live Server / browser origin (e.g. http://127.0.0.1:5500).
# In production, set ALLOWED_ORIGINS to your real frontend domain
# (e.g. https://your-project-name.vercel.app) — never use "*" once deployed,
# since that would let any website on the internet call your API.
import os
origins_env = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect our routes
app.include_router(auth_routes.router, tags=["Auth"])
app.include_router(attendance_routes.router, tags=["Attendance"])

# Test if server is running
@app.get("/")
def root():
    return {"message": "NRCM Attendance Tracker API is running!"}
    # --- UPTIMEROBOT SIDE-DOOR ---
# This route bypasses the database and the scraper to keep Render awake.
# We apply a generous limit block to ensure UptimeRobot never gets blocked.
@app.get("/health")
@limiter.limit("100/minute") # Setting a massive limit so UptimeRobot never trips your guard
def health_check(request: Request):
    return {"status": "awake", "message": "NRCM Attendance Tracker is warm and ready!"}