<div align="center">

# 🏢 Company OS

**Autonomes Multi-Agent-System für Unternehmenssteuerung**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Mac%20%7C%20Windows%20%7C%20Linux%20%7C%20Pi-lightgrey.svg)]()
[![Claude Code](https://img.shields.io/badge/Claude%20Code-kostenlos-orange.svg)](https://claude.ai/code)

*8 KI-Experten deliberieren. Der CEO entscheidet. Das System verbessert sich selbst.*

</div>

---

## Was ist Company OS?

Du stellst eine Frage. 8 spezialisierte KI-Abteilungen analysieren sie parallel, stellen sich gegenseitig Fragen, widersprechen sich, verhandeln — und ein CEO-Agent synthetisiert alles zu einer strukturierten Entscheidung mit konkretem Handlungsplan.

Wenn der CEO merkt dass eine Perspektive fehlt, erstellt er die fehlende Abteilung selbst. Ohne zu fragen.

Das Ergebnis landet als PDF auf deinem Schreibtisch.

---

## ⚡ Installation

### 🍎 Mac

```bash
curl -fsSL https://raw.githubusercontent.com/Wimmsi82/company-os/main/install-mac.sh | bash
```

### 🪟 Windows

PowerShell als Administrator öffnen:

```powershell
irm https://raw.githubusercontent.com/Wimmsi82/company-os/main/install-windows.ps1 | iex
```

> Der Installer erkennt automatisch ob WSL2 verfügbar ist und wählt den besten Modus.
> Alternativ: API-Modus ohne WSL2 direkt auf Windows.

### 🐧 Raspberry Pi

```bash
curl -fsSL https://raw.githubusercontent.com/Wimmsi82/company-os/main/install-pi.sh | bash
```

### 📦 Manuell

```bash
git clone https://github.com/Wimmsi82/company-os.git
cd company-os
npm install
npm run setup
```

---

## 🚀 Verwendung

```bash
# Unternehmenskontext eingeben (einmalig)
node run.js --onboarding

# Deliberation starten
node run.js "Sollen wir die Preise erhöhen?"

# Mit externen Consultants
node run.js --consultant mckinsey "Markteintrittsstrategie DACH"
node run.js --consultant mckinsey,ey,bcg "Sollen wir expandieren?"

# Alle verfügbaren Consultants anzeigen
node run.js --list-consultants

# Ohne PDF
node run.js --no-pdf "Schnelle Frage"

# Agent-Performance anzeigen
node run.js --performance
```

---

## 🧠 Wie es funktioniert

```
Du stellst eine Frage
        ↓
┌─────────────────────────────────────────┐
│  Iterativer Loop (bis zu 3 Runden)      │
│                                         │
│  Runde 1: Alle 8 Agenten analysieren    │
│  Runde 2: 360-Grad-Kontext + Fragen     │
│  Runde 3: Konvergenz oder weitere Runde │
└─────────────────────────────────────────┘
        ↓
Verhandlungsrunden (Sales vs. Legal etc.)
        ↓
CEO synthetisiert → Entscheidung + Plan
        ↓
Meta-Agent verbessert schwache Agenten
        ↓
PDF landet auf deinem Schreibtisch
```

---

## 👥 Die 8 Kern-Agenten

| Agent | Frameworks | Kennzahlen |
|-------|-----------|------------|
| **Strategie** | Porter's Five Forces, Blue Ocean, OKR | TAM/SAM/SOM, NPS |
| **Finanzen** | DCF, EBITDA, Unit Economics | Free Cashflow, CAC Payback |
| **Marketing** | AARRR-Funnel, Attribution, Positioning | CAC, LTV, ROAS |
| **Sales** | MEDDIC, Challenger Sale, Pipeline Velocity | ARR, Win Rate |
| **HR** | 9-Box-Grid, EVP, Skills-based Org | eNPS, Time-to-Hire |
| **F&E** | DORA Metrics, Tech Debt Quadrant, Shape Up | Deployment Frequency |
| **Legal** | Risk-Reward, DSGVO, Regulatory Scanning | Litigation Exposure |
| **Operations** | Theory of Constraints, Lean Six Sigma | Throughput, OTIF |

---

## 🎩 Externe Consultants

```bash
node run.js --list-consultants
```

| ID | Firma | Methodik |
|----|-------|---------|
| `mckinsey` | McKinsey & Company | MECE, Pyramid Principle, 80/20 |
| `bcg` | Boston Consulting Group | BCG-Matrix, Experience Curve |
| `ey` | Ernst & Young | Risk Framework, Due Diligence |
| `deloitte` | Deloitte | Digital Maturity, Cyber Risk |
| `rolandberger` | Roland Berger | DACH-Fokus, Mittelstand |
| `kpmg` | KPMG | Audit Mindset, Tax Efficiency |

---

## 🔧 Modi

| Modus | Voraussetzung | Kosten | Plattform |
|-------|--------------|--------|-----------|
| `CLAUDE_MODE=cli` | Claude Code installiert | **Kostenlos** im Max-Plan | Mac, Linux, WSL2 |
| `CLAUDE_MODE=api` | Anthropic API Key | ~$0.01–0.10/Deliberation | Alle Plattformen |

---

## 🖥️ Windows Setup

**Option 1 — WSL2 (empfohlen)**

```powershell
# Als Administrator
wsl --install
# Nach Neustart: Ubuntu einrichten, dann Installer ausführen
irm https://raw.githubusercontent.com/Wimmsi82/company-os/main/install-windows.ps1 | iex
```

**Option 2 — API-Modus (kein WSL2 nötig)**

API Key auf [console.anthropic.com](https://console.anthropic.com) erstellen, dann:

```powershell
irm https://raw.githubusercontent.com/Wimmsi82/company-os/main/install-windows.ps1 | iex
# Im Setup: Option 2 (Anthropic API) wählen
```

---

## 🥧 Raspberry Pi (Dauerbetrieb)

```bash
curl -fsSL https://raw.githubusercontent.com/Wimmsi82/company-os/main/install-pi.sh | bash
# Wähle API-Modus für automatischen systemd-Service
```

Dashboard: `http://[PI-IP]:3000`

---

## 📁 Projektstruktur

```
src/
├── agents/
│   ├── base.js          # Basis-Agent (Gedächtnis, Spawn, Verhandlung)
│   ├── index.js         # Registry (Kern + dynamische Agenten)
│   ├── specialists.js   # Tiefenspezialisierte Prompts
│   ├── consultants.js   # McKinsey, BCG, EY, Deloitte, Roland Berger, KPMG
│   ├── ceo.js           # CEO-Synthese + dynamische Agent-Erstellung
│   ├── subagent.js      # Unteragenten-Mechanismus
│   └── meta.js          # Selbstverbesserung
├── scheduler/
│   ├── loop.js          # Iterativer Loop + Konvergenz
│   ├── negotiation.js   # Verhandlungsrunden
│   ├── orchestrator.js  # Task-Queue + Metriken
│   └── cron.js          # Autonomer Dauerbetrieb
├── db/                  # SQLite (Gedächtnis, Tasks, Metriken)
├── api/                 # REST-API + Dashboard
└── pdf.js               # PDF-Export
```

---

## ⚙️ Konfiguration

```env
CLAUDE_MODE=cli              # cli oder api
ANTHROPIC_API_KEY=           # nur für api-Modus
MAX_LOOP_ROUNDS=3            # Deliberations-Runden
META_EVALUATION=true         # Selbstverbesserung
DAILY_TOKEN_LIMIT=100000     # Token-Budget (api-Modus)
PORT=3000                    # Dashboard-Port
```

---

## 📖 Dokumentation

- [INSTALL.md](INSTALL.md) — Detaillierte Installation (DE/EN/Windows)
- [docs/FEATURES.md](docs/FEATURES.md) — Vollständiger Funktionsumfang
- [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) — Architektur

---

## 🤝 Beitragen

Pull Requests willkommen. Besonders gesucht: neue Agenten, neue Consultants, Übersetzungen.

Siehe [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📄 Lizenz

MIT — siehe [LICENSE](LICENSE)

---

<div align="center">

Gebaut von einem Banker der sich Python selbst beigebracht hat.<br>
Läuft auf einem Raspberry Pi. Kostenlos. Open Source.

**[⭐ Star auf GitHub](https://github.com/Wimmsi82/company-os)**

</div>
