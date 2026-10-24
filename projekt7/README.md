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


## Sprint 11: Speicherfehler unter Last und höherer Kontrast
Der aktive Arbeitsstand wird **vor** der optionalen zusätzlichen lokalen Rückfallkopie gespeichert. Schlägt der primäre `localStorage`-Schreibvorgang fehl, bleibt die ältere Rückfallkopie unverändert. Ist nur das Schreiben der Rückfallkopie wegen Speicherquote gesperrt, gilt der aktive Arbeitsstand als gespeichert, aber die Oberfläche warnt ausdrücklich vor der fehlenden zusätzlichen Sicherung und empfiehlt den JSON-Export. Zwischen beiden Schlüsseln gibt es keine atomare Transaktion; ein Browserabsturz genau dazwischen kann den unmittelbar vorherigen Stand aus der lokalen Rückfallkopie auslassen, der neue primäre Stand ist dann aber bereits gespeichert. Ein Archiv-Lesefehler wegen verweigertem Speicherzugriff wird als „nicht verfügbar“ statt fälschlich als „beschädigt“ gemeldet. Acht neue Fault-Injection-Regressionen (darunter 250 Schreibversuche), ein echter Chromium-Quota-Fehlertest und die Simulation von `prefers-contrast: more` sichern dieses Paket ab. Reale iPhone-/Safari-Hardware bleibt ungetestet.


## Sprint 12: Barrierefreiheit und mobile Vergrößerung
- Visuelle Reihenfolge und Tastatur-/Screenreader-Reihenfolge stimmen auch bei schmaler Ansicht überein; der Sprunglink fokussiert das Hauptsegment.
- Zusatztexte und Bedienelemente sind größer lesbar; Kopfzeile, Regler und Aktionen umbrechen bei engen Viewports.
- Druckbericht enthält aktuelle Projektüberschrift und Druckdatum.
- Chromium-Meilenstein prüft 320-CSS-Pixel-Reflow, Fokusziel, Reihenfolge und Drucktitel. Kein Ersatz für VoiceOver auf echter iPhone-Hardware.


### Release-Härtung: Reflow und Wiederherstellung (Sprint 13)

Die Browser-Meilensteinprüfung simuliert zusätzlich die für WCAG-Reflow relevante Breite von 320 CSS-Pixeln (geometrisch vergleichbar mit 400 % Zoom bei 1280 CSS-Pixeln Ausgangsbreite) mit langen Nutzereingaben. Sie prüft fehlenden horizontalen Überlauf, die Bedienbarkeit der Archiv-Aktionen, abgewiesene beschädigte JSON-Dateien und einen simulierten Fehler beim primären Browser-Schreibzugriff. Ergänzende Node-Tests prüfen maximale zulässige Datenmengen, Wiederherstellung aus Sicherungen, konkurrierende Schreibvorgänge und Quota-Fehler. Die CI-Pflichtprüfung bleibt ein einzelnes gebündeltes Gate; der Chromium-Meilenstein läuft nur bei ausdrücklich markierten PRs.

**Grenzen:** Emulierte Viewports ersetzen weder einen echten Desktop-Browserzoom-Test noch einen Hardwaretest auf iPhone/Safari. Browser-Speicher ist nicht transaktional und kann vom Gerät gelöscht werden; externe JSON-Dateisicherungen bleiben erforderlich.

## Sprint 14: Unabhängiger Zugriff auf aktive Daten und Rückfallkopie
Die aktive Browserkopie wird beim Laden zuerst und unabhängig von der optionalen Rückfallkopie geprüft. Ist sie gültig, verhindert ein Lesefehler der Rückfallkopie weder das Anzeigen noch das Speichern des aktuellen Stands. Ist die aktive Kopie dagegen fehlend oder beschädigt, bleibt ein nicht lesbarer Backup-Schlüssel ein harter Schutz: Der Zustand wird als nicht verfügbar gemeldet und ein Schreiben ohne vorherige Backup-Prüfung abgebrochen, damit keine möglicherweise wiederherstellbaren Daten verdeckt werden. Zwölf zusätzliche Node-Fault-Injection-Tests prüfen Lesesperren, beschädigte Daten, Recovery, Quota-Fehler und den unveränderten Zustand nach abgewiesenen Schreibversuchen. Die Offline-Shell wurde für die neue Modulversion aktualisiert. Weiterhin keine transaktionalen Browser-Speichergarantien oder reale iPhone-/Safari-Hardwareabnahme.


