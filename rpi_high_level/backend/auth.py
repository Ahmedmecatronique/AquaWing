"""
Authentication Module - Session Management

Provides login/logout functionality with cookie-based session management.
"""

import secrets
from datetime import datetime, timedelta
from fastapi import Response
from typing import Optional


# ============================================================================
# Session Storage
# ============================================================================

# In production, use a real database
# For demo: simple in-memory session store
ACTIVE_SESSIONS = {}

# Session configuration
SESSION_TIMEOUT = 24 * 60 * 60  # 24 hours
COOKIE_NAME = "session_id"


# ============================================================================
# User Database (DEMO ONLY)
# ============================================================================


# In production, use a real database with password hashing (bcrypt, argon2, etc.)
DEMO_USERS = {
    "admin": "admin123",
    "user": "password123",
    "ahmed": "ahmed22k22",
    "amin": "amin123",

}
print("✅ AUTH.PY LOADED - DEMO_USERS =", DEMO_USERS)
print("✅ AUTH.PY FILE =", __file__)

# ============================================================================
# Session Management
# ============================================================================

def create_session(username: str) -> str:
    """
    Create a new session for the given username.
    
    Args:
        username: The authenticated username
        
    Returns:
        session_id: A secure session identifier
    """
    session_id = secrets.token_urlsafe(32)
    
    ACTIVE_SESSIONS[session_id] = {
        "username": username,
        "created_at": datetime.now(),
        "last_accessed": datetime.now(),
    }
    
    print(f"✓ Session created for {username}")
    return session_id


def validate_session(session_id: str) -> Optional[str]:
    """
    Validate a session and return the username if valid.
    
    Args:
        session_id: The session ID to validate
        
    Returns:
        username if valid, None if invalid or expired
    """
    if not session_id or session_id not in ACTIVE_SESSIONS:
        return None
    
    session = ACTIVE_SESSIONS[session_id]
    created_at = session["created_at"]
    
    # Check if session has expired
    if datetime.now() - created_at > timedelta(seconds=SESSION_TIMEOUT):
        del ACTIVE_SESSIONS[session_id]
        print(f"⏱️ Session expired: {session_id}")
        return None
    
    # Update last accessed time
    session["last_accessed"] = datetime.now()
    return session["username"]


def destroy_session(session_id: str) -> bool:
    """
    Destroy a session.
    
    Args:
        session_id: The session ID to destroy
        
    Returns:
        True if successful, False if session not found
    """
    if session_id in ACTIVE_SESSIONS:
        username = ACTIVE_SESSIONS[session_id]["username"]
        del ACTIVE_SESSIONS[session_id]
        print(f"✓ Session destroyed for {username}")
        return True
    return False


# ============================================================================
# Authentication
# ============================================================================

def authenticate_user(username: str, password: str) -> bool:
    username = (username or "").strip()
    password = (password or "").strip()

    print("LOGIN TRY:", repr(username), repr(password))
    print("EXPECTED:", DEMO_USERS.get(username))

    if username not in DEMO_USERS:
        print(f"❌ User not found: {username}")
        return False
    if DEMO_USERS[username] != password:
        print(f"❌ Invalid password for {username}")
        return False
    print(f"✓ User authenticated: {username}")
    return True



def set_session_cookie(response: Response, session_id: str):
    """
    Set a secure session cookie on the response.
    
    Args:
        response: FastAPI Response object
        session_id: The session ID to store
    """
    response.set_cookie(
        key=COOKIE_NAME,
        value=session_id,
        max_age=SESSION_TIMEOUT,
        httponly=True,  # ✓ Important: prevent JS access
        samesite="lax",  # ✓ CSRF protection
        # secure=True,  # Uncomment for HTTPS only
    )


def delete_session_cookie(response: Response):
    """
    Delete the session cookie from the response.
    
    Args:
        response: FastAPI Response object
    """
    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        samesite="lax",
    )
