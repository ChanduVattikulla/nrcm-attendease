from fastapi import FastAPI, Request, Response
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
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# --- CUSTOM RATE LIMIT ERROR HANDLER ---
@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many attempts. Please try again later."}
    )

# --- CUSTOM VALIDATION ERROR HANDLER ---
@app.exception_handler(RequestValidationError)
def validation_error_handler(request: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        msg = err.get("msg", "Invalid input")
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        messages.append(msg)

    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(messages) if messages else "Invalid input"}
    )

# --- CORS SETUP ---
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
# Handle HEAD for UptimeRobot free tier + GET for browser testing
@app.api_route("/health", methods=["GET", "HEAD"])
@limiter.limit("100/minute")
async def health_check(request: Request):
    if request.method == "HEAD":
        return Response(status_code=200)
    return JSONResponse(
        status_code=200,
        content={"status": "awake", "message": "NRCM Attendance Tracker is warm and ready!"}
    )