## Sprint 15: Offline-Cache-Integrität und sichere Netzwerknachladung
Der Service Worker aktiviert eine neue Offline-Version nur, wenn **alle** statischen Dateien tatsächlich im zugehörigen Cache liegen. Bei fehlgeschlagenem Precache oder zwischenzeitlich entfernten Dateien wird die alte Version nicht gelöscht und die Aktivierung nicht als erfolgreich behandelt. Die Laufzeit-Nachladung eines fehlenden statischen Assets speichert ausschließlich erfolgreiche, nicht umgeleitete, gleichadressige und nicht-opaque Antworten; Fehlerseiten, fremde Redirects und URL-Varianten werden nicht in den Offline-Cache übernommen. Acht isolierte Node-Regressionen simulieren Precache-Fehler, partielle Installationen, Eviction, Redirects, fehlgeschlagene Antworten und Speicherquoten. Die bestehende Beschränkung auf den eigenen App-Pfad bleibt bestehen. Browser können weiterhin lokale Caches vollständig löschen; JSON-Dateisicherungen bleiben notwendig.


## Sprint 16: verifizierte Offline-Shell
Beim Installieren und Aktivieren prüft der Service Worker nicht nur, ob alle benötigten Dateien im Cache liegen, sondern auch HTTP-Erfolg, Weiterleitungen, Herkunft und passende MIME-Typen. Dadurch wird verhindert, dass z. B. eine irrtümlich als JavaScript ausgelieferte HTML-Seite eine funktionierende Offline-Version verdrängt. Isolierte Regressionen simulieren fehlerhafte Hosting-Antworten, Redirects, fremde URLs und beschädigte Caches. Ein vollständiger Browser-/Safari-Hardwaretest bleibt davon unabhängig.


## Sprint 17: Laufzeit-Cache gegen beschädigte Inhalte absichern
Nach der Installation wird nicht mehr nur die Vollständigkeit des Offline-Caches geprüft: Jeder Cache-Treffer für Module, Stylesheets und Grafiken wird vor der Auslieferung erneut anhand von URL, HTTP-Status, Redirect-Status, Response-Typ und MIME-Typ validiert. Ein ungültiger Treffer wird nicht ausgeführt, sondern nur durch eine vertrauenswürdige Netzantwort ersetzt. Laufzeit-Reparaturen verwenden dieselben Regeln wie der initiale Precache. Ein beschädigter HTML-Cache-Treffer wird bei Navigation bewusst mit einem Netzwerkfehler abgewiesen, statt potenziell fremdes HTML auszuführen. Zusätzliche isolierte Regressionen simulieren MIME-Verwechslungen, vergiftete Caches und Offline-Ausfälle. Bei komplett entferntem Browser-Cache ist eine erneute Online-Installation weiterhin erforderlich; echte Safari-Hardware bleibt ungeprüft.

## Sprint 18: Wiederherstellung des vollständigen Offline-Caches
Wenn der Browser die gesamte oder Teile der App-Shell aus seinem Cache entfernt, lädt eine Online-Navigation die **gesamte** statische Shell in einem Cache-API-`addAll`-Batch nach. Die Navigation wird erst nach erneuter Prüfung sämtlicher erwarteter URLs, MIME-Typen und Response-Eigenschaften aus dem Cache ausgeliefert. Schlägt ein Download oder die Validierung fehl, wird die Navigation bewusst mit einem Netzwerkfehler abgebrochen statt HTML mit einer unvollständigen bzw. versionsgemischten Offline-Shell auszuführen. Gleichzeitige Wiederherstellungsversuche werden zusammengefasst. Node-Regressionen prüfen Totalverlust, Teilverlust, Fehler, fehlerhafte MIME-Antworten und parallele Navigation. Das ist **keine Garantie** gegen die Löschung von Browserdaten; LocalStorage und Service-Worker-Cache sind unabhängig und echte Safari-Hardware bleibt ungeprüft.

