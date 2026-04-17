# Company OS

**Autonomes Multi-Agent-System für Unternehmenssteuerung**

8 spezialisierte KI-Agenten deliberieren in 3 Phasen, ein CEO-Agent synthetisiert die Entscheidung. Ergebnis wird als PDF exportiert und automatisch geöffnet.

---

## Schnellstart

```bash
git clone https://github.com/Wimmsi82/company-os.git
cd company-os
npm install
npm run setup
```

`npm run setup` führt dich durch die Einrichtung — du wählst zwischen **Claude Code CLI** (kein API Key) oder **Anthropic API** (eigener Key).

Danach:

```bash
node run.js --onboarding          # Unternehmenskontext eingeben
node run.js "Deine erste Frage"   # Deliberation starten → PDF
```

---

## Modi

| Modus | Voraussetzung | Kosten |
|-------|--------------|--------|
| `CLAUDE_MODE=cli` | Claude Code installiert | Kostenlos im Max-Plan |
| `CLAUDE_MODE=api` | Anthropic API Key | ~$0.01–0.10 pro Deliberation |

Modus jederzeit wechseln: `npm run setup` erneut ausführen.

---

## Befehle

```bash
npm run setup                         # Einrichtung / Modus wechseln
node run.js --onboarding              # Unternehmenskontext eingeben
node run.js "Frage"                   # Deliberation + PDF
node run.js --no-pdf "Frage"          # Ohne PDF
node run.js --context                 # Kontext anzeigen
node run.js --set-context "key=val"   # Kontext setzen
node run.js --performance             # Agent-Performance
npm start                             # Server + Dashboard (API-Modus)
```

---

## Wie es funktioniert

```
Eingabe: Frage / Aufgabe
    ↓
Phase 1: 8 Agenten analysieren parallel
    ↓
Phase 2: Jeder Agent liest alle anderen, reagiert gezielt
    ↓
Phase 3: CEO synthetisiert → Entscheidung + Handlungsplan
    ↓
PDF: Grafischer Report wird erstellt und geöffnet
```

Agenten haben persistentes Gedächtnis (SQLite), gemeinsamen Unternehmenskontext und beauftragen sich gegenseitig mit Folgeaufgaben.

---

## Raspberry Pi (Dauerbetrieb)

```bash
sudo cp company-os.service /etc/systemd/system/
sudo systemctl enable company-os
sudo systemctl start company-os
sudo journalctl -u company-os -f
```

Dashboard: `http://[PI-IP]:3000`

---

## Neuen Agenten hinzufügen

In `src/agents/index.js`:

```js
{
  id: 'customer_success',
  name: 'Customer Success',
  systemPrompt: 'Du bist der Head of Customer Success ...'
}
```

Kein weiterer Code nötig.

---

## License

MIT
