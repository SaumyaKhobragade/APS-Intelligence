"""Application exceptions shared by future endpoint and service layers."""


class AppError(Exception):
    """Base error with a safe client-facing message and HTTP status."""

    status_code = 400
    error_code = "application_error"

    def __init__(self, detail: str, *, status_code: int | None = None, details: object | None = None) -> None:
        super().__init__(detail)
        self.detail = detail
        self.details = details
        if status_code is not None:
            self.status_code = status_code


class InvalidRequestError(AppError):
    """Raised when a request is semantically invalid."""

    error_code = "invalid_request"


class ResourceNotFoundError(AppError):
    """Raised when a requested backend resource does not exist."""

    status_code = 404
    error_code = "not_found"


class DatabaseOperationError(AppError):
    """Raised when a repository cannot complete a database operation."""

    status_code = 500
    error_code = "database_error"


class ArtifactUnavailableError(AppError):
    """Raised when a trusted model or policy artifact cannot be loaded."""

    status_code = 503
    error_code = "artifact_unavailable"


class ArtifactCompatibilityError(AppError):
    """Raised when registered metadata and serialized artifacts disagree."""

    status_code = 409
    error_code = "artifact_incompatible"


class PayloadTooLargeError(AppError):
    """Raised when an uploaded request payload exceeds the allowed size limit."""

    status_code = 413
    error_code = "payload_too_large"
