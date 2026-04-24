"""
Re-exports de todos los modelos SQLAlchemy.

Importar este paquete (aunque sea un modelo suelto) garantiza que
``Base.metadata`` conozca todas las tablas. Sin esto, contextos que solo
importan un subconjunto (como el worker Celery que solo usa Video y Clip)
provocan ``NoReferencedTableError`` al intentar hacer flush de un INSERT
con una FK apuntando a una tabla que no fue cargada.
"""
from app.models.clip import Clip
from app.models.exercise import Exercise
from app.models.user import User
from app.models.video import Video, VideoStatus

__all__ = ["Clip", "Exercise", "User", "Video", "VideoStatus"]
