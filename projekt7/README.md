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


## Sprint 25: Sitzungstrennung und HTTP-Cache-Verträge
Der Offline-Shell-Cache weist nun Antworten mit `Cache-Control: private` oder `no-cache` sowie `Vary` auf `Cookie`, `Authorization`, `Proxy-Authorization` oder `Origin` ab. Bestehende `no-store`-, Redirect-, MIME- und Vollständigkeitsprüfungen bleiben aktiv. Navigations-URLs mit Query-Parametern, bedingte HTTP-Anfragen und explizite `no-store`-Requests umgehen den öffentlichen Shell-Cache. Die Shell-Version wird aktualisiert, damit ein bereits früher angelegter Cache nach dem neuen Vertrauensmodell neu validiert wird. Node-Fault-Injection prüft Installation, Cache-Hits und Laufzeit-Reparatur; ein Chromium-Meilenstein prüft das reale Update. Diese Abwehr ersetzt keine serverseitige Zugriffskontrolle und garantiert keine dauerhafte Speicherung bei Browser-Eviction.

## Sprint 26: Rückkehr aus Hintergrund-Tabs ohne Datenverlust
Beim Zurückkehren über Fokus, Sichtbarkeitswechsel oder Page-Show wird die tatsächliche lokale Primärrevision erneut gelesen. Damit werden auch nach längerer Suspendierung verpasste `storage`-Ereignisse erkannt, bevor ein veralteter Tab neue Daten schreiben kann. Der Nutzer kann den aktuellen Stand erst nach expliziter Bestätigung laden und zuvor den eigenen ungespeicherten Stand als Datei sichern. War der primäre Speicher beim Start nicht lesbar, bleibt dessen Version **unbekannt**: Ein später wieder erlaubter Zugriff darf niemals automatisch einen vorhandenen Stand überschreiben. Die unabhängige Archivansicht wird bei erkannter Änderung aktualisiert, ohne selbst Daten zu schreiben. Fünf neue Node-Tests sowie eine echte Chromium-Meilensteinprüfung simulieren verpasste Ereignisse, veraltete Revisionen, Löschung, Lesesperren und Archivaktualisierung. LocalStorage bietet weiterhin keine atomare Compare-and-Swap-Garantie; ein echter Safari-Hardwaretest bleibt offen.

## Sprint 30: Sichere Cache-Übergabe bei Service-Worker-Updates
Bei der Aktivierung bleibt die unmittelbar vorherige Offline-Shell als kurzlebige Rückfallkopie erhalten. Damit können bereits laufende Anfragen des vorherigen Service Workers während des Versionswechsels noch ihre alten Dateien lesen. Ältere Shell-Caches werden entfernt; Cache-Namen anderer Anwendungen sowie neuerer Versionen bleiben unangetastet. Scheitert die Bereinigung wegen Browser-Berechtigungen, wird eine vollständig validierte neue Shell trotzdem aktiviert. Die alte Shell wird **nicht** als Ersatz für einen beschädigten aktiven Versionscache ausgeliefert: Ohne vollständige aktive Shell schlägt die Navigation weiterhin geschlossen fehl, statt unterschiedliche Versionen zu mischen. Das zusätzliche Cache-Budget ist höchstens eine frühere Release-Shell unter normalen Browserbedingungen; Browser können Cache-Inhalte unabhängig davon löschen. Node-Regressionen und ein Chromium-Update-Meilenstein prüfen diese Übergabe.

## Mehrtab-Sicherungsrennen (Sprint 31)
Vor dem Schreiben einer optionalen Wiederherstellungskopie wird deren zuvor gelesene Revision erneut verglichen. Eine fremde Änderung bleibt erhalten und löst eine Redundanzwarnung aus. Die Primärrevision wird auch vor und nach der optionalen Sicherung geprüft; bei zwischenzeitlicher Überschreibung meldet die Anwendung einen Speicherkonflikt statt einen falschen Erfolg. Unlesbare optionale Backups blockieren gültige Primärdaten nicht. Diese Prüfungen sind Best Effort, da `localStorage` kein atomares Compare-and-Swap über mehrere Schlüssel bietet.

