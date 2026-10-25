"""SQLAlchemy declarative base for future metadata models."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class imported by Alembic and future ORM models."""