## Sprint 19: Browser-Eviction, fehlgeschlagene Wiederherstellung und erneuter Offline-Zyklus
Der isolierte Chromium-Meilenstein entfernt eine echte Datei aus der aktiven CacheStorage-Shell, simuliert einen Serverausfall (HTTP 503) und prüft, dass eine Navigation mit unvollständiger Shell geschlossen fehlschlägt. Nach Rückkehr des Netzwerks muss die App sämtliche 16 Shell-Einträge wiederherstellen, vorhandene lokale Daten erhalten und einen zweiten Offline-Neustart bestehen. Der Browser-Harness protokolliert bei Fehlern den Testabschnitt und die letzten Chromium-Fehlermeldungen. Zwei zusätzliche Node-Fault-Injection-Tests prüfen atomare Cache.addAll-Fehler und erfolgreiche Wiederholungen. Die Browserprüfung läuft nur bei `[milestone]`-PRs; das schnelle Pflicht-Gate und alle bisherigen Schutztests bleiben aktiv. Kein Ersatz für einen realen Safari-/iPhone-Test.

## Sprint 20: sichere Fehlerantworten und HTML-Reparatur
Statische Laufzeit-Nachladungen dürfen nur HTTP 200 mit passender Herkunft, URL, MIME und ohne Redirect an die App weitergeben; HTTP 206, Login-Fallbacks und sonstige untrusted Antworten werden als Netzwerkfehler abgewiesen, nicht nur vom Cache ausgeschlossen. Beschädigtes zwischengespeichertes HTML wird niemals ausgeführt. Ist das Netzwerk wieder erreichbar, kann ein vollständiger, erneut validierter Shell-Batch das HTML reparieren; bei Ausfall bleibt die Navigation geschlossen. Node-Fault-Injection und ein gezielter Chromium-Meilenstein prüfen diesen Fehler-/Wiederherstellungszyklus. Offline-Daten können weiterhin vom Browser gelöscht werden; iPhone-/Safari-Hardwaretests sind nicht ersetzt.


## Sprint 21: Archiv- und Speicher-Dauerhaftigkeit
Archivstände werden nur mit sicheren, positiven Ganzzahl-Zeitstempeln angelegt. Der lokale Archivspeicher und der portable Import/Export nutzen dieselbe Obergrenze von 350.000 **UTF-8-Bytes**; bereits vorhandene, übergroße oder beschädigte Daten werden nicht stillschweigend überschrieben. Neue Schreibvorgänge prüfen die Größe **vor** `localStorage.setItem`, sodass Fehler die vorherigen Archivdaten erhalten. Eine fehlgeschlagene optionale Sicherung bleibt eine Warnung: Selbst ein defekter Warn-Callback darf einen bereits erfolgreich gespeicherten Hauptstand nicht als fehlgeschlagen melden. Neue Regressionen prüfen ungültige Zeitstempel, Mehrbyte-UTF-8, 12 vollständige Archivstände, Konflikte und Quota-Fehler. Wegen geänderter Offline-Module wird die PWA-Shell-Version angehoben; Safari-Hardware bleibt ungeprüft.


## Sprint 23: Dauerhafte Offline-Reparaturen und Langzeitregression
Bei einem fehlenden oder beschädigten statischen Asset wartet der Service Worker nun den erfolgreichen Cache-Schreibversuch ab, bevor die geprüfte Netzantwort ausgeliefert wird. Dadurch kann die Browser-Lebensdauer des Fetch-Events den Cache-Schreibvorgang nicht vorzeitig abbrechen. Ein Cache-Quota- oder Berechtigungsfehler lässt die vertrauenswürdige Online-Antwort weiterhin zu; die vollständige Offline-Shell wird vor jeder Offline-Navigation gesondert geprüft. Neue Regressionstests simulieren verzögerte Cache-Schreibvorgänge, Speicher-Quota-Fehler und 120 wiederholte Offline-Zugriffe samt Navigation. Das ist keine Garantie gegen Browserdaten-Löschung oder OS-Cache-Eviction; JSON-Dateisicherungen bleiben erforderlich.
