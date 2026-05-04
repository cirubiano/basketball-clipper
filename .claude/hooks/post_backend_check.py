#!/usr/bin/env python3
"""
Hook PostToolUse — se ejecuta después de cada Write/Edit/MultiEdit.

Si Claude ha modificado un archivo .py dentro de backend/, comprueba
la sintaxis Python del archivo tocado. Los tests completos los ejecuta
Claude al final de cada sesión con `make check`.

Códigos de salida:
  0 → OK o no aplicable.
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

    if tool_name not in ("Write", "Edit", "MultiEdit"):
        sys.exit(0)

    file_path = tool_input.get("file_path", "")

    if not file_path.endswith(".py"):
        sys.exit(0)

    if "backend/" not in file_path and not file_path.startswith("backend/"):
        sys.exit(0)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    abs_path = os.path.join(project_root, file_path) if not os.path.isabs(file_path) else file_path

    if not os.path.exists(abs_path):
        sys.exit(0)

    result = subprocess.run(
        ["python", "-m", "py_compile", abs_path],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        print(f"\n  Sintaxis error en {file_path}:\n{result.stderr}", file=sys.stderr)
    else:
        print(f"\n  Sintaxis OK — {os.path.basename(file_path)}", file=sys.stderr)

    sys.exit(0)


if __name__ == "__main__":
    main()
