import aiosqlite
from datetime import datetime

from backend.config import settings

DB_PATH = settings.DB_PATH
MAX_HISTORY = 100


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
        """)
        await db.commit()


async def add_message(role: str, content: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO conversations (role, content, timestamp) VALUES (?, ?, ?)",
            (role, content, datetime.now().isoformat()),
        )

        # Auto-prune: keep only the latest MAX_HISTORY messages
        await db.execute(
            "DELETE FROM conversations WHERE id NOT IN "
            "(SELECT id FROM conversations ORDER BY id DESC LIMIT ?)",
            (MAX_HISTORY,),
        )

        await db.commit()


async def get_recent(limit: int = 20) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT role, content FROM conversations ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        rows = await cursor.fetchall()
        # Reverse so oldest is first (chronological order)
        return [{"role": row["role"], "content": row["content"]} for row in reversed(rows)]


async def build_context(limit: int = 20) -> list[dict]:
    """Build a message list suitable for the Anthropic API."""
    return await get_recent(limit)
