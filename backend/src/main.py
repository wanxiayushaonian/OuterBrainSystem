# ═══════════════════════════════════════════════════════
# Nexus Backend — FastAPI Application
# ═══════════════════════════════════════════════════════
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from omegaconf import OmegaConf
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from src.db.router import router as spaces_router
from src.llm.router import router as llm_router
from src.api.chat import router as chat_router
from src.api.sessions import router as sessions_router

# Initialize core system
from src.core import ToolRegistry
from src.providers.anthropic import (
    AddCardTool,
    EditCardTool,
    DeleteCardTool,
    MoveCardTool,
    AddConnectionTool,
    DeleteConnectionTool,
    SearchCardsTool,
    AnalyzeCanvasTool,
    GetCardDetailTool,
)

logger = logging.getLogger(__name__)

# Register tools
ToolRegistry.register(AddCardTool())
ToolRegistry.register(EditCardTool())
ToolRegistry.register(DeleteCardTool())
ToolRegistry.register(MoveCardTool())
ToolRegistry.register(AddConnectionTool())
ToolRegistry.register(DeleteConnectionTool())
ToolRegistry.register(SearchCardsTool())
ToolRegistry.register(AnalyzeCanvasTool())
ToolRegistry.register(GetCardDetailTool())

# Load .env from backend directory
load_dotenv(Path(__file__).parent.parent / ".env")

# Load Hydra-style config
_conf_path = Path(__file__).parent.parent / "run" / "conf" / "config.yaml"
cfg = OmegaConf.load(_conf_path)

# ── Environment-aware configuration ──
NEXUS_ENV = os.environ.get("NEXUS_ENV", "development")
IS_PRODUCTION = NEXUS_ENV == "production"


# ── Auth Middleware ──
class AuthMiddleware(BaseHTTPMiddleware):
    SKIP_PATHS = {"/api/health", "/api/auth/login", "/docs", "/openapi.json", "/redoc"}

    async def dispatch(self, request: Request, call_next):
        token = os.environ.get("NEXUS_API_TOKEN")
        if token and request.url.path.startswith("/api/"):
            if request.url.path not in self.SKIP_PATHS:
                auth = request.headers.get("Authorization", "")
                if auth != f"Bearer {token}":
                    raise HTTPException(status_code=401, detail="Unauthorized")
        return await call_next(request)


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Nexus API", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Auth middleware (only enforces when NEXUS_API_TOKEN is set)
app.add_middleware(AuthMiddleware)

# CORS — production uses env-configured origins
if IS_PRODUCTION:
    cors_origins_str = os.environ.get("NEXUS_CORS_ORIGINS", "")
    cors_origins = [o.strip() for o in cors_origins_str.split(",") if o.strip()]
else:
    cors_origins = list(cfg.server.cors_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(llm_router, prefix="/api/llm", tags=["llm"])
app.include_router(spaces_router, prefix="/api/spaces", tags=["spaces"])
app.include_router(chat_router)
app.include_router(sessions_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


# ── Auth endpoint ──
class LoginRequest(BaseModel):
    token: str


@app.post("/api/auth/login")
def login(req: LoginRequest):
    expected = os.environ.get("NEXUS_API_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Auth not configured")
    if req.token != expected:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"ok": True}


# ── Static file serving (production) ──
STATIC_DIR = Path("static")
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        # Serve login.html directly — must not fall through to SPA catch-all
        if full_path == "login":
            login_file = STATIC_DIR / "login.html"
            if login_file.is_file():
                return FileResponse(login_file)
            raise HTTPException(404, detail="login.html not found")
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=cfg.server.host,
        port=cfg.server.port,
        reload=not IS_PRODUCTION,
    )
