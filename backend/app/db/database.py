from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

url = settings.sync_database_url
engine_kwargs = {"pool_pre_ping": True}

if url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    # pool_pre_ping is not supported for NullPool/StaticPool in SQLite in some versions
    engine_kwargs.pop("pool_pre_ping", None)

engine = create_engine(url, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
