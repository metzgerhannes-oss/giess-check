Gieß-Check – iPhone/PWA

Wichtig:
Eine echte iPhone-Web-App kann nicht direkt aus der Dateien-App installiert werden.
Die Dateien müssen über HTTPS erreichbar sein.

Inhalt:
- index.html
- manifest.webmanifest
- service-worker.js
- App-Symbole 180/192/512 px

Einfachste Bereitstellung:
1. Alle Dateien in diesem ZIP entpacken.
2. Den gesamten Ordner auf einen beliebigen statischen HTTPS-Webspace hochladen
   (z. B. GitHub Pages, Netlify, Cloudflare Pages oder eigener Webserver).
3. Die URL auf dem iPhone in Safari öffnen.
4. Teilen → Zum Home-Bildschirm → Hinzufügen.

Danach erscheint „Gieß-Check“ wie eine App auf dem Home-Bildschirm.
Die zuletzt verwendete PLZ und der gewählte Zeitraum werden gespeichert.

Hinweis:
Für aktuelle Wetterdaten ist weiterhin Internet nötig.
Die App-Oberfläche selbst wird nach dem ersten Besuch durch den Service Worker zwischengespeichert.
