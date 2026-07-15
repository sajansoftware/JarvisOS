import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.core.ai_engine import jarvis
from backend.core.tts import synthesize_speech
from backend.plugins.system_control import SystemControlPlugin

router = APIRouter()
logger = logging.getLogger("jarvis.ws")


async def push_stats(websocket: WebSocket, interval: float = 2.0):
    """Background task: push system stats to the client periodically."""
    plugin = SystemControlPlugin()
    while True:
        try:
            stats_json = plugin._get_stats()
            await websocket.send_json(
                {"type": "stats", "data": json.loads(stats_json)}
            )
        except (WebSocketDisconnect, RuntimeError):
            break
        except Exception as e:
            logger.warning("Stats push error: %s", e)
        await asyncio.sleep(interval)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    stats_task = None

    try:
        # Auto-subscribe to stats on connect
        stats_task = asyncio.create_task(push_stats(websocket))

        # Send welcome message
        await websocket.send_json(
            {
                "type": "chat",
                "role": "assistant",
                "content": "Good day, Sir. All systems are online and awaiting your command.",
            }
        )

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "chat":
                user_message = data.get("message", "").strip()
                if not user_message:
                    continue

                # Show typing indicator
                await websocket.send_json({"type": "typing", "active": True})

                try:
                    # Get AI response — jarvis.chat() uses the sync Anthropic SDK,
                    # so run it in a thread to avoid blocking the event loop
                    response = await asyncio.get_event_loop().run_in_executor(
                        None, _sync_chat, user_message
                    )

                    # Send the response
                    await websocket.send_json({"type": "typing", "active": False})
                    await websocket.send_json(
                        {
                            "type": "chat",
                            "role": "assistant",
                            "content": response,
                        }
                    )

                    # Generate TTS
                    tts_result = await synthesize_speech(response)
                    await websocket.send_json(
                        {"type": "tts", **tts_result}
                    )

                except Exception as e:
                    logger.error("Chat error: %s", e)
                    await websocket.send_json({"type": "typing", "active": False})
                    await websocket.send_json(
                        {
                            "type": "chat",
                            "role": "assistant",
                            "content": f"I'm afraid I encountered an error: {e}",
                        }
                    )

            elif msg_type == "command":
                action = data.get("action", "")
                params = data.get("params", {})
                from backend.plugins.base import registry

                result = await registry.execute(action, params)

                # Send system info in a format the dashboard can use
                if action == "get_system_info":
                    try:
                        await websocket.send_json(
                            {"type": "system_info", "data": json.loads(result)}
                        )
                    except Exception:
                        pass
                else:
                    await websocket.send_json(
                        {"type": "command_result", "action": action, "result": result}
                    )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("WebSocket error: %s", e)
    finally:
        if stats_task:
            stats_task.cancel()
            try:
                await stats_task
            except asyncio.CancelledError:
                pass


def _sync_chat(message: str) -> str:
    """Run the async jarvis.chat() synchronously in a thread pool.

    Uses asyncio.run() which properly creates and tears down an event loop
    for this thread, avoiding the anti-pattern of manually managing loops.
    """
    return asyncio.run(jarvis.chat(message))
