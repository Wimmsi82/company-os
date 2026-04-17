# INSTALL — Company OS

---

## DEUTSCH

### Voraussetzungen

- Node.js 18 oder neuer
- Eines der folgenden:
  - **Claude Code** (für CLI-Modus) — https://claude.ai/code
  - **Anthropic API Key** (für API-Modus) — https://console.anthropic.com

### Installation

```bash
# 1. Repository klonen
git clone https://github.com/Wimmsi82/company-os.git
cd company-os

# 2. Abhängigkeiten installieren
npm install

# 3. Setup ausführen — wählt Modus, erstellt .env, initialisiert DB
npm run setup
```

### Setup-Assistent

`npm run setup` führt dich Schritt für Schritt durch die Einrichtung:

**Schritt 1 — Modus wählen**
```
[1]  Claude Code CLI  — kein API Key nötig, kostenlos im Max-Plan
[2]  Anthropic API    — eigener Key, ~$0.01–0.10 pro Deliberation
```

**Schritt 2 — Bei API-Modus: Key eingeben**
```
API Key auf console.anthropic.com erstellen → API Keys → Create Key
```

**Schritt 3 — Port und Intervall festlegen**
```
Standard: Port 3000, Queue alle 60 Minuten
```

Das Setup erstellt automatisch die `.env` und initialisiert die Datenbank.

### Nach dem Setup

```bash
# Unternehmenskontext eingeben (einmalig)
node run.js --onboarding

# Erste Deliberation starten
node run.js "Deine erste Frage ans Team"
```

### Modus nachträglich wechseln

```bash
npm run setup
```

Einfach erneut ausführen — überschreibt die bestehende `.env`.

### Alle Befehle

```bash
npm run setup                         # Einrichtung / Modus wechseln
node run.js --onboarding              # Unternehmenskontext eingeben
node run.js "Frage"                   # Deliberation + PDF-Export
node run.js --no-pdf "Frage"          # Deliberation ohne PDF
node run.js --context                 # Gespeicherten Kontext anzeigen
node run.js --set-context "key=val"   # Kontext manuell setzen
node run.js --performance             # Agent-Performance anzeigen
npm start                             # Server + Dashboard (API-Modus)
```

### Globale Kontext-Keys

| Key | Beschreibung |
|-----|-------------|
| `company_context` | Branche, Produkt, Zielmarkt |
| `active_projects` | Aktive Projekte und Status |
| `current_goals` | Quartalsziele und OKRs |
| `key_constraints` | Budget, Team, Constraints |
| `competitors` | Hauptwettbewerber |

Eigene Keys jederzeit möglich:
```bash
node run.js --set-context "pricing_model=SaaS, 49 EUR/Monat"
```

### Raspberry Pi (Dauerbetrieb)

```bash
# Setup auf dem Pi ausführen
ssh admin@[PI-IP]
cd ~/Dev/company-os
npm run setup

# Als systemd-Service einrichten
sudo cp company-os.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable company-os
sudo systemctl start company-os

# Logs
sudo journalctl -u company-os -f

# Dashboard
http://[PI-IP]:3000
```

#
---

## WINDOWS

### Voraussetzungen

