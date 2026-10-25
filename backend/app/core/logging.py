"""Logging configuration for local and deployed API processes."""

import logging
import logging.config


def configure_logging(level: str = "INFO") -> None:
    """Configure concise application logs without exposing request payloads."""

    normalized_level = level.upper()
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
                },
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": "default",
                    "stream": "ext://sys.stderr",
                },
            },
            "root": {"level": normalized_level, "handlers": ["default"]},
        }
    )
