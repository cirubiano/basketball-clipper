# Modelos custom de YOLO

Esta carpeta se monta dentro del contenedor del worker como `/models`.
Cualquier fichero `.pt` que pongas aquí estará disponible para usarse
como modelo de detección.

## Cuándo usar un modelo custom

`yolov8s.pt` con `imgsz=1920` (la configuración por defecto del proyecto)
es buena para vídeos donde el balón ocupa ≥15 px. Si tu cámara está en
plano panorámico desde la grada y el balón ocupa <12 px, ningún modelo
COCO genérico va a funcionar bien, hace falta un modelo finetuneado en
imágenes de baloncesto.

## Cómo descargar un modelo finetuneado

### Opción A — Roboflow Universe (rápido, gratis con cuenta)

1. Ve a https://universe.roboflow.com/ y busca "basketball player ball
   detection". Hay varios datasets/modelos públicos — algunos con
   versión exportada YOLOv8.
2. Descarga el formato "YOLOv8" (te dará un `.zip` con `weights/best.pt`).
3. Copia `best.pt` a esta carpeta con un nombre descriptivo, por ejemplo:
   ```
   backend/models/basketball-roboflow-v3.pt
   ```
4. Edita `backend/.env`:
   ```
   DETECTOR_YOLO_MODEL=/models/basketball-roboflow-v3.pt
   ```
5. Reinicia el worker: `docker compose restart worker`.

### Opción B — finetuning propio

Si tienes vídeos etiquetados con bounding boxes de jugador y balón, puedes
finetunear `yolov8s.pt` sobre tus propios datos con `ultralytics`. Ver:
https://docs.ultralytics.com/modes/train/

El resultado es un `best.pt` que va aquí.

## Importante: clases del modelo

Los modelos finetuneados suelen redefinir las clases. El detector espera:

- **Clase 0 = "person"** (jugador)
- **Clase 32 = "sports ball"** (balón)

Estos índices vienen de COCO. Si tu modelo custom usa otras clases (por
ejemplo `0=player`, `1=ball`), tienes que actualizar las constantes en
`backend/app/services/detector.py`:

```python
_PERSON_CLS = 0   # cambiar al índice de "player" en tu modelo
_BALL_CLS = 32    # cambiar al índice de "ball" en tu modelo
```

(En el futuro podríamos exponer estas constantes como env vars también.)

## Git: estos pesos no van al repo

`.gitignore` excluye `*.pt` por defecto — pesan demasiado y normalmente
no son redistribuibles. Cada desarrollador descarga los suyos.