## Sprint 32: Asynchrone Archivfreigabe und Revisionsschutz
Die Archivdatei-Übernahme wartet nun auf eine möglicherweise asynchrone Bestätigung, statt ein noch ausstehendes Promise als Zustimmung zu interpretieren. Nach verzögertem Dateilesen wird die ursprünglich angezeigte Archivrevision vor dem Bestätigungsdialog geprüft und unmittelbar vor dem Schreiben erneut kontrolliert. Abbruch, abgelehnte Bestätigung und parallele Änderungen lassen das vorhandene Archiv sowie den aktiven Projektstand und dessen Sicherung unverändert. Vier zusätzliche Node-Regressionen simulieren verzögerte Zustimmung, Abbruch, Dialogfehler und konkurrierende Browser-Tabs. Die Offline-Shell-Version wird angehoben, damit die Änderung auch nach einem PWA-Update zuverlässig geladen wird.

### Sprint 35 – wiederaufnehmbare Offline-Promotion

Eine vollständig validierte temporäre Offline-Shell bleibt nach einem fehlgeschlagenen Übernahme-Schreibvorgang erhalten. Bei erneutem Versuch oder nach Service-Worker-Neustart wird sie vor jeder Nutzung vollständig geprüft und kann ohne erneuten Netzwerkabruf in den aktiven Versionscache übernommen werden. Unvollständige oder ungültige temporäre Caches werden nicht übernommen und bei fehlgeschlagener Neuvalidierung bereinigt. Nach erfolgreicher Übernahme wird der temporäre Cache entfernt. Die vorherige vollständige Release-Shell bleibt unabhängig davon erhalten. CacheStorage bietet weiterhin keine atomaren Mehrdatei-Transaktionen; die Anwendung verweigert deshalb bei unvollständigem aktivem Cache die Navigation, statt Versionen zu mischen.

## Sprint 36: Konsistente Cache-Lesevorgänge während Wiederherstellung
Die Offline-Shell nutzt einen monotonen Revisionszähler vor und nach jeder Wiederherstellung. Verzögerte Cache-Lesevorgänge werden bei zwischenzeitlicher Promotion verworfen und gegen den neuen Stand erneut gelesen. Das gilt auch für HTML-Navigationen mit vollständiger Shell-Prüfung. Laufende Netzwerkanfragen dürfen nach einer abgeschlossenen Promotion keine veraltete Antwort mehr in den aktiven Cache schreiben. Nach fehlgeschlagener Promotion werden statische Antworten bis zur nächsten erfolgreichen Wiederherstellung geschlossen abgewiesen; die zuvor vollständige Release-Shell bleibt erhalten. Fünf deterministische Race-Regressionen prüfen Erfolg und Fehler bei verzögerten Cache-Lese- und Netzwerkanfragen. CacheStorage bleibt nicht atomar, und ein physischer Safari-Hardwaretest steht aus.


## Sprint 37: Cache-only-Anfragen und öffentliche Antwortintegrität
Ein expliziter Browser-Request mit `cache: 'only-if-cached'` darf weder bei fehlenden Modulen noch bei unvollständiger Navigation einen Netzabruf oder eine Shell-Wiederherstellung starten. Vertrauenswürdige vollständige Cache-Treffer bleiben verwendbar; ungültige Cache-Einträge schlagen geschlossen fehl. Die Offline-Vertrauensprüfung verwirft außerdem Antworten mit `Set-Cookie`/`Set-Cookie2` sowie jeglichem `Content-Range`, auch bei irreführendem HTTP 200. Diese Schutzregeln gelten gleichermaßen für Installation, vorhandene Cache-Einträge und Laufzeit-Reparaturen. Die Shell-Version wird angehoben, um Altbestände erneut zu validieren. Browser-CacheStorage bleibt nicht transaktional; eine physische Safari-Abnahme ist weiterhin offen.

## Sprint 38: Wiederanlauf nach spät gemeldeten Cache-Fehlern
Eine bereits vollständig gespeicherte Offline-Shell kann bei einer spät gemeldeten
Speicherfehlermeldung zunächst vorsorglich blockiert bleiben. Eine erneute
Navigation prüft nun die **gesamte** Shell und den unveränderten
Wiederherstellungs-Epoch; nur bei vollständiger Integrität wird die Sperre
aufgehoben. Einzelne Cache-Treffer dürfen sie nicht aufheben. Zusätzlich
werden unbekannte HTTP-`Vary`-Dimensionen für öffentliche Offline-Dateien
abgewiesen, um nutzer- oder sitzungsspezifische Cache-Varianten nicht
persistieren zu lassen. Node-Fault-Injection prüft späte Schreibfehler,
unvollständige Promotionen und HTTP-Header-Varianten. CacheStorage bleibt
nicht transaktional; echte iOS-/Safari-Hardwaretests stehen weiter aus.

