# Wartezeit-UX Audit — company-os (2026-08-18)

Geprüft gegen `.claude/skills/wartezeit-ux/SKILL.md`. Umfang: `src/ui/index.html`
(einzige Frontend-Datei, 789 Zeilen Vanilla JS, 11 Views/Tabs, Polling alle 30s).
Kein Framework, keine neuen Dependencies vorgesehen — Fixes bleiben im bestehenden
Vanilla-JS/CSS-Stil.

## Systemische Befunde

1. **Jeder `fetch(...).catch(() => [] / null)` schluckt HTTP-Fehler wie
   Netzwerkfehler** — an 12 Stellen (`loadStatus`, `loadEscalations`, `loadTasks`,
   `loadFollowups`, `loadMetrics`, `loadMemory`, `loadMessages`, `loadBudget`,
   `loadCycles`, `loadProjects`, `loadWebhookConfigs`, `loadWebhookEvents`). Da
   nirgends `resp.ok` geprüft wird und der Catch-Fallback (`[]`/`null`) identisch
   zum "echt leer"-Fall ist, zeigt ein totes Backend exakt denselben Zustand wie
   ein frischer Account ohne Daten ("Keine Tasks.", "Keine Eskalationen." etc.).
2. **Kein einziges ARIA-Attribut im gesamten Dokument** — keine `role="status"`,
   kein `aria-live`, kein `aria-busy` an irgendeiner Stelle. Alle 9 "Lade …"-Texte
   und alle dynamisch nachgeladenen Tabellen/Karten sind für Screenreader unsichtbar.
3. **Keine Pending-/Disabled-Zustände an Buttons mit Seiteneffekt** — `▶ Starten`,
   `⚙ Queue`, `✓ Antworten`, `✕ Ablehnen`, `+ Task`, `✓ Manuell schließen`,
   `+ Projekt erstellen`, `▶ Deliberation`, `Archivieren`, Metrik-Speichern-Häkchen:
   keiner davon wird während der Anfrage disabled. Ein Doppelklick auf `+ Task`
   oder `+ Projekt erstellen` erzeugt doppelte Einträge.
4. **`runDeliberation()`/`processQueue()` sind Fire-and-Forget ohne Abschluss-Signal**
   — Log zeigt sofort "Läuft im Hintergrund …", danach gibt es keinerlei Rückmeldung
   (kein Polling, kein Websocket), wann die Deliberation fertig ist. Nutzer muss
   manuell auf "Tasks" wechseln und raten.
5. **`loadStatus()` kann still scheitern, während `"Dashboard v3 verbunden."` fix
   im Log steht** — die Verbunden-Meldung beim Init ist eine statische Zeile, die
   nichts mit dem tatsächlichen ersten `loadStatus()`-Aufruf zu tun hat; schlägt der
   fehl, bleiben alle Header-Stats bei `–` stehen, ohne dass irgendwo ein Fehler
   sichtbar wird.

## Befunde-Tabelle

