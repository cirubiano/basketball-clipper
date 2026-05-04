# Levanta el Entorno

Inicia todos los servicios con docker-compose y ejecuta `make check` para confirmar que todo está listo para trabajar.

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

4. Ejecuta todas las verificaciones del proyecto:
   ```bash
   make check
   ```

5. Resume el resultado:
   - Cuántos tests del backend pasaron / fallaron y el porcentaje de coverage
   - Si el lint y el type-check de web pasaron sin errores
   - Si el entorno está listo para trabajar
