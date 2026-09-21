import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.validation import (
    PASSWORD_DIGIT_RE,
    PASSWORD_LOWERCASE_RE,
    PASSWORD_SYMBOL_RE,
    PASSWORD_UPPERCASE_RE,
    check_sql_injection,
    check_xss,
    sanitize_string,
)


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    detail: ErrorDetail | str


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    username: str
    display_name: str | None
    avatar_url: str | None
    bio: str | None
    role: str
    status: str
    email_verified: bool
    created_at: datetime


class UserProfileUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=100)
    avatar_url: str | None = Field(None, max_length=500)
    bio: str | None = Field(None, max_length=2000)


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    email: EmailStr = Field(..., max_length=254)
    username: str = Field(..., min_length=3, max_length=30)
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=50)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        clean = sanitize_string(v)
        check_xss(clean, "Username")
        check_sql_injection(clean, "Username")
        if not re.match(r"^[a-zA-Z0-9_]+$", clean):
            raise ValueError("Username must contain only alphanumeric characters and underscores.")
        if len(clean) < 3 or len(clean) > 30:
            raise ValueError("Username must be between 3 and 30 characters.")
        return clean

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8 or len(v) > 128:
            raise ValueError("Password must be between 8 and 128 characters long.")
        if not PASSWORD_UPPERCASE_RE.search(v):
            raise ValueError("Password must include at least one uppercase letter (A-Z).")
        if not PASSWORD_LOWERCASE_RE.search(v):
            raise ValueError("Password must include at least one lowercase letter (a-z).")
        if not PASSWORD_DIGIT_RE.search(v):
            raise ValueError("Password must include at least one number (0-9).")
        if not PASSWORD_SYMBOL_RE.search(v):
            raise ValueError("Password must include at least one special symbol (!@#$%^&*...).")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SupabaseSession(BaseModel):
    """Supabase auth session issued by the backend auth bridge."""

    access_token: str
    refresh_token: str
    expires_in: int | None = None
    user_id: str | None = None


class AuthResponse(BaseModel):
    user: UserPublic
    message: str = "Authentication successful"
    supabase_session: SupabaseSession | None = None


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class OAuthCallbackResult(BaseModel):
    provider: str
    configured: bool
