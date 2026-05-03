import json
from datetime import datetime, timezone
from typing import Any, Dict


def log_event(level: str, event_type: str, payload: Dict[str, Any] | None = None) -> None:
    row = {
        "at": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "type": event_type,
        **(payload or {}),
    }
    print(json.dumps(row, default=str))
