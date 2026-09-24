# Assistent: Bonsai + Obsidian + Todoist + Company OS

Chat-Schnittstelle zu deinem Wissen und deinem System. Company OS, Vault-Index, Telegram-Bot und Todoist laufen auf dem Raspberry Pi 5. Das Sprachmodell Bonsai läuft auf dem Mac, der Pi ruft es über Tailscale auf.
Kein Anthropic-API-Key, keine Cloud für das Modell.

```
Du (iPhone/Mac)
 ├─ Telegram-Bot ─────────────┐     (Long Polling, kein offener Port)
 └─ Dashboard-Tab "Assistent" ┐│    (nur im Heimnetz)
                              ▼▼
Raspberry Pi 5 (16 GB)
 ├─ company-os.service     src/assistant/  → Befehle + Vault-Suche (RAG)
 │                         src/vault/indexer.js  SQLite FTS5 über Notizen + verlinkte PDFs
 └─ obsidian-sync.service  ob sync --continuous → /home/admin/vault
        │
        │ Tailscale (verschlüsselt), API-Key
        ▼
Mac (M5, 24 GB)
 └─ LaunchAgent ai.prism.bonsai   llama-server (Metal), Bonsai 2 27B, nur auf der Tailscale-IP
```

## Wie es arbeitet

- **Befehle** (`/suche`, `/aufgabe`, `/notiz`, `/heute`, `/status`, …) laufen fest im Code auf dem Pi. Sie sind schnell und brauchen das Modell nicht.
- **Freitext** geht an Bonsai. Vorher sucht der Code im Vault und gibt dem Modell die besten Treffer mit, bei den zwei besten auch den Text der verlinkten PDFs. Das Modell ruft keine Werkzeuge selbst auf, weil kleine Modelle das nicht zuverlässig können.
- **Quellen** hängt der Code an jede Antwort an, als `obsidian://`-Link. Er öffnet die Notiz direkt in der Obsidian-App.
- **Schreiben in den Vault**: Neue Notizen landen nur in `Inbox/`, als `Idee - Titel.md`, `Ref - Titel.md` oder `Log - Titel.md`. Kein Doppelpunkt im Dateinamen: Obsidian und Obsidian Sync lehnen `:` ab, solche Dateien kommen auf kein anderes Gerät. Bestehende Notizen werden nur ergänzt, nie überschrieben. Vorher landet eine Kopie in `.assistant-backup/`.
- **Deliberationen** laufen weiter über Claude (CLI-Modus, Abo), nicht über Bonsai. Der Chat startet sie erst nach `/ja`.
- **Mac aus oder im Ruhezustand:** Der Pi prüft vor jeder Frage in 3 Sekunden, ob das Modell antwortet. Wenn nicht, liefert der Chat sofort die passenden Vault-Treffer statt einer Antwort.

## Befehle

| Befehl | Wirkung |
|---|---|
| `/suche Mietvertrag Kündigung` | Vault durchsuchen (Notizen + verlinkte PDFs, Umlaute egal: ü = ue) |
| `/lies 1` | Treffer Nr. 1 lesen, inkl. PDF-Text; `/lies 1 ab 3500` blättert weiter |
| `/notiz Idee: Titel \| Text` | Neue Notiz `Inbox/Idee - Titel.md` (Eingabe mit `:` oder ` - `) |
| `/ergaenze 1 \| Überschrift \| Text` | Text unter eine Überschrift anhängen (Backup wird angelegt) |
| `/aufgabe Mietvertrag kündigen @ 1. Dezember` | Todoist-Aufgabe mit Fälligkeit |
| `/heute` | Todoist heute/überfällig + offene Eskalationen + neue Notizen |
| `/status`, `/eskalationen` | Company-OS-Überblick |
| `/antwort abc123 Ja, freigeben` | Eskalation beantworten (ID-Anfang genügt) |
| `/deliberation Thema` → `/ja` | Deliberation starten (Claude), Ergebnis kommt per Telegram |
| `/neu` | Gesprächsverlauf zurücksetzen |

## Einrichtung

Voraussetzung: Company OS läuft auf dem Pi (siehe `INSTALL.md`), Node.js **22+** (braucht `obsidian-headless`). Mac und Pi sind im selben Tailnet.

### 1. Bonsai auf dem Mac

```bash
cd <company-os-Ordner auf dem Mac> && git pull
bash scripts/install-bonsai-mac.sh        # Default 27B; schneller, aber schwächer: 8B
```

Das Skript
- nutzt `~/Dev/modelle/Bonsai-demo` und lädt das Modell nur, wenn es fehlt,
- startet `bin/mac/llama-server` direkt (Metal), gebunden nur an die Tailscale-IP des Macs,
- legt einen API-Key in `~/.config/bonsai/api-key` an,
- richtet den LaunchAgent `ai.prism.bonsai` ein (startet beim Login, startet nach Absturz neu),
- gibt am Ende die zwei Zeilen für die `.env` auf dem Pi aus.

Log: `tail -f ~/Library/Logs/bonsai.log`. Stoppen: `launchctl bootout gui/$(id -u)/ai.prism.bonsai`.

