# Levanta el Entorno

Inicia todos los servicios con docker-compose y ejecuta la suite de tests del backend para verificar que todo funciona correctamente.

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

4. Ejecuta los tests del backend:
   ```bash
   cd backend && pytest -v
   ```

5. Resume el resultado: cuántos tests pasaron, cuáles fallaron (si los hay) y si el entorno está listo para trabajar.
