#!/usr/bin/env python3
"""
Hook PostToolUse — se ejecuta después de cada llamada a una tool de Claude Code.

Si Claude ha modificado un archivo dentro de backend/, ejecuta automáticamente:
  1. Comprobación de sintaxis Python del archivo tocado.
  2. Suite de tests con pytest.

Códigos de salida:
  0 → todo OK, Claude puede continuar.
  2 → bloquea la acción (no se usa aquí, solo informamos).
"""

import json
import subprocess
import sys
import os

def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})

    # Solo nos interesan las tools que escriben archivos
    if tool_name not in ("Write", "Edit", "MultiEdit"):
        sys.exit(0)

    file_path = tool_input.get("file_path", "")

    # Solo actuamos sobre archivos del backend
    if "backend/" not in file_path and not file_path.startswith("backend/"):
        sys.exit(0)

    # Determinar la raíz del proyecto (dos niveles arriba de este script)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)  # .claude/ → proyecto/

    print(f"\n🔍 Archivo de backend modificado: {file_path}", file=sys.stderr)

    # 1. Comprobación de sintaxis del archivo tocado
    abs_path = os.path.join(project_root, file_path) if not os.path.isabs(file_path) else file_path
    if abs_path.endswith(".py") and os.path.exists(abs_path):
        print("  → Comprobando sintaxis Python...", file=sys.stderr)
        result = subprocess.run(
            ["python", "-m", "py_compile", abs_path],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"  ❌ Error de sintaxis:\n{result.stderr}", file=sys.stderr)
            # No bloqueamos (exit 2), pero informamos claramente
            sys.exit(0)
        else:
            print("  ✅ Sintaxis OK", file=sys.stderr)

    # 2. Ejecutar pytest
    print("  → Ejecutando pytest...", file=sys.stderr)
    backend_dir = os.path.join(project_root, "backend")
    result = subprocess.run(
        ["python", "-m", "pytest", "-v", "--tb=short", "-q"],
        cwd=backend_dir,
        capture_output=True, text=True,
        timeout=120
    )

    # Mostrar resumen (últimas líneas del output)
    output_lines = (result.stdout + result.stderr).strip().split("\n")
    summary_lines = [l for l in output_lines if l.strip()][-10:]
    for line in summary_lines:
        print(f"  {line}", file=sys.stderr)

    if result.returncode == 0:
        print("  ✅ Todos los tests pasan\n", file=sys.stderr)
    else:
        print("  ⚠️  Hay tests fallando — revisa antes de continuar\n", file=sys.stderr)

    sys.exit(0)


if __name__ == "__main__":
    main()
