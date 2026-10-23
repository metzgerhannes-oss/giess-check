"""Sanity checks run offline with the Python standard library only."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text(encoding="utf-8")
manifest = json.loads((root / "manifest.webmanifest").read_text(encoding="utf-8"))
sw = (root / "sw.js").read_text(encoding="utf-8")
app = (root / "app.mjs").read_text(encoding="utf-8")

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
assert 'storage.mjs' in sw and 'history.mjs' in sw and 'archive.mjs' in sw, "Offline cache must include required app modules"
assert "import {inspectStorage,saveProject} from './storage.mjs'" in app
assert "if(initial.state==='new')save(false);" in app, "Never overwrite corrupted storage at startup"

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

assert 'id="undo"' in html and 'id="redo"' in html
assert 'createHistory(project)' in app

assert 'id="archive-save"' in html and 'id="archive-list"' in html
assert "from './archive.mjs'" in app

assert (root / "test/browser-smoke.mjs").is_file(), "Missing milestone browser smoke"
