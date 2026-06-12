import logging

logger = logging.getLogger("aevra.events")

def log_event(level: str, event_type: str, data: dict):
    """Log an event to the standard python logger."""
    msg = f"[{event_type}] {data}"
    if level.lower() == "error":
        logger.error(msg)
    elif level.lower() == "warning":
        logger.warning(msg)
    else:
        logger.info(msg)