| Datei/Zeile | Vorgang | Geschätzte Dauer | Aktueller Zustand | Verletzte Regel | Empfohlene Lösung | Aufwand |
|---|---|---|---|---|---|---|
| `index.html:440-452` `loadStatus()` | Header-Stats laden (Uptime/Tokens/Kosten/Eskalationen), alle 30s gepollt | <1s lokal, unbegrenzt bei Backend-Ausfall | Bei Fehler: `catch(() => null)` → Funktion kehrt still zurück, Werte bleiben für immer auf letztem Stand/`–` | Regel 1 (Fehler ≠ Leerzustand), harte Regel 1 (kein Fake-Zustand) | `resp.ok` prüfen; bei Fehler `role="alert"`-Hinweis neben den Stats, nicht nur stumm einfrieren | S |
| `index.html:439` init `loadStatus(); addLog('SYSTEM','Dashboard v3 verbunden.','s')` | Initiale Verbindungsmeldung | sofort | Meldung ist unabhängig vom tatsächlichen Ergebnis von `loadStatus()` — auch bei Fehler "verbunden" | harte Regel 1 (kein Fake-Erfolg) | Meldung erst nach erfolgreichem ersten `loadStatus()` loggen, bei Fehler `addLog(..., 'e')` mit Fehlertext | S |
| `index.html:473-501` `loadEscalations()` | Eskalations-Inbox laden | meist <1s, LLM-Backend kann Sekunden brauchen | `catch(() => [])` → "Keine Eskalationen." bei Fehler wie bei echt leer; kein `role="status"` am Ladezustand | Regel 1, ARIA-Anforderung | `resp.ok` prüfen, bei Fehler eigene `role="alert"`-Meldung; `role="status" aria-live="polite"` auf `#escBody` | S |
| `index.html:503-511` `answerEsc()` / `dismissEsc()` | Eskalation beantworten/ablehnen | Netzwerk-Rundtrip | Buttons bleiben aktiv während der Anfrage, kein Pending-Zustand, kein Fehler-Feedback bei fehlgeschlagenem `fetch` | Regel 1, Threshold-Tabelle (400ms–1s → lokaler Indikator) | Buttons während Request disabled + `aria-busy`; `resp.ok` prüfen, Fehler via `addLog(...,'e')` statt stillem Schlucken | S |
| `index.html:521-535` `loadTasks()` | Task-Queue laden | <1s | `catch(() => [])`, kein ARIA am Ladezustand der Tabelle | Regel 1, ARIA-Anforderung | Wie `loadEscalations`, plus `role="status"` auf Tabellen-Body-Zelle beim Laden | S |
| `index.html:537-548` `createTask()` | Task manuell erstellen | Netzwerk-Rundtrip | Kein Disabled-State auf `+ Task`-Button während der Anfrage → Doppelklick erzeugt Duplikate; kein Fehler-Feedback bei fehlgeschlagenem `fetch` | Regel 1, harte Regel 3 (Spinner reicht oft) | Button während Request disabled + `aria-busy`; `resp.ok` prüfen + Fehlermeldung | S |
| `index.html:600-606` `saveMetric()` | Metrik-Wert speichern (Inline-Edit) | Netzwerk-Rundtrip | Kein Pending-Zustand am Häkchen-Button, kein Fehler-Feedback | Regel 1 | Button während Request disabled; `resp.ok` prüfen | S |
| `index.html:709-727` `createProject()` | Projekt erstellen | Netzwerk-Rundtrip | Button ohne Pending-Zustand; Erfolg/Fehler-Pfad existiert zwar (`data.ok`), aber `resp.ok` (HTTP-Ebene) wird nicht geprüft — 500 mit ungültigem JSON crasht `res.json()` ungefangen | harte Regel 1, Regel 1 | `resp.ok`-Check vor `res.json()`, Button-Pending-Zustand ergänzen | S |
| `index.html:737-742` `archiveProject()` | Projekt archivieren | Netzwerk-Rundtrip | Browser-`confirm()` statt eigenem Dialog (Stilbruch, blockiert Event-Loop); kein Pending-/Fehler-Zustand | Konsistenz, Regel 1 | Eigenes Confirm-Pattern (leichtgewichtig, kein Framework nötig) oder zumindest `resp.ok`-Check + Pending-Zustand ergänzen | M |
| `index.html:729-735` `startProjectDeliberation()` | Deliberation für Projekt starten | Fire-and-forget, Ergebnis dauert ggf. Minuten | Browser-`prompt()` für Thema-Eingabe; identisches Fire-and-forget-Problem wie `runDeliberation()` (Befund 4) | Konsistenz, Threshold-Tabelle (>10s → Hintergrund+Benachrichtigung) | Eigenes Eingabefeld statt `prompt()`; perspektivisch Abschluss-Signal für Deliberationen (Follow-up-Item, kein isolierter Fix) | M |
| `index.html:764-779` `loadWebhookEvents()` | Event-Log laden | <1s | `catch(() => [])`, kein ARIA | Regel 1, ARIA-Anforderung | Wie `loadEscalations` | S |
| `.pulse`-Animation (CSS, Zeile 151-152) | Dauerhaft pulsierender Status-Punkt (Header + Log-Card) | dauerhaft sichtbar | Keine `prefers-reduced-motion`-Behandlung | ARIA-Anforderung (reduced-motion-Fallback) | `@media (prefers-reduced-motion: reduce)`-Block ergänzt, analog MA-Agent/Berthos | S |

## Positive Befunde (nicht anfassen)

- Log-Panel (`addLog`) gibt für jede Nutzeraktion sofort eine sichtbare Zeile aus —
  gute lokale Rückmeldung, nur die Fehlerfarbe (`'e'`) wird bisher kaum genutzt.
- Empty-States existieren konsequent an jeder Stelle (kein leeres Nichts) — sie
  müssen nur von echten Fehlern unterschieden werden (Befund 1).
- Tab-Wechsel lädt gezielt nur die Daten der neuen View nach (`loaders[id]()`),
  kein unnötiges Nachladen aller Tabs.

## Top 7 (nach Risiko × Häufigkeit)

1. **Fehler-vs-Leer-Zustand an allen 12 `fetch`-Stellen** — der mit Abstand größte
   Befund: betrifft praktisch jede Datenquelle im Dashboard identisch.
2. **`loadStatus()` Fehlerfall + falsche "verbunden"-Meldung** — Header-Stats
   können unbemerkt einfrieren, während das Log Normalbetrieb suggeriert.
3. **ARIA an allen Ladezuständen** (`role="status"`/`aria-live` auf den 9
   "Lade …"-Containern).
4. **Pending-/Disabled-States an allen 10 seiteneffekt-behafteten Buttons**
   (Doppelklick-Duplikate insbesondere bei `+ Task`/`+ Projekt erstellen`).
5. **`createProject()`: `resp.ok`-Check vor `res.json()`** (einziger Fall mit
   ungefangenem Crash-Risiko bei Server-Fehler mit Nicht-JSON-Body).
6. **`prefers-reduced-motion` für `.pulse`**.
7. **`archiveProject()`/`startProjectDeliberation()`: `confirm()`/`prompt()`
   ersetzen** — Stilbruch, aber niedrigeres Risiko als 1-5.

Bewusst nicht in der Top 7: das Fire-and-forget-Problem bei `runDeliberation()`
(Befund 4/Item 10 der Tabelle) — ein echtes Abschluss-Signal für lange laufende
Deliberationen (Minuten, LLM-Backend) bräuchte entweder Polling-Infrastruktur oder
einen Websocket und ist damit eher ein Feature als ein lokaler Wartezeit-UX-Fix;
sollte separat entschieden werden, nicht im selben Batch wie die Punkte oben.

---

**Stopp hier — was soll umgesetzt werden: alles, eine Auswahl, oder anders?**
