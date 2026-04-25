"""
Seed de desarrollo — crea un usuario admin por defecto si no existe.

Credenciales (sobreescribibles via env vars):
  SEED_ADMIN_EMAIL    default: admin@example.com
  SEED_ADMIN_PASSWORD default: admin1234

Uso:
  python scripts/seed.py          # desde backend/
  python -m scripts.seed          # alternativa

Este script es SOLO para desarrollo. No incluir en imágenes de producción.
"""
import asyncio
import os
import sys
from pathlib import Path

# Permite ejecutar desde la raiz del repo o desde backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User


ADMIN_EMAIL = os.getenv("SEED_ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD", "admin1234")


async def seed() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        existing = await db.scalar(select(User).where(User.email == ADMIN_EMAIL))
        if existing:
            print(f"[seed] Usuario '{ADMIN_EMAIL}' ya existe — nada que hacer.")
        else:
            user = User(
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                is_admin=True,
            )
            db.add(user)
            await db.commit()
            print(f"[seed] Usuario admin creado: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