- Node.js 18 oder neuer (https://nodejs.org)
- Eines der folgenden:
  - **WSL2 + Claude Code** (empfohlen)
  - **Claude Code nativ** (Windows-Version)
  - **Anthropic API Key** (einfachste Option)

### Option A — WSL2 (empfohlen)

WSL2 bietet die beste Kompatibilitaet da Company OS intern Linux-Befehle nutzt.

```powershell
# WSL2 aktivieren (als Administrator)
wsl --install

# Dann in WSL2 Terminal:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g @anthropic-ai/claude-code
claude auth login
```

Danach laeuft Company OS identisch wie auf Mac/Linux.

### Option B — Claude Code nativ + PowerShell

Claude Code fuer Windows installieren: https://claude.ai/code

Company OS erkennt Windows automatisch und nutzt PowerShell fuer den CLI-Aufruf:

```powershell
git clone https://github.com/Wimmsi82/company-os.git
cd company-os
npm install
npm run setup
node run.js "Deine erste Frage"
```

### Option C — API-Modus (einfachste Option)

Laeuft auf Windows ohne WSL2 oder Claude Code:

```powershell
git clone https://github.com/Wimmsi82/company-os.git
cd company-os
npm install
npm run setup
# Im Setup: Option 2 (Anthropic API) waehlen
node run.js "Deine erste Frage"
```

### Troubleshooting Windows

| Problem | Loesung |
|---------|---------|
| `claude: command not found` | Claude Code installieren oder WSL2 nutzen |
| PowerShell-Execution-Policy | `Set-ExecutionPolicy RemoteSigned` als Admin |
| Pfad-Probleme mit SQLite | Projekt in WSL2 anlegen statt Windows-Dateisystem |
| PDF oeffnet nicht | Puppeteer-Pfade auf Windows anders — `--no-pdf` Flag nutzen |

---

## WINDOWS (ENGLISH)

### Prerequisites

- Node.js 18 or higher (https://nodejs.org)
- One of the following:
  - **WSL2 + Claude Code** (recommended)
  - **Claude Code native** (Windows version)
  - **Anthropic API Key** (simplest option)

### Option A — WSL2 (recommended)

```powershell
# Enable WSL2 (as Administrator)
wsl --install

# Then in WSL2 terminal:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g @anthropic-ai/claude-code
claude auth login
```

### Option B — Native Claude Code + PowerShell

Install Claude Code for Windows: https://claude.ai/code

Company OS auto-detects Windows and uses PowerShell for CLI calls.

### Option C — API Mode (simplest)

No WSL2 or Claude Code required:

```powershell
npm run setup
# Choose option 2 (Anthropic API) in setup
```


---

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| `claude: command not found` | Claude Code installieren: https://claude.ai/code |
| `Invalid API key` | Prüfen ob `CLAUDE_MODE=cli` in `.env` — oder API Key korrigieren |
| `Cannot find module` | `npm install` ausführen |
| `SyntaxError` in db | `npm run migrate` ausführen |
| PDF öffnet nicht | `npm install` (Puppeteer) — oder `--no-pdf` Flag nutzen |
| Claude Code antwortet nicht | `claude --version` prüfen, `claude auth` neu einloggen |

---

## ENGLISH

### Prerequisites

- Node.js 18 or higher
- One of the following:
  - **Claude Code** (for CLI mode) — https://claude.ai/code
  - **Anthropic API Key** (for API mode) — https://console.anthropic.com

### Installation

```bash
# 1. Clone repository
git clone https://github.com/Wimmsi82/company-os.git
cd company-os

# 2. Install dependencies
npm install

# 3. Run setup — choose mode, create .env, initialize DB
npm run setup
```

### Setup assistant

`npm run setup` guides you through configuration step by step:

**Step 1 — Choose mode**
```
[1]  Claude Code CLI  — no API key needed, free with Max plan
[2]  Anthropic API    — own key required, ~$0.01–0.10 per deliberation
```

**Step 2 — API mode: enter your key**
```
Create key at console.anthropic.com → API Keys → Create Key
```

**Step 3 — Set port and interval**
```
Defaults: port 3000, queue every 60 minutes
```

Setup automatically creates `.env` and initializes the database.

### After setup

```bash
# Enter company context (once)
node run.js --onboarding

# Start your first deliberation
node run.js "Your first question to the team"
```

### Switch mode later

```bash
npm run setup
```

Run again at any time — overwrites the existing `.env`.

### All commands

```bash
npm run setup                         # Setup / switch mode
node run.js --onboarding              # Enter company context
node run.js "Question"                # Deliberation + PDF export
node run.js --no-pdf "Question"       # Without PDF
node run.js --context                 # Show saved context
node run.js --set-context "key=val"   # Set context manually
node run.js --performance             # Agent performance report
npm start                             # Server + dashboard (API mode)
```

### Global context keys

| Key | Description |
|-----|-------------|
| `company_context` | Industry, product, target market |
| `active_projects` | Active projects and status |
| `current_goals` | Quarterly goals and OKRs |
| `key_constraints` | Budget, team, constraints |
| `competitors` | Main competitors |

Add any custom key:
```bash
node run.js --set-context "pricing_model=SaaS, 49 EUR/month"
```

### Raspberry Pi (continuous operation)

```bash
# Run setup on Pi
ssh admin@[PI-IP]
cd ~/Dev/company-os
npm run setup

# Set up as systemd service
sudo cp company-os.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable company-os
sudo systemctl start company-os

# Logs
sudo journalctl -u company-os -f

# Dashboard
http://[PI-IP]:3000
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| `claude: command not found` | Install Claude Code: https://claude.ai/code |
| `Invalid API key` | Check `CLAUDE_MODE=cli` in `.env` — or fix API key |
| `Cannot find module` | Run `npm install` |
| `SyntaxError` in db | Run `npm run migrate` |
| PDF does not open | Run `npm install` (Puppeteer) — or use `--no-pdf` flag |
| Claude Code not responding | Check `claude --version`, re-login with `claude auth` |
