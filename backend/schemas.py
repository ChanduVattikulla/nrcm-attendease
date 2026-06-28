from pydantic import BaseModel, field_validator

# --- AUTH SCHEMAS ---

# What we expect when student registers
class RegisterRequest(BaseModel):
    roll_number: str
    password: str

    # Trim whitespace and enforce sane length limits.
    # We do NOT force uppercase — roll numbers stay exactly as the student types them.
    @field_validator("roll_number")
    @classmethod
    def validate_roll_number(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5 or len(v) > 15:
            raise ValueError("Roll number must be between 5 and 15 characters")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v.strip()) == 0:
            raise ValueError("Password cannot be empty")
        if len(v) > 100:
            raise ValueError("Password is too long")
        return v

# What we expect when student logs in
class LoginRequest(BaseModel):
    roll_number: str
    password: str

    @field_validator("roll_number")
    @classmethod
    def validate_roll_number(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5 or len(v) > 15:
            raise ValueError("Roll number must be between 5 and 15 characters")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v.strip()) == 0:
            raise ValueError("Password cannot be empty")
        if len(v) > 100:
            raise ValueError("Password is too long")
        return v

# What we send back after successful login
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# --- ATTENDANCE SCHEMAS ---

# What we send back when attendance is requested
class AttendanceResponse(BaseModel):
    roll_number: str
    data: dict
    scraped_at: str
    from_cache: bool  # tells frontend if this is cached or freshly scraped