## Sprint 39: Dauerhafte Wiederherstellungs-Sperre über Worker-Neustarts
Ein verbliebener temporärer Offline-Cache signalisiert jetzt auch nach einem Neustart eine möglicherweise unterbrochene Mehrdatei-Übernahme. Vollständig erscheinende aktive Dateien werden nicht allein anhand gültiger HTTP-Metadaten freigegeben, solange die Übernahme nicht abschließend bereinigt ist. Statische Anfragen scheitern dann geschlossen; eine reguläre Navigation kann einen vollständig validierten Zwischenspeicher offline erneut übernehmen. Auch ein ungültiger oder nicht erneut herunterladbarer Zwischenspeicher bleibt bei Fehlschlag als Sperrhinweis bestehen. Nach erfolgreicher Übernahme wird er entfernt. Neue Fault-Injection-Regressionen decken spät gemeldete letzte Schreibfehler, Neustarts und ungültige Zwischenstände ab. Browserseitige CacheStorage-Löschung/Eviction und fehlende atomare Mehrdatei-Transaktionen bleiben technische Grenzen.


## Sprint 41: Dauerhafte Bestätigung des Offline-Promotion-Abschlusses
Nach erfolgreicher Übernahme aller Shell-Dateien gilt die Aktualisierung erst dann als abgeschlossen, wenn die temporäre Wiederherstellungs-Sperre nachweislich entfernt wurde. Schlägt das Entfernen mit Fehler oder `false` fehl oder meldet der Browser fälschlich Erfolg, obwohl der Zwischenspeicher weiter existiert, werden Navigation und statische Cache-Treffer vorsorglich blockiert. Ein neuer Service Worker kann die geprüfte Zwischenversion anschließend ohne Netzwerk erneut übernehmen. Drei zusätzliche Fault-Injection-Regressionen simulieren diese Löschfehler, den Neustart und die Offline-Fortsetzung. Die vorherige vollständige Release-Shell bleibt erhalten. CacheStorage besitzt weiterhin keine atomaren Mehrdatei-Transaktionen.

## Sprint 43: geschützte Wiederherstellung bei fehlendem Primärstand

Ein fehlender Primärschlüssel ist nicht automatisch ein neues Projekt: Eine vorhandene lokale Wiederherstellungskopie kann die einzige verbleibende Fassung enthalten. Ohne ausdrücklich autorisierte Wiederherstellung lehnt die Speicherlogik deshalb das Anlegen eines neuen Primärstands ab und verändert keinen der beiden Schlüssel. Bei expliziter Wiederherstellung bleibt die vorhandene Sicherung unangetastet. Ist der Primärstand beschädigt, wird eine zwischenzeitliche Änderung der Wiederherstellungskopie vor dem Schreiben erneut geprüft. Gleiches gilt für den fehlenden Primärstand, wenn die Sicherung zwischen Prüfung und Schreiben von einem anderen Tab geändert wird. Neue Regressionstests prüfen Wiederherstellungspflicht, sichere Freigabe, Quota-/Lesefehler, konkurrierende Sicherungsänderungen und die unveränderte Erstinstallation. Der Check ist Best Effort: `localStorage` besitzt kein atomares Compare-and-Swap über mehrere Schlüssel. Die Offline-Shell-Version wurde wegen des geänderten Speichermoduls erhöht.

## Sprint 45: Revisionsschutz für wiederhergestellte Browserstände

Nur im Recovery-Zustand wird der beim Laden beobachtete Backup-Rohwert als
optimistische Schreibbedingung mitgeführt. Speicher-Events und Rückkehr aus
einem eingefrorenen Tab prüfen zusätzlich diese Backup-Revision. Eine
zwischenzeitlich geänderte oder gelöschte Sicherung führt zum Abbruch vor
dem ersten Schreibzugriff. Gesunde Primärdaten bleiben von optionalen
Backup-Lesefehlern unabhängig. localStorage bietet kein atomares CAS.


## Sprint 46: Revisionsschutz bei beschädigten Browserständen

Auch wenn sowohl die aktive lokale Kopie als auch die Wiederherstellungskopie
beschädigt sind (oder die Wiederherstellungskopie fehlt), wird deren **exakter
Ausgangszustand** beim Laden festgehalten. Vor einer ausdrücklich bestätigten
Ersetzung wird erneut geprüft, ob ein anderer Tab zwischenzeitlich eine
Wiederherstellungskopie angelegt, gelöscht oder verändert hat. In diesem Fall
wird der Schreibzugriff verweigert und zum Neuladen aufgefordert, statt eine
möglicherweise rettbare neue Kopie zu verdecken. Storage-Events und die Rückkehr
aus einem eingefrorenen Tab prüfen diesen Zustand ebenfalls. Der Schutz ist
Best-Effort: Browser-localStorage bietet keine atomare Mehrschlüssel-Transaktion.
Die Regressionen verwenden ausschließlich synthetische lokale Daten.

