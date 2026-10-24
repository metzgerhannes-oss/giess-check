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

## Browser-Meilenstein
Auf Pull Requests mit dem Titelmarker `[milestone]` läuft zusätzlich ein isolierter Chromium-Smoke-Test ohne npm-Pakete und ohne externe Dienste: Mobilbreite, Touchflächen, lokale Datenhaltung, Archiv-Wiederherstellung, Service-Worker-Offline-Neustart und JavaScript-Laufzeitfehler. Andere PRs behalten das schnelle Pflicht-Gate.

## Weitere Qualitätsarbeit
Safari/iOS-PWA-Installation und geräteübergreifender Backup-/Restore-Test weiterhin offen; Chromium-Meilenstein deckt nicht Safari oder reale iPhone-Hardware ab.

## Kosten / Grenzen
Statisches Hosting auf dem kostenlosen GitHub-Pages- oder Cloudflare-Pages-Tarif möglich, vorbehaltlich Tariflimits. Kein Geldbetrag, API-Zugang oder kostenpflichtiger Service im Code. Modell dient nur der Reflexion und ersetzt keine fachliche, finanzielle, medizinische oder rechtliche Beratung.

## Installation, Sicherung und Barrierefreiheit
- Safari auf iOS/iPadOS: Teilen → Zum Home-Bildschirm → Hinzufügen. Android/Chrome: Browsermenü → App installieren.
- PNG-Icons 180/192/512 px; das 512er Icon besitzt eine sichere zentrale Markierung für maskierbare Darstellung.
- JSON-Import/-Export teilen dieselbe Validierung und prüfen das 100-KB-Limit anhand der UTF-8-Bytes.
- Ausgewählte Kontrastpaare werden statisch gegen WCAG-AA-Mindestwerte geprüft; echte Safari-/iPhone-Hardwaretests und vollständige Screenreader-Abnahme bleiben offen.

## Mehrfenster- und Update-Schutz (Sprint 7)
Aktive Daten und Archiv verwenden Best-Effort-Versionserkennung für veraltete Tabs. Archivänderungen werden per Storage-Event in anderen Tabs aktualisiert. LocalStorage besitzt keine atomaren Transaktionen; ein extrem enges gleichzeitiges Schreib-Race bleibt technisch möglich. Der Chromium-Meilenstein prüft zwei echte Tabs, Archiv-Synchronisierung und einen simulierten Service-Worker-Wechsel mit Offline-Neustart. Echte iPhone-/Safari-Abnahme bleibt offen.
