import json
import os
from typing import Any


try:
    ENV = json.loads(os.getenv("AEVRA_ENV", "{}") or "{}")
except Exception:
    ENV = {}


def env(name: str, default: Any = "") -> Any:
    value = ENV.get(name)
    if value is None or value == "":
        return default
    return value


def allowed_origins(defaults=None):
    base = list(defaults or [])
    configured = str(env("ALLOWED_ORIGINS", "") or "")
    base.extend([item.strip() for item in configured.split(",") if item.strip()])
    return sorted(set(base))
