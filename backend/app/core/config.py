import json

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Application
    secret_key: str = "dev-secret-key-change-in-production"
    debug: bool = False
    allowed_origins: str = "http://localhost:3000,http://localhost:8081"

    # Database
    database_url: str = (
        "postgresql+asyncpg://basketball:basketball@localhost:5432/basketball_clipper"
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # S3 / MinIO
    s3_endpoint_url: str = ""
    s3_public_url: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket_name: str = "basketball-clipper-videos"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    # ── Detector tuning ───────────────────────────────────────────────
    # Estos parámetros controlan cómo el pipeline detecta posesiones.
    # Se exponen vía env vars para que puedas iterar con tus propios
    # vídeos sin tocar código:
    #   DETECTOR_STRIDE=3            # 1 de cada N frames se analiza
    #   DETECTOR_SMOOTH_WINDOW=9     # ventana mediana de smoothing
    #   DETECTOR_MIN_SEGMENT_SEC=1.5 # segmentos más cortos se descartan
    #   DETECTOR_MAX_FILL_FRAMES=8   # forward-fill máx. con balón perdido
    detector_stride: int = 3
    detector_smooth_window: int = 9
    detector_min_segment_sec: float = 1.5
    detector_max_fill_frames: int = 15
    # Memoria del balón: si YOLO no detecta el balón en un frame pero lo
    # vio hace <ball_memory frames, asumimos que sigue cerca de la última
    # posición conocida y usamos ese centro para la lógica de "jugador
    # más cercano". Compensa que yolov8n pierde el balón con frecuencia.
    detector_ball_memory_frames: int = 10
    # Modelo YOLO. Subir a 'yolov8s.pt' (22 MB) o 'yolov8m.pt' (50 MB) si
    # el balón sale demasiado pequeño y yolov8n no lo detecta. Tradeoff:
    # yolov8s ~2x más lento, yolov8m ~4x más lento, ambos detectan
    # objetos pequeños mucho mejor.
    detector_yolo_model: str = "yolov8n.pt"
    # Tamaño al que YOLO redimensiona el frame antes de inferir. Default
    # de YOLO es 640. Subir a 1280 hace que el balón "pequeño" del frame
    # original ocupe el doble de píxeles en la red, mejorando recall
    # drásticamente con coste ~2x.
    detector_imgsz: int = 1280
    # Confidence threshold separado para personas y balón. El balón es
    # mucho más difícil; threshold bajo + max-1-ball-per-frame da mejor
    # recall sin disparar falsos positivos.
    detector_person_conf: float = 0.4
    detector_ball_conf: float = 0.15

    @property
    def cors_origins(self) -> list[str]:
        v = self.allowed_origins.strip()
        if not v:
            return []
        if v.startswith("["):
            return json.loads(v)
        return [o.strip() for o in v.split(",") if o.strip()]


settings = Settings()
