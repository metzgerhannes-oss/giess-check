# Klarpunkt – Projekt 7

Eigenständige, kostenlos betreibbare PWA im Unterverzeichnis des vorhandenen Repositories. **Gieß-Check im Stammverzeichnis bleibt unverändert.**

## Nutzung
Statischen HTTPS-Webserver auf `projekt7/` zeigen lassen. Ohne Buildprozess, API-Key, Konto, Tracking oder externe Schriftbibliotheken. Beispiel öffnen oder neue Entscheidung beginnen, Möglichkeiten und Kriterien ergänzen, gewichten und bewerten. Ergebnisse erscheinen sofort. Unter „Sicherung speichern“ kann eine JSON-Datei erstellt und später wieder eingelesen werden.

## Methodik
Gewichteter Durchschnitt: `sum(Gewicht * Bewertung) / sum(Gewichte)`. Alle Bewertungen 0 bis 10, Gewichte 1 bis 5. Der zusätzliche Robustheitstest variiert Gewichte um ±20 % und Bewertungen um je Kriterium eingestellte ±0 bis 3 Punkte. 700 deterministische Simulationsdurchläufe. Die angezeigte Häufigkeit ist **keine statistische Vorhersage**, nur eine Sensitivitätsheuristik.

## Datenschutz
Projekte verbleiben im Browser-LocalStorage. Keine Serverübertragung, keine Cookies, kein Analytics. Browserdaten können vom Betriebssystem/Browser gelöscht werden; wichtige Projekte daher als JSON sichern. JSON-Import prüft Struktur, Größe und Werte; Nutzereingaben werden ausschließlich als Text gerendert.

## Tests
```sh
node --test projekt7/test/*.test.mjs
python3 projekt7/test/check_assets.py
node --check projekt7/core.mjs
node --check projekt7/app.mjs
node --check projekt7/sw.js
```
GitHub Actions: `.github/workflows/projekt7-checks.yml`.

## Weitere Qualitätsarbeit
Browser-E2E mit mobilem Viewport, Touch-/Fokusprüfung, reale Offline-Installation und geräteübergreifender Backup-/Restore-Test; Safari-PWA-App-Icon prüfen.

## Kosten / Grenzen
Statisches Hosting auf dem kostenlosen GitHub-Pages- oder Cloudflare-Pages-Tarif möglich, vorbehaltlich Tariflimits. Kein Geldbetrag, API-Zugang oder kostenpflichtiger Service im Code. Modell dient nur der Reflexion und ersetzt keine fachliche, finanzielle, medizinische oder rechtliche Beratung.
