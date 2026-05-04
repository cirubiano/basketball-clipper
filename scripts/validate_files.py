#!/usr/bin/env python3
"""
validate_files.py — Post-write sanity checks for files edited in Cowork sessions.

Detects two classes of bug caused by the bash-mount / Write-tool sync gap:
  1. Trailing null bytes  (from `cat >>` appending to a stale mount view)
  2. Duplicate content    (file ends with `}\n` then the same block repeats)

Usage:
    python3 scripts/validate_files.py [file ...]

Returns exit code 0 if all files pass, 1 if any fail.
Auto-fixes null bytes in-place; reports (but does not auto-fix) duplicates.
"""

import sys, os, re

ANSI_RED   = "\033[91m"
ANSI_GREEN = "\033[92m"
ANSI_RESET = "\033[0m"

def check_file(path: str) -> list[str]:
    errors: list[str] = []

    raw = open(path, "rb").read()

    # ── 1. Null bytes ────────────────────────────────────────────────────────
    null_count = raw.count(b"\x00")
    if null_count:
        # Auto-fix: strip trailing nulls
        cleaned = raw.rstrip(b"\x00")
        if b"\x00" in cleaned:
            errors.append(f"  ✗ {null_count} null byte(s) in the MIDDLE of the file — manual review needed")
        else:
            open(path, "wb").write(cleaned)
            errors.append(f"  ⚠ {null_count} trailing null byte(s) stripped automatically")

    # ── 2. Duplicate tail ────────────────────────────────────────────────────
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except Exception:
        return errors

    # Heuristic: look for the last occurrence of a natural file-ending token
    # (closing brace/paren on its own line) and check if the same block repeats.
    endings = [m.start() for m in re.finditer(r"\n\}\n", text)]
    if len(endings) >= 2:
        # Check if content after the first-to-last ending duplicates earlier content
        split_at = endings[-2] + len("\n}\n")
        tail = text[split_at:]
        # If the tail is more than a blank line and matches something before it, flag it
        tail_stripped = tail.strip()
        if tail_stripped and tail_stripped in text[:split_at]:
            errors.append(
                f"  ✗ Duplicate tail detected starting at byte {split_at} "
                f"({len(tail_stripped)} chars). Strip everything after the last '}}\\n'."
            )

    return errors


def main():
    paths = sys.argv[1:]
    if not paths:
        print("Usage: validate_files.py <file> [file ...]")
        sys.exit(0)

    any_error = False
    for p in paths:
        if not os.path.exists(p):
            print(f"{ANSI_RED}NOT FOUND{ANSI_RESET}: {p}")
            any_error = True
            continue
        issues = check_file(p)
        if issues:
            print(f"{ANSI_RED}FAIL{ANSI_RESET}: {p}")
            for msg in issues:
                print(msg)
            any_error = True
        else:
            print(f"{ANSI_GREEN}OK{ANSI_RESET}: {p}")

    sys.exit(1 if any_error else 0)


if __name__ == "__main__":
    main()
