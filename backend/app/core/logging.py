import logging
from typing import Any

try:
    import structlog
except ImportError:
    structlog = None  # type: ignore[assignment]


def configure_logging(environment: str) -> None:
    if structlog is None:
        logging.basicConfig(level=logging.DEBUG if environment == "development" else logging.INFO)
        return

    processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if environment == "development":
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.extend(
            [
                structlog.processors.format_exc_info,
                structlog.processors.JSONRenderer(),
            ]
        )

    log_level = logging.DEBUG if environment == "development" else logging.INFO

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


class _FallbackLogger:
    def __init__(self, name: str) -> None:
        self._logger = logging.getLogger(name)

    def info(self, msg: str, **kwargs: Any) -> None:
        self._logger.info(f"{msg} {kwargs}" if kwargs else msg)

    def warning(self, msg: str, **kwargs: Any) -> None:
        self._logger.warning(f"{msg} {kwargs}" if kwargs else msg)

    def error(self, msg: str, **kwargs: Any) -> None:
        self._logger.error(f"{msg} {kwargs}" if kwargs else msg)

    def exception(self, msg: str, **kwargs: Any) -> None:
        self._logger.exception(f"{msg} {kwargs}" if kwargs else msg)

    def debug(self, msg: str, **kwargs: Any) -> None:
        self._logger.debug(f"{msg} {kwargs}" if kwargs else msg)


def get_logger(name: str) -> Any:
    if structlog is None:
        return _FallbackLogger(name)
    return structlog.get_logger(name)
