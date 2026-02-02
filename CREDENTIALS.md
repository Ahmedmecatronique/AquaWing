# 🔐 Credentials & User Management

## Current Demo Users

### Built-in Demo Users

These users are **hardcoded** in `backend/auth.py` for demonstration purposes.

```python
DEMO_USERS = {
    "admin": "admin123",
    "user": "password123",
}
```

### How to Use

#### User 1: Admin
```
Username: admin
Password: admin123
Role:     Administrator
Access:   Full access to all features
```

#### User 2: Regular User
```
Username: user
Password: password123
Role:     Standard operator
Access:   Full access to all features
```

---

## Changing Demo Credentials (Temporary)

### To modify hardcoded passwords

Edit `backend/auth.py`:

```python
# Find this section:
DEMO_USERS = {
    "admin": "admin123",
    "user": "password123",
}

# Change to:
DEMO_USERS = {
    "admin": "your_new_password",
    "user": "another_password",
}
```

Then restart the server:
```bash
Ctrl + C
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8000
```

---

## Adding New Demo Users

Edit `backend/auth.py`:

```python
DEMO_USERS = {
    "admin": "admin123",
    "user": "password123",
    "operator1": "op123456",        # New user
    "operator2": "op654321",        # New user
}
```

---

## ⚠️ IMPORTANT: For Production

### Current Issues (DEMO ONLY)

❌ **Plaintext passwords** - Anyone with access to the code can see them
❌ **No hashing** - Passwords are stored as-is
❌ **In-memory storage** - Users lost on server restart
❌ **No password reset** - Requires code modification
❌ **No audit logs** - No tracking of who logged in when

### Required for Production

```bash
# 1. Install password hashing library
pip install bcrypt

# 2. Or use argon2
pip install argon2-cffi
```

### Example: Hash Passwords with Bcrypt

```python
import bcrypt

def hash_password(password: str) -> str:
    """Hash password for storage."""
    return bcrypt.hashpw(
        password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash."""
    return bcrypt.checkpw(
        password.encode('utf-8'),
        hashed.encode('utf-8')
    )

# Store hashed passwords:
USERS_DB = {
    "admin": hash_password("admin123"),
    "user": hash_password("password123"),
}

# Use in authenticate_user():
def authenticate_user(username: str, password: str) -> bool:
    if username not in USERS_DB:
        return False
    return verify_password(password, USERS_DB[username])
```

### Move to Database

Instead of hardcoded dict:

```python
# Option 1: SQLite (simplest)
import sqlite3

conn = sqlite3.connect('users.db')
c = conn.cursor()
c.execute('''CREATE TABLE users
             (username TEXT PRIMARY KEY, 
              password_hash TEXT)''')

# Option 2: PostgreSQL (recommended)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql://user:password@localhost/drone"
engine = create_engine(DATABASE_URL)

# Option 3: MongoDB (flexible)
from pymongo import MongoClient
client = MongoClient("mongodb://localhost:27017/")
```

---

## Session Management

### How Sessions Work Currently

1. **User logs in** → `auth.create_session(username)`
2. **Session created** → Unique token generated with `secrets.token_urlsafe(32)`
3. **Stored in memory** → `ACTIVE_SESSIONS[token] = {username, created_at, ...}`
4. **Cookie set** → HttpOnly cookie with token value
5. **Validation** → `auth.validate_session(token)` checks expiry + returns username

### Session Timeout

```python
# Current: 24 hours
SESSION_TIMEOUT = 24 * 60 * 60  # seconds

# In backend/auth.py, line ~30
# Change this value and restart server
```

### Session Persistence (Production)

**Currently:** Sessions lost on server restart (stored in memory)

**For persistence, add:**

```python
# Option 1: Redis (fast, recommended)
import redis
cache = redis.Redis(host='localhost', port=6379)

def create_session(username: str) -> str:
    session_id = secrets.token_urlsafe(32)
    cache.setex(session_id, SESSION_TIMEOUT, username)
    return session_id

def validate_session(session_id: str) -> Optional[str]:
    return cache.get(session_id)

# Option 2: Database
def create_session(username: str) -> str:
    session_id = secrets.token_urlsafe(32)
    db.sessions.insert_one({
        "session_id": session_id,
        "username": username,
        "created_at": datetime.now(),
        "expires_at": datetime.now() + timedelta(seconds=SESSION_TIMEOUT)
    })
    return session_id
```

---

## Cookie Security

### Current Configuration

```python
# backend/auth.py
response.set_cookie(
    key="session_id",
    value=session_id,
    max_age=SESSION_TIMEOUT,        # 24 hours
    httponly=True,                  # ✓ Cannot be accessed by JS
    samesite="lax",                 # ✓ CSRF protection
    # secure=True,                  # ⚠️ Uncomment for HTTPS only
)
```

### For Production (HTTPS)

```python
# Uncomment this line:
secure=True,  # Only send over HTTPS

# Your config becomes:
response.set_cookie(
    key="session_id",
    value=session_id,
    max_age=SESSION_TIMEOUT,
    httponly=True,
    samesite="strict",  # More strict than "lax"
    secure=True,        # ✅ HTTPS only
)
```

---

## Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ User Visits http://172.20.10.5:8000/login              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Form Displayed                                          │
│ - Username field (empty)                               │
│ - Password field (empty)                               │
│ - [Login] button                                       │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ User Enters:                                            │
│ Username: admin                                         │
│ Password: admin123                                      │
│ Clicks [Login]                                          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Browser: POST /login                                    │
│ {"username": "admin", "password": "admin123"}          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Server: backend/auth.py                                 │
│ 1. Check: "admin" in DEMO_USERS? YES ✓                │
│ 2. Check: DEMO_USERS["admin"] == "admin123"? YES ✓    │
│ 3. Generate token: secrets.token_urlsafe(32)           │
│    → "kK-_L2j9K8jK_L2j9K8jK_L2j9K8jK_L2j9K8j"        │
│ 4. Store session:                                      │
│    ACTIVE_SESSIONS["kK-_L2..."] = {                   │
│      "username": "admin",                              │
│      "created_at": datetime.now(),                     │
│      "last_accessed": datetime.now()                   │
│    }                                                   │
│ 5. Set cookie:                                         │
│    Set-Cookie: session_id=kK-_L2...; HttpOnly          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Browser: Receives 200 OK + Cookie                       │
│ Auto-Redirect: GET /map                                 │
│ Cookie sent: session_id=kK-_L2...                      │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Server: GET /map                                        │
│ 1. Extract cookie: session_id = "kK-_L2..."           │
│ 2. Validate: auth.validate_session("kK-_L2...")       │
│    → Check if in ACTIVE_SESSIONS ✓                    │
│    → Check expiry (24h) ✓                             │
│    → Return username: "admin" ✓                       │
│ 3. Serve: map.html                                     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Browser: Display map.html                               │
│ - Load Leaflet CSS (CDN)                               │
│ - Load map.js                                          │
│ - map.js: Connect WebSocket with cookie                │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Server: WebSocket /ws                                   │
│ 1. Client connects with cookie                         │
│ 2. Extract: session_id = "kK-_L2..."                  │
│ 3. Validate: auth.validate_session("kK-_L2...")      │
│    → Returns username: "admin" ✓                      │
│ 4. Accept connection                                   │
│ 5. Start broadcasting telemetry every 0.5s            │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Browser: Display Map + HUD + Live Telemetry            │
│ ✓ Login successful                                      │
│ ✓ User is authenticated                                │
│ ✓ Receiving real-time data                             │
│ ✓ Session valid until expiry or logout                │
└─────────────────────────────────────────────────────────┘
```

---

## Testing Credentials

### Via cURL

```bash
# Login
curl -X POST http://172.20.10.5:8000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  -c cookies.txt

# If successful, cookies.txt will contain:
# session_id=<token>

# Access protected route with cookies
curl http://172.20.10.5:8000/map -b cookies.txt

# Logout
curl http://172.20.10.5:8000/logout -b cookies.txt
```

### Via Python

```python
import requests

# Create session
session = requests.Session()

# Login
response = session.post(
    'http://172.20.10.5:8000/login',
    json={'username': 'admin', 'password': 'admin123'}
)
print(response.status_code)  # Should be 200

# Access protected route (cookie sent automatically)
response = session.get('http://172.20.10.5:8000/map')
print('map.html' in response.text)  # Should be True

# Logout
response = session.get('http://172.20.10.5:8000/logout')
print(response.status_code)  # Should be 302 (redirect)
```

---

## Security Best Practices

### ✅ Already Implemented
- HttpOnly cookies (JavaScript cannot access)
- SameSite protection (CSRF prevention)
- Session timeout (24 hours)
- Secure tokens (secrets.token_urlsafe)

### ⚠️ Not Yet Implemented
- Password hashing
- HTTPS/TLS
- Rate limiting on login
- Account lockout after failed attempts
- Audit logging
- 2FA / MFA

### 🚀 For Production Roadmap

1. **Week 1:** Add password hashing with bcrypt
2. **Week 2:** Move to database (PostgreSQL)
3. **Week 3:** Enable HTTPS with Let's Encrypt
4. **Week 4:** Add rate limiting
5. **Week 5:** Implement 2FA with TOTP

---

## Environment Variables (Future)

For production, use environment variables instead of hardcoding:

```bash
# Create .env file
SECRET_KEY=your-random-secret-here
DATABASE_URL=postgresql://user:pass@localhost/drone
SESSION_TIMEOUT=86400
HTTPS_ONLY=true
DEBUG=false
```

Load in code:

```python
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")
SESSION_TIMEOUT = int(os.getenv("SESSION_TIMEOUT", 86400))
```

---

## Quick Reference

### Current Demo Users
```
admin     / admin123
user      / password123
```

### How to Change Password
```bash
# Edit backend/auth.py
# Change DEMO_USERS dictionary
# Restart server (Ctrl+C, then run again)
```

### How to Add User
```bash
# Edit backend/auth.py
DEMO_USERS = {
    "admin": "admin123",
    "newuser": "newpass123",  # Add here
}
# Restart server
```

### Session Duration
```
24 hours (86400 seconds)
Configured in: backend/auth.py line ~20
Change: SESSION_TIMEOUT = value_in_seconds
```

---

**Remember: This is a DEMO setup. For production, implement proper security measures!**
