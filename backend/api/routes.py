import json
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from backend.core.life_dashboard import get_dashboard_data
from backend.core.tts import synthesize_speech
from backend.plugins.system_control import SystemControlPlugin

router = APIRouter()
logger = logging.getLogger("jarvis.api")


@router.get("/health")
async def health():
    return {"status": "online", "system": "J.A.R.V.I.S."}


@router.post("/tts")
async def tts(body: dict):
    text = body.get("text", "")
    if not text:
        return JSONResponse({"error": "No text provided"}, status_code=400)
    try:
        result = await synthesize_speech(text)
        return result
    except Exception as e:
        logger.error("TTS error: %s", e)
        return JSONResponse({"error": "TTS generation failed"}, status_code=500)


@router.get("/api/system/stats")
async def system_stats():
    try:
        plugin = SystemControlPlugin()
        stats = plugin._get_stats()
        return json.loads(stats)
    except Exception as e:
        logger.error("Stats error: %s", e)
        return JSONResponse({"error": "Failed to get stats"}, status_code=500)


@router.get("/api/life-dashboard")
async def life_dashboard():
    try:
        data = get_dashboard_data()
        return data
    except Exception as e:
        logger.error("Life dashboard error: %s", e)
        return JSONResponse(
            {"error": "Failed to load dashboard data"}, status_code=500
        )
