# Detailplan: Persönlicher Assistent mit Bonsai auf dem Pi, Obsidian, Todoist und Company OS

## Kontext
Ziel: Du chattest per Telegram (unterwegs) oder im Dashboard (zu Hause) mit deinem Assistenten. Er
- sucht im Obsidian-Vault, auch in PDFs, die in Notizen verlinkt sind (etwa Verträge),
- beantwortet Fragen mit dem lokalen Modell Bonsai auf dem Raspberry Pi 5 (16 GB), ohne API-Key,
- legt Todoist-Aufgaben und Notizen im Vault an,
- zeigt dir Eskalationen, Tasks und Deliberationen von Company OS und steuert sie.

Der Code ist fertig und getestet: 25/25 Tests grün. Er liegt im Entwurfs-PR https://github.com/Wimmsi82/company-os/pull/3.
Dieser Plan beschreibt die **Inbetriebnahme auf dem Pi** und die **Nacharbeiten im Code**.
Jede Phase endet mit einem Prüfpunkt. Erst weitermachen, wenn er grün ist.

Legende: 🧑 = machst du, 🤖 = mache ich in einer Session, ⏱ = geschätzter Aufwand

---

## Phase 0: Fehlende Dateien ins Repo holen (Blocker) 🧑 ⏱ 10 min
**Warum:** Durch `db/` in der `.gitignore` fehlen `src/db/index.js`, `src/db/migrate.js` und `src/vault/index.js` im Repo. Ohne sie startet Company OS aus keinem frischen Checkout. Der PR korrigiert die `.gitignore`, die Dateien selbst liegen aber nur auf dem Pi.

```bash
ssh admin@192.168.188.153
cd ~/Dev/company-os
ls src/db/ src/vault/                     # index.js + migrate.js bzw. index.js vorhanden?
git fetch origin
git checkout claude/focused-heisenberg-1no3tp
git status --short src/db src/vault       # sollten jetzt als "untracked" (??) auftauchen
git add src/db/index.js src/db/migrate.js src/vault/index.js
git commit -m "fix: src/db und src/vault/index.js ins Repo (waren durch .gitignore ausgeschlossen)"
git push
```
**Wenn `src/vault/index.js` auch auf dem Pi fehlt:** Gib mir Bescheid. 🤖 Ich baue `readVaultContext`, `writeCycleLog` und `writeAlertToInbox` neu, passend zu `src/vault/search.js`.

**Prüfpunkt:** Der PR enthält `src/db/*.js`. 🤖 Ich prüfe danach die Company-Tools gegen die echten DB-Funktionen, siehe Phase 7.1.

---

