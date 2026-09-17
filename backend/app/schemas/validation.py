"""Input Validation & Security Sanitization Models.

Protects against:
- SQL Injection (detects SQL meta-characters and signature patterns)
- Cross-Site Scripting (XSS) (detects and strips script tags, event handlers)
- Type tampering, out-of-bounds numbers, and malformed strings
"""

from __future__ import annotations

import re
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# ---------------------------------------------------------------------------
# Supported Games Enum
# ---------------------------------------------------------------------------


class SupportedGame(StrEnum):
    VALORANT = "Valorant"
    CS2 = "CS2"
    OW2 = "OW2"

    @classmethod
    def _missing_(cls, value: object) -> Any:
        if isinstance(value, str):
            val_clean = value.strip().lower()
            mapping = {
                "valorant": cls.VALORANT,
                "cs2": cls.CS2,
                "cs:go": cls.CS2,
                "counter-strike 2": cls.CS2,
                "counter-strike": cls.CS2,
                "ow2": cls.OW2,
                "overwatch": cls.OW2,
                "overwatch 2": cls.OW2,
            }
            if val_clean in mapping:
                return mapping[val_clean]
        return None


# ---------------------------------------------------------------------------
# Sanitization & Security Checks
# ---------------------------------------------------------------------------

SQL_INJECTION_PATTERNS = [
    re.compile(r"(--|/\*|\*/)", re.IGNORECASE),
    re.compile(
        r";\s*(drop|insert|delete|update|alter|create|truncate|exec|execute)\b", re.IGNORECASE
    ),
    re.compile(r"\bunion\s+(all\s+)?select\b", re.IGNORECASE),
    re.compile(r"\b(or|and)\s+[\'\"]?\d+[\'\"]?\s*=\s*[\'\"]?\d+[\'\"]?", re.IGNORECASE),
    re.compile(r"\b(exec|execute)\s*\(", re.IGNORECASE),
    re.compile(r"\bxp_[a-zA-Z0-9_]+", re.IGNORECASE),
]

XSS_PATTERNS = [
    re.compile(r"<\s*script[^>]*>", re.IGNORECASE),
    re.compile(r"<\s*/\s*script\s*>", re.IGNORECASE),
    re.compile(r"<\s*iframe[^>]*>", re.IGNORECASE),
    re.compile(r"javascript\s*:", re.IGNORECASE),
    re.compile(r"on(load|error|click|mouseover|submit|focus|blur)\s*=", re.IGNORECASE),
]

HTML_TAG_CLEANER = re.compile(r"<[^<]+?>")


def sanitize_string(value: str) -> str:
    """Strip leading/trailing whitespace and strip raw HTML tags."""
    if not isinstance(value, str):
        return value
    # Remove null bytes
    val = value.replace("\x00", "")
    # Strip HTML tags
    val = HTML_TAG_CLEANER.sub("", val)
    # Strip leading/trailing whitespaces
    return val.strip()


def check_sql_injection(value: str, field_name: str = "Input") -> str:
    """Verify input does not contain SQL injection signatures."""
    if not isinstance(value, str):
        return value
    for pattern in SQL_INJECTION_PATTERNS:
        if pattern.search(value):
            raise ValueError(
                f"{field_name} contains invalid characters or disallowed SQL patterns."
            )
    return value


def check_xss(value: str, field_name: str = "Input") -> str:
    """Verify input does not contain malicious script or event handler patterns."""
    if not isinstance(value, str):
        return value
    for pattern in XSS_PATTERNS:
        if pattern.search(value):
            raise ValueError(f"{field_name} contains disallowed script or HTML tags.")
    return value


# ---------------------------------------------------------------------------
# 1. Tournament Creation Validation Model
# ---------------------------------------------------------------------------


