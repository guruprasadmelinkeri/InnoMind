from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# Create SQLAlchemy engine using settings
engine = create_engine(
    settings.sync_database_url,
    pool_pre_ping=True
)

# Create SessionLocal class for DB sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base declarative class for future models
Base = declarative_base()

# Dependency to get DB session in FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
