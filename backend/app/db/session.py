from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings


# Defer connection configuration until a DB-backed operation needs it.
# This allows /api/ping to work and /api/health to report "degraded"
# rather than crashing import-time when DATABASE_URL is not configured.
@lru_cache(maxsize=1)
def _get_engine() -> Engine:
    return create_engine(
        settings.sqlalchemy_database_uri,
        pool_pre_ping=True,
        poolclass=NullPool,
        # Supabase Supavisor transaction mode does not support prepared statements.
        connect_args={"prepare_threshold": None},
    )


# Bind the engine per session, so importing routers never requires credentials.
SessionLocal = sessionmaker(autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal(bind=_get_engine())
    try:
        yield db
    finally:
        db.close()


def check_database() -> bool:
    with _get_engine().connect() as connection:
        return connection.execute(text("SELECT 1")).scalar_one() == 1
