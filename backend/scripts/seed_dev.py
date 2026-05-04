"""
Script de seed para desarrollo local.

Crea (o reutiliza) un club de test, una temporada activa y asigna al
usuario admin como TechnicalDirector de ese club.

Uso:
    docker compose run --rm backend python scripts/seed_dev.py

    # Con credenciales distintas:
    ADMIN_EMAIL=otro@mail.com ADMIN_PASSWORD=pass docker compose run --rm backend python scripts/seed_dev.py

El script es idempotente: si el club, temporada o perfil ya existen, los reutiliza.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import date

sys.path.insert(0, "/app")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_member import ClubMember
from app.models.profile import Profile, UserRole
from app.models.season import Season, SeasonStatus
from app.models.user import User

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin1234")
CLUB_NAME = os.getenv("CLUB_NAME", "Club Baloncesto Test")
SEASON_NAME = os.getenv("SEASON_NAME", "Temporada 2025-26")


async def seed() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:

        # 1. Obtener o crear usuario admin
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        user = result.scalar_one_or_none()

        if user is None:
            print(f"  -> Creando usuario admin: {ADMIN_EMAIL}")
            user = User(
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                is_admin=True,
            )
            db.add(user)
            await db.flush()
            print(f"     Usuario creado -- id={user.id}")
        else:
            print(f"  -> Usuario existente -- id={user.id}  ({user.email})")
            if not user.is_admin:
                user.is_admin = True
                print("     Marcado como is_admin=True")

        # 2. Obtener o crear el club de test
        result = await db.execute(select(Club).where(Club.name == CLUB_NAME))
        club = result.scalar_one_or_none()

        if club is None:
            print(f"  -> Creando club: {CLUB_NAME!r}")
            club = Club(name=CLUB_NAME)
            db.add(club)
            await db.flush()
            print(f"     Club creado -- id={club.id}")
        else:
            print(f"  -> Club existente -- id={club.id}  ({club.name})")

        # 3. Obtener o crear temporada activa
        result = await db.execute(
            select(Season).where(
                Season.club_id == club.id,
                Season.name == SEASON_NAME,
            )
        )
        season = result.scalar_one_or_none()

        if season is None:
            print(f"  -> Creando temporada: {SEASON_NAME!r}")
            season = Season(
                club_id=club.id,
                name=SEASON_NAME,
                status=SeasonStatus.active,
                starts_at=date(2025, 9, 1),
                ends_at=date(2026, 6, 30),
            )
            db.add(season)
            await db.flush()
            print(f"     Season creada -- id={season.id}")
        else:
            print(f"  -> Temporada existente -- id={season.id}  ({season.name})")

        # 4. Obtener o crear membresia del admin en el club
        result = await db.execute(
            select(ClubMember).where(
                ClubMember.club_id == club.id,
                ClubMember.user_id == user.id,
            )
        )
        member = result.scalar_one_or_none()

        if member is None:
            print("  -> Anadiendo admin como miembro del club")
            member = ClubMember(club_id=club.id, user_id=user.id, invited_by=user.id)
            db.add(member)
            await db.flush()
            print(f"     ClubMember creado -- id={member.id}")
        else:
            print(f"  -> Membresia existente -- id={member.id}")

        # 5. Obtener o crear perfil TechnicalDirector
        result = await db.execute(
            select(Profile).where(
                Profile.club_id == club.id,
                Profile.user_id == user.id,
                Profile.season_id == season.id,
                Profile.role == UserRole.technical_director,
                Profile.archived_at.is_(None),
            )
        )
        profile = result.scalar_one_or_none()

        if profile is None:
            print("  -> Creando perfil TechnicalDirector")
            profile = Profile(
                user_id=user.id,
                club_id=club.id,
                team_id=None,
                season_id=season.id,
                role=UserRole.technical_director,
            )
            db.add(profile)
            await db.flush()
            print(f"     Profile creado -- id={profile.id}")
        else:
            print(f"  -> Perfil TechnicalDirector existente -- id={profile.id}")

        await db.commit()

    await engine.dispose()

    print()
    print("=" * 60)
    print("  Seed completado.")
    print(f"  Email:      {ADMIN_EMAIL}")
    print(f"  Password:   {ADMIN_PASSWORD}")
    print(f"  Club:       {CLUB_NAME}  (id={club.id})")
    print(f"  Temporada:  {SEASON_NAME}  (id={season.id})")
    print(f"  Perfil:     TechnicalDirector  (id={profile.id})")
    print()
    print("  Flujo en el frontend:")
    print("  1. Login con las credenciales de arriba")
    print("  2. Selecciona el perfil Director Tecnico")
    print("  3. Ya puedes explorar todos los modulos")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed())