class CreateTournamentInput(BaseModel):
    """POST /api/v1/tournaments validation.

    - tournament_name: string, 3-50 chars, alphanumeric + spaces only
    - entry_fee: number, 0 to 100,000
    - max_teams: number, 2 to 128
    - game: enum: Valorant, CS2, OW2
    """

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    tournament_name: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Tournament name (3-50 chars, alphanumeric + spaces)",
    )
    entry_fee: float = Field(
        ...,
        ge=0,
        le=100000,
        description="Entry fee amount in INR (0 to 100,000)",
    )
    max_teams: int = Field(
        ...,
        ge=2,
        le=128,
        description="Maximum teams capacity (2 to 128)",
    )
    game: SupportedGame = Field(
        ...,
        description="Supported tournament esports game: Valorant, CS2, or OW2",
    )
    description: str | None = Field(default=None, max_length=2000)
    rules: str | None = Field(default=None, max_length=5000)

    @field_validator("tournament_name")
    @classmethod
    def validate_tournament_name(cls, v: str) -> str:
        clean = sanitize_string(v)
        check_xss(clean, "Tournament name")
        check_sql_injection(clean, "Tournament name")
        if not re.match(r"^[a-zA-Z0-9 ]+$", clean):
            raise ValueError(
                "Tournament name must only contain alphanumeric characters and spaces."
            )
        if len(clean) < 3 or len(clean) > 50:
            raise ValueError("Tournament name must be between 3 and 50 characters.")
        return clean

    @field_validator("description", "rules")
    @classmethod
    def validate_text_fields(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = sanitize_string(v)
        check_xss(clean, "Text content")
        check_sql_injection(clean, "Text content")
        return clean


# ---------------------------------------------------------------------------
# 2. Team Creation Validation Model
# ---------------------------------------------------------------------------


class CreateTeamInput(BaseModel):
    """POST /api/v1/teams validation.

    - team_name: string, 3-30 chars
    - captain_id: UUID
    - game: enum: Valorant, CS2, OW2
    """

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    team_name: str = Field(
        ...,
        min_length=3,
        max_length=30,
        description="Team name (3-30 chars, letters, numbers, spaces, underscores, hyphens)",
    )
    captain_id: UUID = Field(
        ...,
        description="Valid UUID of the team captain",
    )
    game: SupportedGame = Field(
        ...,
        description="Game: Valorant, CS2, or OW2",
    )
    tag: str | None = Field(
        default=None,
        min_length=2,
        max_length=5,
        description="Optional team tag (2-5 chars, uppercase alphanumeric)",
    )

    @field_validator("team_name")
    @classmethod
    def validate_team_name(cls, v: str) -> str:
        clean = sanitize_string(v)
        check_xss(clean, "Team name")
        check_sql_injection(clean, "Team name")
        if not re.match(r"^[a-zA-Z0-9 _-]+$", clean):
            raise ValueError(
                "Team name must contain only letters, numbers, spaces, underscores, or hyphens."
            )
        if len(clean) < 3 or len(clean) > 30:
            raise ValueError("Team name must be between 3 and 30 characters.")
        return clean

    @field_validator("tag")
    @classmethod
    def validate_team_tag(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = sanitize_string(v).upper()
        if not re.match(r"^[A-Z0-9]+$", clean):
            raise ValueError("Team tag must be 2-5 uppercase alphanumeric characters.")
        return clean


# ---------------------------------------------------------------------------
# 3. Payment Order Validation Model
# ---------------------------------------------------------------------------


class CreatePaymentOrderInput(BaseModel):
    """POST /api/v1/payments/order validation.

    - tournament_id: UUID
    - amount: number, 1 to 100,000
    - user_id: UUID
    """

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    tournament_id: UUID = Field(
        ...,
        description="Valid tournament UUID",
    )
    amount: float = Field(
        ...,
        ge=1,
        le=100000,
        description="Payment amount in INR (1 to 100,000)",
    )
    user_id: UUID = Field(
        ...,
        description="Valid payer user UUID",
    )


# ---------------------------------------------------------------------------
# 4. User Signup Validation Model
# ---------------------------------------------------------------------------

PASSWORD_UPPERCASE_RE = re.compile(r"[A-Z]")
PASSWORD_LOWERCASE_RE = re.compile(r"[a-z]")
PASSWORD_DIGIT_RE = re.compile(r"\d")
PASSWORD_SYMBOL_RE = re.compile(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?]")


class SignupInput(BaseModel):
    """POST /api/v1/auth/signup validation.

    - email: valid email, < 255 chars
    - password: 8-128 chars, must have upper, lower, number, symbol
    - username: 3-30 chars, alphanumeric + underscore only
    """

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    email: EmailStr = Field(
        ...,
        max_length=254,
        description="Valid email address (< 255 characters)",
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="Strong password (8-128 chars with upper, lower, digit, symbol)",
    )
    username: str = Field(
        ...,
        min_length=3,
        max_length=30,
        description="Username (3-30 chars, alphanumeric + underscore only)",
    )
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
