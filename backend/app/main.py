import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .api import router
from .config import get_settings
from .db import SessionLocal
from .models import SyncState
from .rules import get_rules
from .sync import run_sync

log = logging.getLogger("nextround")
DEMO_RESEED = timedelta(hours=24)


def _sync_once() -> None:
    s = get_settings()
    with SessionLocal() as db:
        if s.data_mode == "demo":
            # La démo est figée sur 24 h : sinon les horaires relatifs « glisseraient » à chaque cycle.
            last = db.scalar(select(func.max(SyncState.last_success_at)).where(SyncState.source == "demo"))
            if last and datetime.now(UTC) - last < DEMO_RESEED:
                return
        log.info("Synchronisation %s : %s", s.data_mode, run_sync(db))


async def _sync_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(_sync_once)
        except Exception:
            log.exception("Cycle de synchronisation en échec")
        await asyncio.sleep(get_settings().sync_interval_minutes * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    get_rules()  # un fichier de règles invalide doit empêcher le démarrage
    task = asyncio.create_task(_sync_loop()) if get_settings().sync_on_startup else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="NextRound API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins.split(","), allow_methods=["GET"], allow_headers=["*"])
app.include_router(router)


@app.get("/health")
def health():
    return {"ok": True}
