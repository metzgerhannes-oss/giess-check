#!/usr/bin/env python3
"""Offline policy check for changed migration SQL. No network or credentials."""
from pathlib import Path
import re
import sys

def lint(path: str) -> list[str]:
    f = Path(path)
    if not f.is_file() or f.suffix != ".sql":
        return []
    raw = f.read_text(encoding="utf-8")
    sql = re.sub(r"--[^\n]*|/\*.*?\*/", " ", raw, flags=re.S)
    errors = []
    ident = r'(?:"[^"]+"|[a-z_][a-z0-9_]*)'
    tables = re.compile(
        rf"\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?({ident}(?:\s*\.\s*{ident})?)\s*\(",
        re.I,
    )
    if re.search(r"\balter\s+default\s+privileges\b[^;]*\bgrant\b[^;]*\bto\s+(anon|authenticated|service_role)\b", sql, re.I | re.S):
        errors.append("Default GRANT to API roles is forbidden")
    if re.search(r"\bgrant\b[^;]*\bon\s+all\s+tables\s+in\s+schema\s+public\s+to\s+(anon|authenticated|service_role|public)\b", sql, re.I | re.S):
        errors.append("Grant on ALL public tables is forbidden")
    for obj in tables.finditer(sql):
        full = re.sub(r'[\s"]', '', obj.group(1)).lower()
        parts = full.split(".")
        if len(parts) > 1 and parts[0] != "public":
            continue
        table = parts[-1]
        name = rf'(?:public\s*\.\s*)?"?{re.escape(table)}"?'
        if not re.search(rf"\balter\s+table\s+(?:if\s+exists\s+)?{name}\s+enable\s+row\s+level\s+security\b", sql, re.I | re.S):
            errors.append(f"public.{table}: missing ENABLE ROW LEVEL SECURITY")
        grant = re.search(rf"\bgrant\b[^;]*\bon\s+(?:table\s+)?{name}\s+to\s+(?:anon|authenticated|service_role)\b", sql, re.I | re.S)
        note = re.search(rf"--\s*data-api:\s*internal-only\s+{re.escape(table)}\b", raw, re.I)
        revoke = re.search(rf"\brevoke\s+all\b[^;]*\bon\s+(?:table\s+)?{name}\s+from\s+(?:public|anon|authenticated)\b", sql, re.I | re.S)
        if not grant and not (note and revoke):
            errors.append(f"public.{table}: requires explicit GRANT or documented internal-only REVOKE")
    return [f"{f}: {error}" for error in errors]

if __name__ == "__main__":
    errors = [item for path in sys.argv[1:] for item in lint(path)]
    for msg in errors:
        print("FAIL:", msg, file=sys.stderr)
    if errors:
        sys.exit(1)
    print("Data API offline migration guard: PASS")
