# Detailplan: Persönlicher Assistent mit Bonsai, Obsidian, Todoist und Company OS

## Kontext
Ziel: Du chattest per Telegram (unterwegs) oder im Dashboard (zu Hause) mit deinem Assistenten. Er
- sucht im Obsidian-Vault, auch in PDFs, die in Notizen verlinkt sind (etwa Verträge),
- beantwortet Fragen mit dem Modell Bonsai 2 27B auf dem Mac, den der Pi über Tailscale aufruft, ohne Anthropic-API-Key,
- legt Todoist-Aufgaben und Notizen im Vault an,
- zeigt dir Eskalationen, Tasks und Deliberationen von Company OS und steuert sie.

Der Code ist fertig und getestet: 25/25 Tests grün. Er liegt im Entwurfs-PR https://github.com/Wimmsi82/company-os/pull/3.
Dieser Plan beschreibt die **Inbetriebnahme auf Pi und Mac** und die **Nacharbeiten im Code**.
Jede Phase endet mit einem Prüfpunkt. Erst weitermachen, wenn er grün ist.

Legende: 🧑 = machst du, 🤖 = mache ich in einer Session, ⏱ = geschätzter Aufwand

---

## Phase 0: Fehlende Dateien ins Repo — ERLEDIGT (anders als geplant) ✅
**Was war der Plan:** `src/db/index.js`, `src/db/migrate.js` und `src/vault/index.js` vom produktiven Pi committen.

**Was tatsächlich passiert ist:** Der Pi, den Bernhard erreichen konnte (`bernhard@Raspi2`), hatte Company OS nie installiert — frischer `git clone` zeigte, dass `src/db/` und `src/vault/index.js` **dort ebenfalls fehlen**. Der ursprüngliche produktive Pi (`admin@192.168.188.153` aus der Deploy-Doku) war nicht erreichbar.

**Lösung:** Beide Dateien wurden aus der Nutzung im gesamten Code rekonstruiert — jeder der ~65 `db.*`-Aufrufe über `agents/`, `scheduler/`, `api/`, `webhooks/` wurde extrahiert (Argumentreihenfolge, Objekt- vs. positionelle Aufrufe, exakte zurückgegebene Feldnamen), daraus das Schema (`src/db/migrate.js`, 15 Tabellen) und die Query-Funktionen (`src/db/index.js`) gebaut. `src/vault/index.js` (`readVaultContext`, `writeCycleLog`, `writeAlertToInbox`) passend zum Format aus `src/vault/search.js` rekonstruiert.

Dabei zwei echte Bugs gefunden und mitbehoben:
- `src/vault/search.js`: `\z` ist in JS kein Zeilenende-Anker (anders als Python/Ruby) — der CEO-Synthese-Regex griff dadurch nie, wenn der Abschnitt am Dateiende steht (der Normalfall bei `writeCycleLog`).
- Fehlende `id`-Tiebreaker auf `ORDER BY *_at`-Queries: SQLite `datetime('now')` hat nur Sekundenauflösung, zwei Schreibvorgänge in derselben Sekunde sortierten sonst nicht zuverlässig "neueste zuerst".

**Verifiziert:** 38/38 Tests grün (13 neue für `src/db`), echter Serverstart im CLI-Modus ohne `ANTHROPIC_API_KEY`, `/api/status` antwortet, eine komplette Deliberation-Rundreise (Cycle anlegen → Vault-Log schreiben → über `searchCycleHistory` wiederfinden) manuell durchgespielt. Commit: `7341318`.

**Prüfpunkt:** Der PR enthält jetzt `src/db/*.js` und `src/vault/index.js`. Noch offen: Die rekonstruierten Funktionen wurden nie gegen die **Original-Daten** des produktiven Pi getestet (falls der wieder erreichbar wird, lohnt ein Abgleich der `.sqlite`-Datei gegen das neue Schema — siehe Risiko unten).

---

