import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set")

# Pool sized for 100 concurrent users across 2-4 uvicorn workers.
# Each worker holds up to 10 connections; overflow allows bursts.
_engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,          # drops stale connections before use
    pool_recycle=1800,           # recycle connections every 30 min
)
_SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
Base = declarative_base()


def get_db():
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()
