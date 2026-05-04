from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    subject: Any,
    profile_id: int | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Genera un JWT firmado.
    profile_id viaja como claim firmado — no como header separado — para que
    el perfil este criptograficamente vinculado a la identidad del usuario.
    """
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload: dict[str, Any] = {"sub": str(subject), "exp": expire}
    if profile_id is not None:
        payload["profile_id"] = profile_id
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Valida el token y devuelve el User ORM. No requiere perfil activo."""
    from app.models.user import User  # noqa: PLC0415

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise credentials_exc
        user_id = int(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exc from None

    user = await db.get(User, user_id)
    if user is None:
        raise credentials_exc
    return user


async def get_current_profile(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Requiere perfil activo en el token. Devuelve el Profile ORM validado."""
    from app.models.profile import Profile  # noqa: PLC0415
    from app.models.user import User  # noqa: PLC0415

    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    no_profile_exc = HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No active profile selected. Use POST /auth/switch-profile.",
    )
    try:
        payload = decode_access_token(token)
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise credentials_exc
        user_id = int(user_id_str)
        profile_id: int | None = payload.get("profile_id")
    except (JWTError, ValueError):
        raise credentials_exc from None

    if profile_id is None:
        raise no_profile_exc

    user = await db.get(User, user_id)
    if user is None:
        raise credentials_exc

    profile = await db.get(Profile, profile_id)
    if profile is None or profile.user_id != user_id or profile.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Profile not found or no longer active.",
        )
    return profile


def require_admin(current_user=Depends(get_current_user)):
    """Dependency que exige is_admin=True (RF-020 a RF-023)."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user
