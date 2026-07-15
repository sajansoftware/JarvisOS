import base64

import httpx

from backend.config import settings


async def synthesize_speech(text: str) -> dict:
    """Generate speech from text.

    Returns:
        dict with "audio" (base64 mp3) and "use_browser_tts" flag.
    """
    if not settings.ELEVENLABS_API_KEY:
        return {"audio": None, "use_browser_tts": True, "text": text}

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{settings.ELEVENLABS_VOICE_ID}"

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                url,
                headers={
                    "xi-api-key": settings.ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_monolingual_v1",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    },
                },
                timeout=30.0,
            )
            response.raise_for_status()
            audio_b64 = base64.b64encode(response.content).decode("utf-8")
            return {"audio": audio_b64, "use_browser_tts": False, "text": text}
        except Exception:
            return {"audio": None, "use_browser_tts": True, "text": text}
