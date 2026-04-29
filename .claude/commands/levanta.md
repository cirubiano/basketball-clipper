# Levanta el Entorno

Inicia todos los servicios con docker-compose y ejecuta las verificaciones de calidad (tests backend + lint web) para confirmar que todo está listo para trabajar.

## Pasos

1. Inicia los servicios en background:
   ```bash
   docker-compose up -d
   ```

2. Espera 15 segundos a que los servicios se estabilicen (PostgreSQL, Redis, MinIO):
   ```bash
   sleep 15
   ```

3. Verifica que el entorno está sano:
   ```bash
   cd backend && python scripts/preflight.py
   ```

4. Ejecuta los tests del backend (desde `backend/` para que pytest.ini aplique `asyncio_mode = auto`):
   ```bash
   cd backend && python -m pytest -q
   ```

5. Ejecuta el lint de Next.js:
   ```bash
   cd web && npm run lint
   ```

6. Resume el resultado:
   - Cuántos tests pasaron / fallaron
   - Si el lint pasó sin errores (warnings son aceptables, errors bloquean CI)
   - Si el entorno está listo para trabajar
