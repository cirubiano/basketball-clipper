from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.models.profile import Profile
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    SwitchProfileRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    await db.flush()
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/switch-profile", response_model=TokenResponse)
async def switch_profile(
    body: SwitchProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Cambia el perfil activo del usuario.
    Valida que el profile_id pertenece al usuario y esta activo.
    Devuelve un nuevo JWT con el claim profile_id actualizado.
    """
    profile = await db.get(Profile, body.profile_id)
    if (
        profile is None
        or profile.user_id != current_user.id
        or profile.archived_at is not None
    ):
        raise HTTPException(status_code=404, detail="Profile not found or not active.")
    return TokenResponse(
        access_token=create_access_token(current_user.id, profile_id=profile.id)
    )


@router.post("/clear-profile", response_model=TokenResponse)
async def clear_profile(
    current_user: User = Depends(get_current_user),
) -> TokenResponse:
    """Vuelve al selector de perfil (elimina profile_id del token)."""
    return TokenResponse(access_token=create_access_token(current_user.id))


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/me/password", status_code=204, response_class=Response)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Cambia la contraseña del usuario autenticado."""
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.hashed_password = hash_password(body.new_password)
    await db.flush()
    return Response(status_code=204)
