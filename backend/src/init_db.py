"""Initialize session database on startup."""
import asyncio
from src.core.session import SessionStorage


async def init_session_db():
    """Initialize session database."""
    storage = SessionStorage()
    await storage.init_db()
    print("✓ Session database initialized")


if __name__ == "__main__":
    asyncio.run(init_session_db())
