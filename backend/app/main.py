"""FastAPI application factory for APS Intelligence."""

from contextlib import asynccontextmanager
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import router as api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import AppError
from app.core.logging import configure_logging
from app.database.session import create_database_engine, create_session_factory, verify_database_connection


logger = logging.getLogger(__name__)


def _error_response(code: str, message: str, *, details: object | None = None, status_code: int) -> JSONResponse:
    error: dict[str, object] = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return JSONResponse(status_code=status_code, content={"error": error})


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Prepare storage and verify the configured SQLite connection at startup."""

    settings: Settings = app.state.settings
    settings.ensure_storage_directories()
    active_engine = create_database_engine(settings)
    app.state.engine = active_engine
    app.state.session_factory = create_session_factory(active_engine)
    verify_database_connection(active_engine)
    logger.info("APS Intelligence API started in %s environment", settings.environment)
    try:
        yield
    finally:
        active_engine.dispose()
        logger.info("APS Intelligence API stopped")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create an application instance, optionally with isolated test settings."""

    active_settings = settings or get_settings()
    configure_logging(active_settings.log_level)
    application = FastAPI(
        title=active_settings.app_name,
        version=active_settings.app_version,
        description="Foundation API for APS Intelligence reliability analytics.",
        lifespan=lifespan,
    )
    application.state.settings = active_settings
    application.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.allowed_cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Content-Type", "Authorization"],
    )
    application.include_router(api_router, prefix=active_settings.api_prefix)

    @application.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return _error_response(exc.error_code, exc.detail, status_code=exc.status_code)

    @application.exception_handler(RequestValidationError)
    async def handle_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [{"location": list(error["loc"]), "message": error["msg"], "type": error["type"]} for error in exc.errors()]
        return _error_response("validation_error", "Request validation failed.", details=details, status_code=422)

    @application.exception_handler(StarletteHTTPException)
    async def handle_http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else "Request could not be completed."
        return _error_response("http_error", detail, status_code=exc.status_code)

    @application.exception_handler(SQLAlchemyError)
    async def handle_database_error(_request: Request, exc: SQLAlchemyError) -> JSONResponse:
        logger.exception("Database operation failed", exc_info=exc)
        return _error_response("database_error", "The database operation could not be completed.", status_code=500)

    @application.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled application error", exc_info=exc)
        return _error_response("internal_server_error", "An internal server error occurred.", status_code=500)

    return application


app = create_app()
