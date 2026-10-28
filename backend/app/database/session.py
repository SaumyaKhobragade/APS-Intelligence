"""SQLAlchemy engine, session factory and FastAPI dependency."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from fastapi import Request
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings


def create_database_engine(settings: Settings) -> Engine:
    """Build an engine from settings without embedding environment policy."""

    connect_args = {"check_same_thread": False, "timeout": 30.0} if settings.database_url.startswith("sqlite") else {}
    active_engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
    if settings.database_url.startswith("sqlite"):
        from sqlalchemy import event

        @event.listens_for(active_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return active_engine


engine = create_database_engine(get_settings())


def create_session_factory(active_engine: Engine):
    """Create a request-session factory for a supplied engine."""

    return sessionmaker(bind=active_engine, autoflush=False, autocommit=False, expire_on_commit=False)


SessionLocal = create_session_factory(engine)


def get_db(request: Request) -> Generator[Session, None, None]:
    """Yield one request-scoped SQLAlchemy session and always close it."""

    session_factory = getattr(getattr(request, "app", None), "state", None)
    session_factory = getattr(session_factory, "session_factory", SessionLocal)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


def verify_database_connection(active_engine: Engine = engine) -> None:
    """Open and close a connection as a startup readiness check."""

    with active_engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")
