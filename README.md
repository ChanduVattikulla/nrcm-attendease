# NRCM AttendEase

A full-stack web app that scrapes NRCM student portal attendance data and presents it through an interactive dashboard — with attendance tracking, a skip calculator, calendar-based attendance planning, and secure JWT authentication.

## Features

- 🔐 Secure login & registration (JWT auth, bcrypt password hashing, rate limiting)
- 📊 Dashboard with semester, monthly, and date-wise attendance breakdown
- 🎯 Skip Calculator — find out how many classes you can skip (or need to attend) to hit a target attendance %
- 📅 Calendar Planner — plan future attendance day-by-day and see projected percentage
- 🌙 Dark/Light theme toggle
- ⚡ Cached attendance data (configurable refresh window) with manual force-refresh

## Tech Stack

**Backend:** FastAPI, PostgreSQL, SQLAlchemy, JWT (python-jose), bcrypt (passlib), slowapi (rate limiting)
**Frontend:** Vanilla HTML / CSS / JavaScript (no framework)
**Scraping:** Requests + BeautifulSoup4

## Project Structure

```
nrcm-attendance/
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── auth.py               # Password hashing, JWT, encryption
│   ├── database.py           # PostgreSQL connection
│   ├── models.py              # SQLAlchemy models
│   ├── schemas.py             # Pydantic request/response schemas
│   ├── scraper.py             # NRCM portal scraper
│   └── routes/
│       ├── auth_routes.py     # /login, /register
│       └── attendance_routes.py  # /attendance, /attendance/refresh
└── frontend/
    ├── index.html             # Login / Register page
    ├── dashboard.html          # Main attendance dashboard
    └── calendar.html           # Attendance planner calendar
```

## Local Setup

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

Create a `.env` file in `backend/` with:
```
DATABASE_URL=postgresql://user:password@localhost:5432/nrcm_attendance
SECRET_KEY=your-random-64-character-hex-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
CACHE_HOURS=4
ALLOWED_ORIGINS=*
```

Run the server:
```bash
uvicorn main:app --reload
```

### Frontend
Just open `frontend/index.html` in your browser, or use VS Code's Live Server extension.

## Security Notes

- Passwords are hashed with bcrypt before storage
- A separate password copy is encrypted (Fernet) solely to enable re-scraping the NRCM portal on the user's behalf
- Login/register endpoints are rate-limited (5 requests/minute per IP)
- Generic error messages prevent account enumeration
- JWT tokens expire automatically; frontend handles expiry with auto-logout

## Disclaimer

This project is an independent tool built for personal/educational use and is not officially affiliated with NRCM College. Use responsibly with your own credentials only.