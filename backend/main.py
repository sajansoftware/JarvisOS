from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api import routes, websocket
from backend.core.memory import init_db
from backend.plugins.base import registry
from backend.plugins.system_control import SystemControlPlugin


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    registry.register(SystemControlPlugin())
    print("\n  J.A.R.V.I.S. OS is online.\n")
    yield
    # Shutdown
    print("\n  J.A.R.V.I.S. OS shutting down.\n")


app = FastAPI(title="J.A.R.V.I.S. OS", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(routes.router)
app.include_router(websocket.router)

# Serve frontend
frontend_dir = Path(__file__).parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
