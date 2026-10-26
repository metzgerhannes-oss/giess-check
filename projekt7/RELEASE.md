# Projekt 7 · V1.0 – Release- und Betriebsnachweis

**Stand:** 26.10.2026. **Status:** Release-Kandidat; endgültiger Vollzug erst nach erfolgreicher PR-CI, Integration in `main`, erfolgreichem Main-HTTPS-Gate und Pages-Deployment. Keine manuelle Freigabe erforderlich.

## Release-Kriterien (P0/P1)

| Kriterium | Technischer Nachweis |
| --- | --- |
| Eigenständigkeit | Ausschließlich `projekt7/` und eigene CI; Root-Gieß-Check bleibt unverändert. |
| Statische Auslieferung | HTTPS-Pages ohne Build, kostenpflichtige Dienste, API-Keys oder Login. |
| Kernablauf | Projekt erstellen, Möglichkeiten und Kriterien bearbeiten, bewerten und Ergebnisse berechnen; deterministische lokale Rechenlogik. |
| Persistenz | Aktiver Stand mit optionaler lokaler Rückfallkopie; Schreibverifikation und Best-Effort-Konfliktschutz zwischen Tabs. |
| Portabilität | Validierte JSON-Dateisicherung und -Wiederherstellung des aktiven Stands. |
| Archiv | Bis zu 12 lokale Stände; separater Export, expliziter Ersatz und nicht-destruktive Zusammenführung. |
| Offline | Versionsgebundene Service-Worker-Shell, vollständige Cache-Prüfung und kontrollierte Wiederherstellung; kein Versprechen gegen vollständige Browser-Eviction. |
| Sicherheit | Keine Cloud-Übertragung persönlicher Projektinhalte; Textausgabe statt HTML-Injektion; begrenzte Import-/Cache-Größen. |
| Zugänglichkeit | Tastatur-/Fokuspfade, Live-Ergebnisansage, 320-px-Reflow und ausgewählte Kontrastprüfungen automatisiert getestet. |
| Automatisches Gate | JS-Syntax aller JS-Dateien, alle Node-Regressionen, Offline-Asset-Graph und Sicherheits-/Datenverlustinvarianten. |
| Browser-Meilensteine | Chromium-Mobile-/Offline-/Mehrtab-Szenarien an relevanten Meilensteinen; kein physischer Safari-Nachweis. |
| Deployment | Nach `main`-Merge: Pages-Workflow erfolgreich **und** bytegenauer HTTPS-Abgleich zum Merge-Commit erfolgreich. |

**P0/P1-Freigaberegel:** Kein bekannter reproduzierbarer Datenverlust, keine ungeprüfte Überschreibung bei Versionskonflikt, kein fehlerhaftes Offline-Shell-Upgrade, kein gebrochener Kernablauf. Ein rotes Pflicht-Gate oder fehlgeschlagener HTTPS-Abgleich blockiert V1.0. Bei einem neuen reproduzierbaren P0/P1 ist der Release-Status wieder „blockiert“, bis Ursache und Regression behoben sind.

## Einmalige technische Abnahme ohne Benutzerinteraktion

Im Repository-Stammverzeichnis:

```sh
set -euo pipefail
while IFS= read -r -d '' file; do node --check "$file"; done < <(find projekt7 -type f \( -name '*.js' -o -name '*.mjs' \) -print0)
node --test projekt7/test/*.test.mjs
python3 projekt7/test/check_assets.py
```

Die GitHub-Action `.github/workflows/projekt7-checks.yml` führt genau dieses Pflicht-Gate aus. Ein PR mit `[milestone]` im Titel ergänzt den Chromium-Smoke; auf `main` prüft `deployed_https` die ausgelieferten Dateien. Nach einem Dokumentations-PR genügt das Pflicht-Gate, sofern keine betroffene Browserfunktion geändert wurde.

## Betrieb, Datensicherung und Wiederanlauf

- Öffentliche URL nach erfolgreichem Deployment: `https://metzgerhannes-oss.github.io/giess-check/projekt7/`.
- Für den ersten Offlinebetrieb die Anwendung online vollständig laden; anschließend offline erneut öffnen. Bei gelöschtem Browser-Cache ist erneuter Onlinezugriff nötig.
- Wichtige aktive Stände als JSON-Datei außerhalb des Browsers sichern; Archivdateien separat sichern. Die lokalen Browser-Schlüssel sind **kein** dauerhaftes Backup.
- Bei beschädigtem Speicher oder Konflikten keine erzwungene Überschreibung: zunächst JSON-/Notfall-Rohdatensicherung, dann den aktuellen Browserstand ausdrücklich neu laden.
- Bei einem fehlgeschlagenen Deployment: keine Freigabe, Ursache anhand der fehlgeschlagenen Actions/HTTPS-Dateien prüfen und ausschließlich innerhalb `projekt7/` korrigieren. Alte lokale JSON-Dateien bleiben portabel.

## Bekannte technische Grenzen – transparent, nicht als Erfolg gezählt

1. `localStorage` besitzt kein atomares Compare-and-Swap über mehrere Schlüssel. Extrem enge Mehrtab-Schreibraces sind trotz Revisionsprüfungen nicht vollständig ausschließbar.
2. CacheStorage besitzt keine atomare Mehrdatei-Transaktion. Vollständige Eviction durch Browser/OS und gleichzeitiger Ausfall des Netzwerks können Offlinebetrieb verhindern; die App darf dann nicht mit einer unvollständigen Shell starten.
3. Physische iPhone-/Safari-/VoiceOver- und geräteübergreifende Hardwareabnahmen wurden **nicht** durchgeführt. Chromium-Emulation ersetzt sie nicht.
4. Die Robustheitsanzeige ist eine deterministische Sensitivitätsheuristik, **keine** statistische Eintrittswahrscheinlichkeit oder professionelle Entscheidungsempfehlung.
5. Die Integritätsprüfung validiert Herkunft, MIME, Header und Bytes/Größen, aber ohne signierte Build-Hashes keine inhaltlich veränderten, formal gültigen Netzwerkantworten.

## V1.1-Backlog (nicht releaseblockierend)

- Physische iPhone-/Safari-/VoiceOver-Tests und geräteübergreifende Sicherungsprobe, sobald geeignete Testhardware verfügbar ist.
- Weitere Usability-Optimierung auf Basis echter Nutzung; keine Funktionsausweitung zulasten der Offline-/Datensicherheitsinvarianten.
- Optional: signierte Release-Asset-Hashes, falls mit statischem, kostenlosem Hosting ohne zusätzliche Schlüssel wartbar.

## Nachweiskette vor diesem Release-Kandidaten

- Letzter integrierter Code-PR: https://github.com/metzgerhannes-oss/giess-check/pull/65
- Main-Pflicht-Gate einschließlich HTTPS: https://github.com/metzgerhannes-oss/giess-check/actions/runs/40291711003
- Pages-Deployment: https://github.com/metzgerhannes-oss/giess-check/actions/runs/40291710646
- Fortlaufendes Sprint-/Abnahmeprotokoll: https://github.com/metzgerhannes-oss/giess-check/issues/1

Der endgültige V1.0-Vollzug muss zusätzlich die **neuen** CI-/Pages-Links und den finalen `main`-SHA im Issue #1 dokumentieren.
