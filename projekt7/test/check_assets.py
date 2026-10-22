"""Sanity checks run offline with the Python standard library only."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text(encoding="utf-8")
manifest = json.loads((root / "manifest.webmanifest").read_text(encoding="utf-8"))
sw = (root / "sw.js").read_text(encoding="utf-8")

assert '<html lang="de">' in html
assert 'viewport-fit=cover' in html
assert 'aria-live' in html
assert 'type="module" src="./app.mjs"' in html
assert "http://" not in html and "https://" not in html
assert not re.search(r'<script[^>]*>\s*[^<]', html), "Inline scripts are not allowed."
assert manifest["start_url"] == "./index.html"
assert manifest["scope"] == "./"
assert manifest["display"] == "standalone"
assert "fetch(request)" in sw

required = ["index.html", "style.css", "app.mjs", "core.mjs", "icon.svg",
            "manifest.webmanifest", "sw.js", "test/core.test.mjs"]
for name in required:
    assert (root / name).is_file(), f"Missing file: {name}"

for path in re.findall(r'(?:src|href)="(\./[^"]+)"', html):
    assert (root / path[2:]).exists(), f"Broken HTML asset path: {path}"

for path in re.findall(r"'(\./[^']+)'", sw):
    if path != "./":
        assert (root / path[2:]).exists(), f"Broken SW asset path: {path}"

print("Projekt 7: offline assets, scope, HTML structure and manifest OK")
