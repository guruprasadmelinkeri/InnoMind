"""Create the initial MediRoute administrator without changing application data."""
import getpass
import sys
from sqlalchemy import func
from app.core.auth import hash_password
from app.db.database import SessionLocal
from app.models.account import Account

def main() -> None:
    email = input("Admin email: ").strip().lower()
    password = getpass.getpass("Admin password (10+ characters): ")
    name = input("Display name: ").strip() or "MediRoute Admin"
    if len(password) < 10:
        sys.exit("Password must contain at least 10 characters")
    db = SessionLocal()
    try:
        if db.query(Account).filter(func.lower(Account.email) == email).first():
            sys.exit("An account with this email already exists")
        db.add(Account(email=email, password_hash=hash_password(password), role="ADMIN", display_name=name))
        db.commit()
        print("Administrator account created.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
