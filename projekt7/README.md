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

## Portabler Archivexport und -import (Sprint 8)
Neben der separaten JSON-Sicherung des aktiven Arbeitsstands kann das gesamte lokale Archiv als eigene JSON-Datei exportiert und später wieder importiert werden. Der Import **ersetzt nur das lokale Archiv nach ausdrücklicher Bestätigung**; der aktive Arbeitsstand und seine lokale Sicherung bleiben unangetastet. Formatkennung, Version, IDs, Zeitstempel, Projektdaten und maximale Dateigröße (350 KB) werden geprüft. Beschädigte bestehende Archive werden niemals stillschweigend überschrieben. Ein fehlgeschlagener `localStorage.setItem` lässt das vorherige Archiv unverändert. Bei einem anderen Tab wird vor dem Schreiben ein Best-Effort-Konfliktcheck durchgeführt. Exportierte Dateien müssen selbst sicher verwahrt werden. Browserdaten und Archivdateien können sensible persönliche Notizen enthalten.

## Sprint 9: Schutz vor ungespeicherten Änderungen und begrenzter Offline-Cache
Wenn der Browser die aktuelle Bearbeitung nicht speichern kann (z. B. Quota oder Schreibkonflikt), bleibt sie im Arbeitsspeicher und ein `beforeunload`-Hinweis warnt beim Verlassen der Seite, soweit der Browser dies unterstützt. JSON-Export bleibt jederzeit verfügbar. Erfolgsmeldungen nach einem Import oder nach dem Öffnen eines Archivstands erscheinen nur, wenn die aktive lokale Speicherung wirklich gelungen ist. Der Schutz wird nach erfolgreichem Speichern oder bewusstem Neuladen zurückgesetzt. iOS/Safari kann `beforeunload` unterdrücken; die Warnung ersetzt keine exportierte Sicherungsdatei. Der Service Worker cached ausschließlich definierte statische Assets ohne Query-Varianten; fremde und unbekannte Requests bleiben unbeeinflusst. Node-Regressionen prüfen den Guard und die Cache-Abgrenzung; ein Browser-Meilenstein prüft zusätzlich Offline-Neustart und Update.

## Sprint 10: Tastaturbedienung und HTTPS-Deployment-Verifikation
Nach dynamischen Ergänzungen und Löschungen bleibt der Tastaturfokus auf einem sinnvollen Eingabefeld. Ein separates verzögertes Statusfeld informiert Screenreader knapp, statt die gesamte Ergebnisliste anzusagen. Der Chromium-Meilenstein prüft diese Fokuspfade. Nach einem erfolgreichen GitHub-Pages-Workflow vergleicht ein eigener lesender GitHub-Actions-Job alle relevanten veröffentlichten HTTPS-Dateien bytegenau mit dem ausgecheckten Commit und wiederholt bei CDN-Verzögerung. Ein solcher Live-Smoke ist keine echte iPhone-/Safari-Hardwareabnahme.

**Deployment-Trigger-Korrektur:** Die automatisch erzeugte GitHub-Pages-`dynamic`-Workflow-Ausführung löst keinen verlässlichen `workflow_run` aus. Deshalb startet die HTTPS-Verifikation nach dem schnellen Pflicht-Gate auf jedem `main`-Push und wartet bei Bedarf auf das parallel laufende Pages-Deployment. Ein grünes Pages-Deployment allein zählt nicht als bestandener HTTPS-Smoke.