## Phase 1: Pi vorbereiten ✅ (23.09.2026: Node 22.23.2 installiert, 116 GB frei, 53,8 °C, 38/38 Tests grün)
1. **Node-Version prüfen:** `node --version`. `obsidian-headless` braucht **22 oder neuer**.
   Ist sie älter:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs
   cd ~/Dev/company-os && npm rebuild better-sqlite3   # native Bindings nach Node-Upgrade
   ```
2. **Speicherplatz prüfen:** `df -h ~`. Nötig ist Platz für Vault und PDFs, das Modell liegt auf dem Mac.
3. **Kühlung:** `vcgencmd measure_temp` (über 80 °C = Drosselung). Ohne Modell auf dem Pi unkritisch.
4. **Swap:** `free -h`. Bei 16 GB ist kein Swap nötig. Falls zram aktiv ist, bleibt es so.

**Prüfpunkt:** Node 22 oder neuer, `sudo systemctl status company-os` läuft wie bisher.

---

## Phase 2: Bonsai auf dem Mac ✅ (24.09.2026)

**Warum Mac statt Pi:** Am 23.09.2026 auf dem Pi gemessen. Vulkan stürzt bei jeder Anfrage ab, die CPU schafft mit 4B nur 6,7 Token/s beim Einlesen (565 Token = 100 s, echte Vault-Frage 3 bis 4 min). Details: `docs/ASSISTENT.md`, Abschnitt Modellwahl.

**Pi aufräumen** (Modell-Reste aus den Tests beenden, RAM und CPU frei):
```bash
pkill -f llama-server; sudo systemctl disable --now bonsai
```

**Mac:**
```bash
cd ~/Bernhard/Dev/company-os && git pull
bash scripts/install-bonsai-mac.sh          # Default 27B
```
Das Skript nutzt `~/Dev/modelle/Bonsai-demo`, lädt das Modell nur, wenn es fehlt, bindet `llama-server` (Metal) nur an die Tailscale-IP, legt einen API-Key an, richtet den LaunchAgent `ai.prism.bonsai` ein und gibt am Ende `LOCAL_LLM_URL` und `LOCAL_LLM_API_KEY` aus.

Optional, damit der Mac am Netzteil wach bleibt: `sudo pmset -c sleep 0`.

**Messen vom Pi aus** (die zwei Zeilen vorher in `~/Dev/company-os/.env` eintragen):
```bash
cd ~/Dev/company-os && git pull
node scripts/bonsai-bench.js
```

| Gesamtzeit Benchmark | Maßnahme |
|---|---|
| unter 30 s | 27B behalten |
| 30 bis 90 s | `ASSISTANT_CONTEXT_CHARS=3000` in `.env`, erneut messen |
| über 90 s | `bash scripts/install-bonsai-mac.sh 8B` (lädt ca. 2 GB) |

**Prüfpunkt:** `bonsai-bench.js` liefert vom Pi aus eine sinnvolle deutsche Antwort unter 30 s. Ohne Key antwortet der Server mit 401. Messwert: **26,3 s** (27B, 3.256 Token, 171,9 Token/s Einlesen, 12,3 Token/s Antwort), 401 ohne Key bestätigt. ✅

---

## Phase 3: Obsidian Sync auf den Pi 🧑 ⏱ 20 min (plus erste Synchronisation)
```bash
npm install -g obsidian-headless
ob login                                   # Obsidian-Konto
ob sync-list-remote                        # Name des Remote-Vaults prüfen
mkdir -p ~/vault && cd ~/vault
ob sync-setup --vault "Vault"              # E2E-Passwort eingeben, falls gesetzt
ob sync --path ~/vault                     # erster Abgleich, dauert je nach Grösse
ls ~/vault                                 # Inbox/ Workspace/ Archiv/ Projekte/ sichtbar?
which ob                                   # Pfad merken
sudo cp ~/Dev/company-os/deploy/obsidian-sync.service /etc/systemd/system/
sudo nano /etc/systemd/system/obsidian-sync.service   # ExecStart-Pfad = Ausgabe von `which ob`
sudo systemctl daemon-reload && sudo systemctl enable --now obsidian-sync
```
**Wichtig:** Der Sync-Modus bleibt `bidirectional`. Der Assistent schreibt Notizen nach `Inbox/`, die müssen zurück auf Mac und iPhone.
**Anhänge:** Liegen deine Vertrags-PDFs im Vault? Obsidian Sync überträgt Anhänge nur, wenn in den Sync-Einstellungen **"Alle anderen Dateitypen"** aktiv ist. Das prüfst du in der Obsidian-App unter Einstellungen → Sync.

**Prüfpunkt:** Am iPhone eine Notiz `Inbox/Test Pi.md` anlegen. Innerhalb von 1 bis 2 Minuten erscheint sie mit `ls ~/vault/Inbox`.

---

## Phase 4: Telegram-Bot und Todoist-Token besorgen 🧑 ⏱ 10 min
1. **Telegram:** Der Bot existiert vermutlich schon (Push-Benachrichtigungen seit v6). Falls nicht: `@BotFather` → `/newbot` → Token. Die Chat-ID bekommst du von `@userinfobot`.
   - Derselbe Bot kann senden und empfangen. Es darf aber **kein zweiter Prozess** mit demselben Token `getUpdates` abfragen, sonst gibt es einen Konflikt.
2. **Todoist:** Einstellungen → Integrationen → Entwickler → API-Token kopieren.
   - Optional ein eigenes Projekt "Assistent" anlegen. Die Projekt-ID steht in der URL, sie kommt nach `TODOIST_PROJECT_ID`.

---

## Phase 5: Company OS konfigurieren und neu starten 🧑 ⏱ 10 min
`.env` auf dem Pi ergänzen (Vorlage: `.env.example`, Abschnitt ASSISTENT):
```ini
CLAUDE_MODE=cli
VAULT_PATH=/home/admin/vault
VAULT_NAME=Vault
LOCAL_LLM_URL=http://100.x.y.z:8080   # aus Phase 2 (Tailscale-IP des Macs)
LOCAL_LLM_API_KEY=...                  # aus Phase 2
ASSISTANT_CONTEXT_CHARS=6000          # oder Wert aus Phase 2
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TODOIST_API_TOKEN=...
TODOIST_PROJECT_ID=                   # optional
```
```bash
cd ~/Dev/company-os
npm install                            # installiert pdf-parse
npm test                               # alle grün auch auf dem Pi (aarch64)?
sudo systemctl restart company-os
sudo journalctl -u company-os -f
```
**Erwartete Log-Zeilen:**
- `[Vault-Index] +N ~0 -0 (PDFs neu: M, gesamt: N)`. Der erste Lauf dauert bei vielen PDFs einige Minuten.
- `[Telegram-Bot] Polling gestartet`
- Mögliche Warnungen: `PDF ohne Textebene (Scan?)`. Diese Dateien notieren, sie sind für Phase 8.3.

**Prüfpunkt:**
```bash
curl -s localhost:3000/api/assistant/health
# {"llm":true,"vault_index":"ok","vault_path":"/home/admin/vault","todoist":true}
```

---

## Phase 6: Abnahmetest (Ende-zu-Ende) 🧑 ⏱ 15 min
In Telegram nacheinander ausführen und abhaken:

| # | Eingabe | Erwartung |
|---|---|---|
| 1 | `/hilfe` | Befehlsliste |
| 2 | `/suche Mietvertrag` | Treffer mit 📎, falls ein PDF verlinkt ist, und dem Link "obsidian://" |
| 3 | Auf den obsidian-Link tippen | Obsidian am iPhone öffnet die Notiz |
| 4 | `/lies 1` | Notiz plus `=== PDF: … ===` mit dem Vertragstext |
| 5 | "Wann kann ich den Mietvertrag kündigen?" | Antwort mit [1] und Quellenliste, Dauer notieren |
| 6 | "Und zu welchem Termin?" | Folgefrage nutzt den Verlauf |
| 7 | `/aufgabe Mietvertrag prüfen @ morgen 9 Uhr` | Aufgabe in Todoist mit dem Label `assistent` |
| 8 | `/notiz Idee: Bonsai Pi Test \| Messwert 25 s` | Notiz `Inbox/Idee - Bonsai Pi Test.md` am iPhone nach 1 bis 2 min |
| 9 | `/ergaenze 1 \| Notizen \| Test vom Pi` | Text angehängt, Backup in `.assistant-backup/` |
| 10 | `/heute` | Todoist heute, Eskalationen, geänderte Notizen |
| 11 | `/status`, `/eskalationen` | Daten aus Company OS |
| 12 | `/deliberation Test` → `/nein` | Nichts startet |
| 13 | Mac zuklappen (Ruhezustand), dann Freitext | Nach wenigen Sekunden Meldung "nicht erreichbar" plus Vault-Treffer, nicht erst nach Minuten |
| 14 | Dashboard http://192.168.188.153:3000 → Tab "Assistent" | Status oben rechts grün, Chat funktioniert |
| 15 | Von einem fremden Telegram-Konto an den Bot schreiben | Keine Antwort, im Log steht "fremde Chat-ID ignoriert" |

**Prüfpunkt:** Alle 15 Zeilen sind abgehakt. Abweichungen schickst du mir mit dem Log-Auszug (`journalctl -u company-os --since "10 min ago"`).

---

## Phase 7: Nacharbeiten im Code 🤖 (nach Phase 0 und 6)
### 7.1 Company-Tools gegen die echte DB prüfen, Pflicht
- `src/assistant/company.js` nimmt Feldnamen an: `c.trigger_detail`, `e.context`, `e.from_dept`, `e.task_id`, `getRecentCycles()` ohne Parameter. Sobald `src/db/index.js` im Repo liegt, prüfe ich die Namen und korrigiere sie.
- Einen Test mit echter SQLite-DB ergänzen: `npm run migrate` in eine Temp-Datei, danach `status()`, `openEscalations()` und `answerEscalation()` aufrufen.

### 7.2 Befunde aus deinem Abnahmetest
- Antworten zu langsam: Kontext kürzen (nur der beste Treffer voll, die anderen als Auszug) oder Streaming einbauen, in Telegram mit `editMessageText` alle 3 Sekunden.
- Falsche Treffer: Gewichtung in `bm25()` anpassen (`src/vault/indexer.js`, Funktion `search`) oder Ordner wie `Archiv/` abwerten.
- Das Modell erfindet Dinge: Temperatur auf 0.1 senken und den System-Prompt in `src/assistant/index.js` schärfen.

### 7.3 PR fertigstellen
- CHANGELOG ergänzen, PR von Entwurf auf "ready" stellen, danach mergen. Das machst du oder ich auf deinen Auftrag.

---

## Phase 8: Ausbaustufen (optional, einzeln beauftragen)
| # | Ausbau | Nutzen | Aufwand |
|---|---|---|---|
| 8.1 | **Morgen-Briefing** per Cron 07:30: `/heute` automatisch an Telegram | Tagesstart ohne Nachfrage | klein |
| 8.2 | **CEO-Action-Items → Todoist**: Action Items an `operator` automatisch als Aufgabe (`src/agents/ceo.js` → `todoist.createTask`) | Company OS landet in deinem Aufgabensystem | klein |
| 8.3 | **OCR für gescannte PDFs** (`tesseract-ocr` + `pdftoppm`, nur für Dateien mit "PDF ohne Textebene") | Auch eingescannte Verträge werden durchsuchbar | mittel, CPU-intensiv, nachts laufen lassen |
| 8.4 | **Semantische Suche** (lokale Embeddings, z. B. `multilingual-e5-small` über llama.cpp, `sqlite-vec`) | Findet "Kündigung" auch bei "Beendigung des Mietverhältnisses" | mittel |
| 8.5 | **Sprachnachrichten** in Telegram → whisper.cpp auf dem Pi → Text → Assistent | Unterwegs diktieren | mittel |
| 8.6 | **Tailscale** fürs Dashboard unterwegs | Chat-Tab auch außerhalb des Heimnetzes, ohne offene Ports | klein, nur Konfiguration |
| 8.7 | **Fristen-Wächter**: Kündigungsfristen aus Vertragsnotizen (Frontmatter `kuendigung_bis:`) automatisch als Todoist-Erinnerung | Keine verpassten Fristen | mittel |

---

## Risiken (zuerst lesen)
0. **Falls der ursprüngliche produktive Pi (mit der echten `db/company-os.sqlite`) doch noch existiert:** Das rekonstruierte Schema in `src/db/migrate.js` ist aus der Code-Nutzung abgeleitet, nicht aus der Original-Datei. `CREATE TABLE IF NOT EXISTS` überschreibt nichts, eine bereits vorhandene `.sqlite` mit abweichenden Spalten kann aber zu Laufzeitfehlern führen. Vor dem ersten Start auf diesem Pi: `sqlite3 db/company-os.sqlite ".schema"` gegen `src/db/migrate.js` gegenlesen, oder die Datei vorher sichern (`cp db/company-os.sqlite db/company-os.sqlite.bak`) und mich mit dem Original-Schema kontaktieren, bevor der Dienst neu startet.
1. **Mac muss wach sein.** Schläft er, gibt es nur Vault-Treffer statt Antworten. Befehle funktionieren weiter. Tempo auf dem M5 (nicht Max) ist noch ungemessen, Phase 2 zeigt es.
2. **Verträge liegen auf dem Pi.** Er ist nur im LAN erreichbar, Telegram läuft über ausgehende Verbindungen. Wer Zugang zum Pi hat, hat Zugang zum Vault. Deshalb SSH nur mit Key, kein Passwort-Login.
3. **Telegram-Server sehen Chat-Inhalte**, also auch Auszüge aus Verträgen in den Antworten. Ist dir das bei sensiblen Dokumenten zu viel, nutzt du diese nur im Dashboard.
4. **Sync-Konflikte:** Der Assistent schreibt nur neue Dateien in `Inbox/` und hängt an bestehende nur an. Bearbeitest du dieselbe Notiz gleichzeitig am Mac, erzeugt Obsidian eine Konfliktdatei. Es geht nichts verloren, aber du musst aufräumen.
5. **Vault-Auszüge gehen über das Netz:** Pi → Mac, verschlüsselt über Tailscale. Der Server auf dem Mac hört nur auf der Tailscale-IP und verlangt einen API-Key.
6. **Der Code wurde nur mit Fakes getestet.** Echter `llama-server`, Todoist und Telegram laufen erst in Phase 6 zum ersten Mal zusammen.

## Rollback
```bash
sudo systemctl stop obsidian-sync
launchctl bootout gui/$(id -u)/ai.prism.bonsai   # auf dem Mac
# In .env TELEGRAM_BOT_TOKEN leer lassen → Bot aus (Push-Nachrichten dann auch aus)
git checkout main && npm install && sudo systemctl restart company-os
```
Vault-Kopie und Index lassen sich gefahrlos löschen: `rm -rf ~/vault db/vault-index.sqlite db/assistant.sqlite`.

## Reihenfolge und Zeitbedarf
Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Für dich sind das rund 1,5 bis 2,5 Stunden, der größte Block ist die erste Obsidian-Synchronisation in Phase 3.
Phase 8 kommt danach, nach Priorität. Meine Empfehlung: zuerst 8.1 und 8.2 (klein, sofort spürbar), dann 8.7.
