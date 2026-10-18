from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

# Supabase already provides a transaction pooler. NullPool prevents every Vercel
# function instance from keeping its own long-lived SQLAlchemy connection pool.
engine = create_engine(
    settings.sqlalchemy_database_uri,
    pool_pre_ping=True,
    poolclass=NullPool,
    # Supabase Supavisor transaction mode does not support prepared statements.
    connect_args={"prepare_threshold": None},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database() -> bool:
    with engine.connect() as connection:
        return connection.execute(text("SELECT 1")).scalar_one() == 1
