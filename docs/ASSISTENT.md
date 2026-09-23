# Assistent: Bonsai am Pi + Obsidian + Todoist + Company OS

Chat-Schnittstelle zu deinem Wissen und deinem System. Läuft komplett auf dem Raspberry Pi 5.
Kein API-Key, keine Cloud für das Modell.

```
Du (iPhone/Mac)
 ├─ Telegram-Bot ──────────┐        (Long Polling, kein offener Port)
 └─ Dashboard-Tab "Assistent" ┐     (nur im Heimnetz)
                              ▼
Raspberry Pi 5 (16 GB)
 ├─ company-os.service   src/assistant/  → Befehle + Vault-Suche (RAG)
 │                        src/vault/indexer.js  SQLite FTS5 über Notizen + verlinkte PDFs
 ├─ bonsai.service       llama-server (PrismML-Fork) auf 127.0.0.1:8080
 └─ obsidian-sync.service  ob sync --continuous → /home/admin/vault
```

## Wie es arbeitet

- **Befehle** (`/suche`, `/aufgabe`, `/notiz`, `/heute`, `/status`, …) laufen fest im Code. Sie sind schnell und brauchen das Modell nicht.
- **Freitext** geht an Bonsai. Vorher sucht der Code im Vault und gibt dem Modell die besten Treffer mit, bei den zwei besten auch den Text der verlinkten PDFs. Das Modell ruft keine Werkzeuge selbst auf, weil kleine Modelle das nicht zuverlässig können.
- **Quellen** hängt der Code an jede Antwort an, als `obsidian://`-Link. Er öffnet die Notiz direkt in der Obsidian-App.
- **Schreiben in den Vault**: Neue Notizen landen nur in `Inbox/`, mit den Präfixen `Idee:`, `Ref:` oder `Log:`. Bestehende Notizen werden nur ergänzt, nie überschrieben. Vorher landet eine Kopie in `.assistant-backup/`.
- **Deliberationen** laufen weiter über Claude (CLI-Modus, Abo), nicht über Bonsai. Der Chat startet sie erst nach `/ja`.
- Ist das Modell nicht erreichbar, liefert der Chat die passenden Vault-Treffer statt einer Antwort.

## Befehle

| Befehl | Wirkung |
|---|---|
| `/suche Mietvertrag Kündigung` | Vault durchsuchen (Notizen + verlinkte PDFs, Umlaute egal: ü = ue) |
| `/lies 1` | Treffer Nr. 1 lesen, inkl. PDF-Text; `/lies 1 ab 3500` blättert weiter |
| `/notiz Idee: Titel \| Text` | Neue Notiz `Inbox/Idee: Titel.md` |
| `/ergaenze 1 \| Überschrift \| Text` | Text unter eine Überschrift anhängen (Backup wird angelegt) |
| `/aufgabe Mietvertrag kündigen @ 1. Dezember` | Todoist-Aufgabe mit Fälligkeit |
| `/heute` | Todoist heute/überfällig + offene Eskalationen + neue Notizen |
| `/status`, `/eskalationen` | Company-OS-Überblick |
| `/antwort abc123 Ja, freigeben` | Eskalation beantworten (ID-Anfang genügt) |
| `/deliberation Thema` → `/ja` | Deliberation starten (Claude), Ergebnis kommt per Telegram |
| `/neu` | Gesprächsverlauf zurücksetzen |

## Einrichtung am Pi

Voraussetzung: Company OS läuft bereits (siehe `INSTALL.md`). Node.js **22+**, denn das braucht `obsidian-headless`.

```bash
# 1. Bonsai installieren und Tempo messen
cd ~/Dev/company-os
bash scripts/install-bonsai-pi.sh 8B
node scripts/bonsai-bench.js
#   zu langsam? → bash scripts/install-bonsai-pi.sh 4B

# 2. Obsidian Sync (offizieller Headless-Client)
npm install -g obsidian-headless
ob login
mkdir -p ~/vault && cd ~/vault && ob sync-setup --vault "Vault"
ob sync --path ~/vault
sudo cp ~/Dev/company-os/deploy/obsidian-sync.service /etc/systemd/system/
#   Pfad von `which ob` in ExecStart prüfen
sudo systemctl daemon-reload && sudo systemctl enable --now obsidian-sync

# 3. .env ergänzen (Vorlage: .env.example, Abschnitt ASSISTENT)
#    VAULT_PATH=/home/admin/vault
#    LOCAL_LLM_URL=http://127.0.0.1:8080
#    TELEGRAM_BOT_TOKEN=…  TELEGRAM_CHAT_ID=…
#    TODOIST_API_TOKEN=…
npm install
sudo systemctl restart company-os
sudo journalctl -u company-os -f     # "[Vault-Index] +… (PDFs neu: …)" und "[Telegram-Bot] Polling gestartet"
```

## Modellwahl

Die Werte aus der Mac-Welt (z. B. 47 Token/s auf dem M5 Max) gelten am Pi nicht, denn dort rechnet nur die CPU. Deshalb nicht schätzen, sondern `scripts/bonsai-bench.js` laufen lassen:

- unter 30 s pro Antwort: passt
- 30 bis 90 s: `ASSISTANT_CONTEXT_CHARS` auf 3000 senken oder ein kleineres Modell nehmen
- über 90 s: kleineres Modell

27B passt zwar in 16 GB RAM, ist auf der Pi-CPU aber vermutlich zu langsam für einen Chat.

## Grenzen

- Gescannte PDFs ohne Textebene findet die Suche nicht. Das Log meldet sie mit `PDF ohne Textebene`.
- Der Dashboard-Chat ist nur im Heimnetz erreichbar, unterwegs läuft der Chat über Telegram.
- Die Suche ist Volltext (BM25), keine semantische Suche. Synonyme findet sie nur, wenn sie im Text stehen.