## Sprint 47: Bytegenaue Bestätigung der Offline-Promotion

Eine vollständige HTTP-/MIME-Prüfung allein erkennt keine unbemerkte
CacheStorage-Schreibverweigerung, wenn noch gültig aussehende Dateien einer
älteren Revision vorhanden sind. Deshalb werden nach der vollständigen
Übernahme die tatsächlich gespeicherten Antwortkörper aller Shell-Dateien
byteweise mit dem isolierten Wiederherstellungs-Cache verglichen. Erst bei
vollständiger Übereinstimmung darf dessen dauerhafte Sperre entfernt werden.
Bei stumm ignorierten Schreibvorgängen, gleichartig getarnten Änderungen oder
Eviction einzelner Staging-Dateien bleibt die Sperre erhalten; eine Navigation
kann die vorhandene vollständige Staging-Version auch nach einem Neustart
offline erneut übernehmen. Die Prüfung läuft nur bei einer vollständigen
Wiederherstellung, nicht bei gewöhnlichen Cache-Treffern. Grenzen bleiben
nicht atomare CacheStorage-Operationen, vollständige Browser-Eviction und
fehlende physische iPhone-/Safari-Abnahme. Die Tests verwenden ausschließlich
synthetische Antworten und keine Produktivdaten.

## Sprint 49: Nachweis dauerhaft angelegter Offline-Sperren

Eine erfolgreich abgeschlossene CacheStorage-Öffnung garantiert nicht, dass
der neue Cache im persistenten Verzeichnis erscheint. Vor dem ersten aktiven
Schreibvorgang einer Wiederherstellung wird deshalb die tatsächliche Existenz
der Sperre erneut geprüft, auch nach dem Staging. Bei fehlendem Nachweis wird
keine Promotion gestartet. Bei unbestätigten Runtime-Schreibvorgängen darf
eine nicht dauerhaft angelegte Sperre keinen Erfolg melden: Die verdächtige
Datei wird nach Möglichkeit entfernt und der Zugriff gesperrt. Drei
synthetische Regressionen decken nicht persistiertes Staging, korrupte
Runtime-Bytes und still verworfene Schreibvorgänge ab. CacheStorage bleibt
nicht atomar; eine vollständige Browser-Eviction kann nicht verhindert werden.

## Sprint 50: destruktive und sitzungsbezogene HTTP-Metadaten
Der Offline-Trust-Gate lehnt statische Antworten mit `Clear-Site-Data`, `Refresh`, `WWW-Authenticate` oder `Proxy-Authenticate` ab. Ebenso sind Content-Disposition-Werte außer `inline` nicht mehr cachefähig. Das gilt für Installation, Runtime-Nachladung und bereits vorhandene Cache-Treffer; synthetische Regressionen prüfen die drei Pfade und weiterhin erlaubte öffentliche Inline-Assets. Die Shell-Version wurde auf v44 angehoben. Der Filter schützt vor der Wiederverwendung gefährlicher Header im Offline-Cache, kann aber nicht verhindern, dass ein Browser bereits beim ursprünglichen HTTP-Empfang einen Header verarbeitet. Lokale JSON-Sicherungen bleiben erforderlich.


## Sprint 52: Read-only-Notfallsicherung beschädigter Browserdaten

Bei beschädigtem Primärstand, Wiederherstellungskopie, Speicherkonflikt oder
beschädigtem Archiv steht ein expliziter Rohdaten-Export zur Verfügung.
Er sichert die **exakten** lokalen Rohwerte von Primärstand, Backup und Archiv
in eine lokale JSON-Datei, ohne einen Browser-Schreibzugriff. Dieses Format
ist absichtlich nicht über reguläre Importwege einlesbar: beschädigte Daten
dürfen nicht ungeprüft übernommen werden. Die Sicherung ist auf 2 MB begrenzt;
eine zweite Leseprüfung erkennt zwischenzeitliche Tab-Änderungen bestmöglich.
Lesefehler, Übergröße und Revisionskonflikte brechen ohne Mutation ab.
Die Datei kann sensible lokale Inhalte enthalten und muss sicher aufbewahrt
werden. Vollständige Browser-Eviction und fehlende atomare Transaktionen
bleiben technische Grenzen. Offline-Shell v45.


