from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    ANTHROPIC_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = "pNInz6obpgDQGcFmaJgB"  # "Adam" - British male voice

    MODEL_PRIMARY: str = "claude-sonnet-4-20250514"
    MODEL_REASONING: str = "claude-opus-4-0-20250414"

    DB_PATH: str = str(Path(__file__).parent.parent / "jarvis.db")

    model_config = {"env_file": str(Path(__file__).parent.parent / ".env")}


settings = Settings()
