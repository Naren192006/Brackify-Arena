import logging
import structlog


def configure_logging(environment: str) -> None:
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


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