## Sprint 53: Fail-closed nach nicht persistierter Offline-Schutzmarkierung
Wenn ein Laufzeit-Cache-Schreibvorgang beschädigte Bytes hinterlässt und weder
Schutzmarkierung noch Löschung zuverlässig gespeichert werden können, gilt ein
vollständiger Satz MIME-korrekter Dateien **nicht** als vertrauenswürdig.
Der aktive Service Worker sperrt dann auch scheinbar vollständige Cache-Treffer;
erst eine vollständig nachgelesene und byteweise verifizierte Neu-Promotion
kann den Zustand freigeben. Cache-only-Anfragen bleiben strikt offline und
schlagen im Zweifel fehl. Synthetische Tests simulieren den doppelten
Speicherfehler sowie die spätere erfolgreiche Reparatur. Diese Absicherung
gilt für die Lebensdauer des betroffenen Workers; wenn der Browser zugleich
jede persistente Schutzmarkierung und jede Cache-Löschung verweigert, kann
ein Neustart ohne dauerhaftes Signal nicht vollständig abgesichert werden.
Shell v46; keine Cloud-Abhängigkeiten.

## Sprint 54: Nicht-destruktive Archiv-Zusammenführung

Zusätzlich zum ausdrücklich bestätigten Archiv-Ersatz können portable Archivstände jetzt zusammengeführt werden. Vorhandene Einträge bleiben erhalten; exakte Dubletten werden nicht erneut geschrieben und bei ID-Kollisionen mit anderem Inhalt bleiben beide Stände unter unterschiedlichen gültigen IDs bestehen. Kapazitäts-/Byte-Grenzen, Quota-Fehler und konkurrierende Tab-Revisionen werden vor bzw. nach dem atomaren Einzelkey-Schreiben geprüft. Ein asynchrones Bestätigungsfenster kann keine ungeprüften Änderungen freigeben. Der aktive Arbeitsstand und seine Sicherung werden nie verändert. Sämtliche Regressionen nutzen synthetische Daten; localStorage hat weiterhin keine atomare Compare-and-Swap-Operation. Offline-Shell v47.

## Sprint 56: Strikte Archivstruktur und bestätigte Schreibbarkeit
Auch manuell beschädigte Browser-Archive mit als Arrays codierten IDs werden als beschädigt behandelt, nicht als gültige Stände. Direkte Import- und Zusammenführungsaufrufe weisen lückenhafte Arrays und Array-Objekte vor jeder Speicherung ab. Nach einem Archiv-Schreibvorgang genügt nicht allein der Bytevergleich: Der persistierte Stand muss erneut vollständig lesbar und strukturell gültig sein. Regressionstests prüfen unveränderte Daten bei fehlerhaften Eingaben. Die Offline-Shell erhält eine neue Cache-Version; keine Änderungen an der Stamm-Anwendung.

## Sprint 57: Idempotente Speicherung und Sicherungserhalt
Ein unveränderter aktiver Stand mit gültiger Rückfallkopie wird nicht erneut geschrieben: Die vorherige Sicherungsrevision bleibt erhalten. Fehlende oder beschädigte Rückfallkopien werden weiterhin repariert. Identische Archivimporte benötigen keinen Bestätigungsdialog und keinen Schreibvorgang; konkurrierende Revisionen werden weiterhin abgewiesen. Zusätzliche Node-Regressionen sichern diese Datenverlustinvarianten ab.

## Sprint 58: Offline-Neustart und konkurrierende Shell-Reparaturen
Zeitgleiche Reparaturen desselben öffentlichen Shell-Pfads verwenden einen gemeinsamen anonymen Netzwerkabruf und einen verifizierten Cache-Schreibvorgang. Andere Pfade bleiben unabhängig; reine Cache-Anfragen starten auch indirekt keine Netzwerkoperation. Ein fehlgeschlagener Abruf blockiert spätere Versuche nicht. Synthetische Regressionen prüfen parallele Requests, Cache-only, Netzwerkfehler mit Wiederanlauf, Offline-Worker-Neustart und den getrennten Cache bei Versionswechsel oder fehlgeschlagenem Update. Shell-Version v49. CacheStorage bleibt nicht atomar; vollständige Eviction und physische iPhone-/Safari-Abnahme sind weiterhin Grenzen.
