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
assert 'storage.mjs' in sw and 'history.mjs' in sw and 'unsaved.mjs' in sw and 'archive.mjs' in sw and 'archive-transfer.mjs' in sw and 'backup.mjs' in sw, "Offline cache must include required app modules"
assert "import {inspectStorage,saveProject,PRIMARY_KEY} from './storage.mjs'" in app
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

# PNG integrity and PWA installability (standard library only).
import struct
import zlib
for filename, expected in [('apple-touch-icon.png',180),('icon-192.png',192),('icon-512.png',512)]:
    data=(root / filename).read_bytes()
    assert data[:8] == bytes([137,80,78,71,13,10,26,10]), filename
    assert data[12:16] == b'IHDR', filename
    assert struct.unpack('>IIBB',data[16:26])==(expected,expected,2,3), filename
    offset=8
    end=False
    while offset<len(data):
        size=struct.unpack('>I',data[offset:offset+4])[0]
        tag=data[offset+4:offset+8]
        payload=data[offset+8:offset+8+size]
        crc=struct.unpack('>I',data[offset+8+size:offset+12+size])[0]
        assert zlib.crc32(tag+payload)==crc, filename
        offset+=12+size
        if tag==b'IEND':
            end=True
            break
    assert end and offset==len(data), filename
assert 'href="./apple-touch-icon.png"' in html
assert {'./icon-192.png','./icon-512.png'} <= {icon['src'] for icon in manifest['icons']}
assert '<details class="install-help">' in html
assert "from './backup.mjs'" in app
def luminance(col):
    values=[int(col[i:i+2],16)/255 for i in (1,3,5)]
    linear=[v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4 for v in values]
    return 0.2126*linear[0]+0.7152*linear[1]+0.0722*linear[2]
for fg,bg in [('#1c2b3a','#ffffff'),('#536272','#ffffff'),('#a7e8d9','#1e4967'),('#394d60','#ffffff')]:
    hi,lo=sorted((luminance(fg),luminance(bg)),reverse=True)
    assert (hi+0.05)/(lo+0.05)>=4.5,(fg,bg)

assert 'id="reload-storage"' in html
assert 'STORAGE_CONFLICT' in (root / "storage.mjs").read_text(encoding="utf-8")
assert "event.key===PRIMARY_KEY" in app
assert "const VERSION='klarpunkt-shell-v12'" in sw
assert "cache.match('./index.html')" in sw, "Version-consistent navigation required"
assert "caches.open(VERSION).then(cache=>cache.match(request)" in sw, "Do not mix caches across apps"

assert 'id="archive-export"' in html and 'id="archive-import"' in html
assert "from './archive-transfer.mjs'" in app

assert "from './unsaved.mjs'" in app
assert 'if(changed())status.textContent=' in app, "Do not report persisted imports after a failed save"
assert 'STATIC_PATHS.has(url.pathname)' in sw, "Cache must only include known static assets"

assert 'id="result-announcement"' in html and 'aria-live="off"' in html
assert "resultAnnouncementTimer" in app
assert (root / "test/live-smoke.mjs").is_file()
assert (root / "test/live-verify.test.mjs").is_file()
assert "github.event_name == 'push'" in (root.parent / ".github/workflows/projekt7-checks.yml").read_text(encoding="utf-8")

assert "prefers-contrast:more" in (root / "style.css").read_text(encoding="utf-8")
assert "onBackupFailure" in (root / "storage.mjs").read_text(encoding="utf-8")
assert "backupWarning" in app

# Reflow and print accessibility invariants; rendered width checked in Chromium milestone.
css=(root / "style.css").read_text(encoding="utf-8")
assert 'id="workspace" tabindex="-1"' in html
assert 'id="print-project-title"' in html
assert "window.addEventListener('beforeprint',updatePrintHeading)" in app
assert '@media(max-width:380px)' in css
assert '.insights{order:initial}' in css
assert '.print-project-title{display:block' in css
assert '@media(prefers-reduced-motion:reduce)' in css
assert '@media(forced-colors:active)' in css

# Sprint 13: keep reflow guards, accessibility focus and destructive-import regression coverage.
assert '@media(max-width:400px)' in css
assert '#workspace:focus-visible' in css
assert (root / 'test/release-hardening.test.mjs').is_file()
assert 'Primary write failure must preserve persisted data' in (root / 'test/browser-smoke.mjs').read_text(encoding='utf-8')
