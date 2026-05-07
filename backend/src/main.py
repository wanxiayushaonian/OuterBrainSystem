# ═══════════════════════════════════════════════════════
# Nexus Backend — FastAPI Application
# ═══════════════════════════════════════════════════════
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from omegaconf import OmegaConf

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

app = FastAPI(title="Nexus API", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(cfg.server.cors_origins),
    allow_credentials=True,
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=cfg.server.host,
        port=cfg.server.port,
        reload=True,
    )
