"""Simple environment utility wrapper for reading env vars."""
import os


def env(key: str, default: str = "") -> str:
    """Get an environment variable value, with optional default."""
    return os.environ.get(key, default)