Damit der Mac am Netzteil nicht einschläft: `sudo pmset -c sleep 0`. Mit zugeklapptem Deckel schläft ein MacBook trotzdem, außer mit externem Bildschirm.

### 2. Obsidian Sync auf dem Pi (offizieller Headless-Client)

```bash
npm install -g obsidian-headless
ob login
mkdir -p ~/vault && cd ~/vault && ob sync-setup --vault "Vault"
ob sync --path ~/vault
sudo cp ~/Dev/company-os/deploy/obsidian-sync.service /etc/systemd/system/
#   Pfad von `which ob` in ExecStart prüfen
sudo systemctl daemon-reload && sudo systemctl enable --now obsidian-sync
```

### Dateinamen mit Doppelpunkt umbenennen (einmalig, auf dem Mac)

Obsidian Sync überträgt keine Dateien mit `:` im Namen. Am 24.09.2026 waren das 851 Dateien (`Ref: …`, `Idee: …`, `Log: …`), die auf dem Pi fehlten. `scripts/rename-colon-notes.js` benennt sie in `Ref - …` um und passt alle Links an:

```bash
node rename-colon-notes.js ~/Bernhard/Obsidian            # Probelauf
node rename-colon-notes.js ~/Bernhard/Obsidian --apply    # mit Backup nach ~/obsidian-rename-backup-<zeit>/
node rename-colon-notes.js --undo ~/obsidian-rename-backup-<zeit>/manifest.json
```

Versteckte Ordner und `node_modules` bleiben unberührt. Obsidian vorher schliessen. Danach alle Werkzeuge, die Notizen anlegen (Custom Instructions, andere Agenten), auf `Idee - `, `Ref - `, `Log - ` umstellen, sonst entstehen neue Dateien mit Doppelpunkt.

### 3. `.env` auf dem Pi ergänzen (Vorlage: `.env.example`, Abschnitt ASSISTENT)

```ini
VAULT_PATH=/home/admin/vault
LOCAL_LLM_URL=http://100.x.y.z:8080       # aus install-bonsai-mac.sh
LOCAL_LLM_API_KEY=…                        # aus install-bonsai-mac.sh
TELEGRAM_BOT_TOKEN=…  TELEGRAM_CHAT_ID=…
TODOIST_API_TOKEN=…
```

```bash
cd ~/Dev/company-os
npm install
node scripts/bonsai-bench.js               # Tempo vom Pi aus messen, Ziel unter 30 s
sudo systemctl restart company-os
sudo journalctl -u company-os -f     # "[Vault-Index] +… (PDFs neu: …)" und "[Telegram-Bot] Polling gestartet"
```

## Modellwahl

Bonsai läuft auf dem Mac, weil der Pi 5 für Fragen an den Vault zu langsam ist. Gemessen am 23.09.2026 auf `Raspi2` (Pi 5, 16 GB):

| Variante am Pi | Ergebnis |
|---|---|
| 8B oder 4B, Vulkan (GPU) | Absturz bei jeder echten Anfrage (`vk::OutOfHostMemoryError` im V3DV-Treiber). `/health` meldet trotzdem ok |
| `BONSAI_NGL=0` über `start_llama_server.sh` | Hängt. Das Skript nimmt immer `bin/vulkan`, NGL ändert nur die Zahl der GPU-Layer |
| 4B, `bin/cpu` + `PQ2_0` | Unbrauchbar, das Format ist nur auf x86 optimiert |
| 4B, `bin/cpu` + `Q2_0_g64` | Funktioniert: 6,7 Token/s Einlesen, 3,9 Token/s Antwort. 565 Token dauern 100 s, eine echte Vault-Frage 3 bis 4 min |
| Hailo-Beschleuniger | Nicht nutzbar, llama.cpp hat kein Backend dafür |

Zum Vergleich auf dem Mac (M5, 24 GB), Bonsai 2 27B, vom Pi aus über Tailscale gemessen am 24.09.2026: 3.256 Token Kontext in 26,3 s, 171,9 Token/s Einlesen, 12,3 Token/s Antwort. Antwort korrekt.

Richtwerte für den Bench (`scripts/bonsai-bench.js`, rund 3.000 Token Kontext):

- unter 30 s pro Antwort: passt
- 30 bis 90 s: `ASSISTANT_CONTEXT_CHARS` auf 3000 senken
- über 90 s: kleineres Modell, `bash scripts/install-bonsai-mac.sh 8B`

## Grenzen

- Schläft der Mac oder ist er aus, gibt es keine Modell-Antworten, nur Vault-Treffer. Befehle funktionieren weiter.
- Vault-Auszüge gehen für jede Frage vom Pi zum Mac, verschlüsselt über Tailscale (WireGuard).
- Die Tailscale-IP steht fest im LaunchAgent. Ändert sie sich, `install-bonsai-mac.sh` erneut ausführen.
- Gescannte PDFs ohne Textebene findet die Suche nicht. Das Log meldet sie mit `PDF ohne Textebene`.
- Der Dashboard-Chat ist nur im Heimnetz erreichbar, unterwegs läuft der Chat über Telegram.
- Die Suche ist Volltext (BM25), keine semantische Suche. Synonyme findet sie nur, wenn sie im Text stehen.