## Phase 1: Pi vorbereiten 🧑 ⏱ 20 min
1. **Node-Version prüfen:** `node --version`. `obsidian-headless` braucht **22 oder neuer**.
   Ist sie älter:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs
   cd ~/Dev/company-os && npm rebuild better-sqlite3   # native Bindings nach Node-Upgrade
   ```
2. **Speicherplatz prüfen:** `df -h ~`. Nötig sind rund 12 GB frei: Modell 8B ca. 3 bis 5 GB, Build ca. 1 GB, dazu Vault und PDFs.
3. **Kühlung:** Der Pi 5 läuft unter Dauerlast mit dem Modell. Ohne aktiven Kühler drosselt er, das siehst du mit `vcgencmd measure_temp` (über 80 °C = Drosselung).
4. **Swap:** `free -h`. Bei 16 GB ist kein Swap nötig. Falls zram aktiv ist, bleibt es so.

**Prüfpunkt:** Node 22 oder neuer, mindestens 12 GB frei, `sudo systemctl status company-os` läuft wie bisher.

---

## Phase 2: Bonsai installieren und messen 🧑 ⏱ 45 bis 90 min (Build und Download)
```bash
cd ~/Dev/company-os
git pull
bash scripts/install-bonsai-pi.sh 8B
```
Das Skript installiert die Build-Tools und klont `PrismML-Eng/Bonsai-demo` nach `~/Dev/modelle/Bonsai-demo`. Danach startet es `setup.sh` mit `BONSAI_MODEL=8B`, erzwingt falls nötig `build_cpu_linux.sh` und richtet `bonsai.service` ein.

Hinweise aus deiner Mac-Installation:
- Der HuggingFace-Token ist optional. Gibst du etwas Falsches ein, lädt das Skript ohne Anmeldung weiter.
- **Kein Stock-llama.cpp und kein Ollama.** Die ternären Formate laufen nur mit dem PrismML-Fork.

**Messen:**
```bash
sudo systemctl status bonsai
curl -s localhost:8080/health
node scripts/bonsai-bench.js
```
**Entscheidung nach dem Messwert:**

| Gesamtzeit Benchmark | Maßnahme |
|---|---|
| unter 30 s | 8B behalten |
| 30 bis 90 s | `ASSISTANT_CONTEXT_CHARS=3000` in `.env`, erneut messen |
| über 90 s | `bash scripts/install-bonsai-pi.sh 4B` |
| 4B immer noch über 90 s | `1.7B`, oder Freitext nur als Fallback nutzen und hauptsächlich Befehle |

27B testest du nur, wenn 8B unter 15 s bleibt. Es passt in den RAM, ist auf der CPU aber vermutlich 3- bis 4-mal langsamer.

**Prüfpunkt:** `bonsai-bench.js` liefert eine sinnvolle deutsche Antwort unter 90 s. Trag den Messwert hier ein: ______

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
LOCAL_LLM_URL=http://127.0.0.1:8080
ASSISTANT_CONTEXT_CHARS=6000          # oder Wert aus Phase 2
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TODOIST_API_TOKEN=...
TODOIST_PROJECT_ID=                   # optional
```
```bash
cd ~/Dev/company-os
npm install                            # installiert pdf-parse
npm test                               # 25/25 grün auch auf dem Pi (aarch64)?
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
| 8 | `/notiz Idee: Bonsai Pi Test \| Messwert 25 s` | Notiz am iPhone in `Inbox/` nach 1 bis 2 min |
| 9 | `/ergaenze 1 \| Notizen \| Test vom Pi` | Text angehängt, Backup in `.assistant-backup/` |
| 10 | `/heute` | Todoist heute, Eskalationen, geänderte Notizen |
| 11 | `/status`, `/eskalationen` | Daten aus Company OS |
| 12 | `/deliberation Test` → `/nein` | Nichts startet |
| 13 | `sudo systemctl stop bonsai`, dann Freitext | Meldung "nicht erreichbar" plus Vault-Treffer, danach `start bonsai` |
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
1. **Tempo auf dem Pi ist unbekannt.** Die 47 Token/s stammen von einem M5 Max mit GPU, der Pi rechnet nur auf der CPU. Freitext kann 30 bis 120 s dauern. Die Befehle bleiben immer schnell. Gegenmittel: Phase 2 messen, kleineres Modell wählen.
2. **Verträge liegen auf dem Pi.** Er ist nur im LAN erreichbar, Telegram läuft über ausgehende Verbindungen. Wer Zugang zum Pi hat, hat Zugang zum Vault. Deshalb SSH nur mit Key, kein Passwort-Login.
3. **Telegram-Server sehen Chat-Inhalte**, also auch Auszüge aus Verträgen in den Antworten. Ist dir das bei sensiblen Dokumenten zu viel, nutzt du diese nur im Dashboard.
4. **Sync-Konflikte:** Der Assistent schreibt nur neue Dateien in `Inbox/` und hängt an bestehende nur an. Bearbeitest du dieselbe Notiz gleichzeitig am Mac, erzeugt Obsidian eine Konfliktdatei. Es geht nichts verloren, aber du musst aufräumen.
5. **Die CPU ist geteilt:** Bonsai, Deliberationen (Claude CLI) und Indexierung laufen parallel. `bonsai.service` hat `Nice=5`, der Assistent stellt Anfragen nacheinander in eine Warteschlange.
6. **Der Code wurde nur mit Fakes getestet.** Echter `llama-server`, Todoist und Telegram laufen erst in Phase 6 zum ersten Mal zusammen.

## Rollback
```bash
sudo systemctl stop bonsai obsidian-sync
# In .env TELEGRAM_BOT_TOKEN leer lassen → Bot aus (Push-Nachrichten dann auch aus)
git checkout main && npm install && sudo systemctl restart company-os
```
Vault-Kopie und Index lassen sich gefahrlos löschen: `rm -rf ~/vault db/vault-index.sqlite db/assistant.sqlite`.

## Reihenfolge und Zeitbedarf
Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Für dich sind das rund 2,5 bis 3,5 Stunden, der größte Block ist der Build und Download in Phase 2.
Phase 8 kommt danach, nach Priorität. Meine Empfehlung: zuerst 8.1 und 8.2 (klein, sofort spürbar), dann 8.7.
