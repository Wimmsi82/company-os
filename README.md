# Company OS

**Autonomes Multi-Agent-System für Unternehmenssteuerung**

**Company OS** ist ein autonomes Multi-Agent-System das Unternehmensentscheidungen durch strukturierte KI-Deliberation trifft, sich selbst verbessert und auf Wunsch externe Berater hinzuzieht.

**Wie eine Deliberation abläuft**
Du stellst eine Frage. Das System startet einen iterativen Loop mit bis zu drei Runden. In Runde 1 analysieren alle acht Kern-Agenten parallel — jeder mit seinem eigenen persistenten Gedächtnis und dem globalen Unternehmenskontext. Der CFO denkt in EBITDA und Free Cashflow. Der CMO in CAC/LTV und Attribution. Der CTO in DORA-Metriken und Tech Debt. Kein Agent ist generisch.

Nach Runde 1 gibt der CEO-Agent Zwischenfeedback: Was ist noch ungeklärt? Wo liegen die entscheidenden Spannungen? Runde 2 startet mit vollem 360-Grad-Kontext — jeder Agent sieht alle Analysen aller anderen aus Runde 1, das CEO-Feedback und alles was andere Agenten als geteiltes Wissen beigetragen haben.
Agenten können während einer Runde direkte Fragen an andere Agenten stellen. "Frage an Finanzen: Was ist der maximale Rabattspielraum ohne Margenverlust?" Die Zielabteilung antwortet sofort. Die Antwort fließt in alle nachfolgenden Runden ein.

Parallel zu den Analyserunden verhandeln definierte Abteilungspaare strukturiert miteinander. Sales gegen Legal über Vertragskonditionen. Marketing gegen Finanzen über Budget und ROI. F&E gegen Operations über Innovation versus Stabilität. Echter Widerspruch statt paralleler Monologe.

Wenn Positionen zwischen Runden stabil bleiben, erkennt das System Konvergenz und bricht früher ab. Kein unnötiger Token-Verbrauch.

**Was der CEO-Agent tut**
Der CEO synthetisiert alle Runden, alle Verhandlungsergebnisse und alle Consultant-Inputs zu einer strukturierten Entscheidung: ja / nein / bedingt. Er benennt welche Abteilungen den Ausschlag gaben. Er formuliert konkrete Action Items mit Verantwortlichkeit und Deadline — die werden sofort als Tasks in die Queue geschrieben und an die zuständigen Abteilungen delegiert. Er definiert messbare Follow-up-Bedingungen mit Prüfdatum. Er eskaliert an den Operator wenn eine menschliche Entscheidung nötig ist.

Der CEO erkennt auch wenn eine wichtige Perspektive gefehlt hat. Er erstellt die fehlende Abteilung selbst — Rolle, Aufgaben, Systemlogik. Beim nächsten Lauf ist sie aktiv.

**Wie sich das System selbst verbessert**
Nach jeder Deliberation bewertet ein Meta-Agent jeden Kern-Agenten auf einer Skala von 1 bis 10. Er analysiert was präzise war, was vage, was übersehen wurde. Agenten mit einem Score unter 7 bekommen automatisch überarbeitete System-Prompts. Die Verbesserungen sind persistent — der nächste Lauf startet mit besseren Agenten als der letzte.

**Externe Consultants**
McKinsey, BCG, EY, Deloitte, Roland Berger, KPMG sind als spezialisierte Berater-Agenten implementiert — jeder mit dem methodischen Ansatz der jeweiligen Firma. McKinsey denkt in MECE und Pyramid Principle. BCG in Portfoliodynamik und Experience Curve. EY in Risk-first und Compliance. Roland Berger pragmatisch und DACH-spezifisch. Sie können einzeln oder kombiniert zu jeder Deliberation hinzugezogen werden.

**Persistentes Gedächtnis**
Agenten vergessen nicht. Jede Abteilung hat ein eigenes Gedächtnis mit Confidence-Werten das über alle Deliberationen hinweg erhalten bleibt. Dazu kommt ein globales Gedächtnis mit dem Unternehmenskontext den du beim Onboarding eingibst — Branche, Projekte, Ziele, Constraints, Wettbewerber. Diesen Kontext sehen alle Agenten bei jedem Lauf.

**Unteragenten**
Haupt-Agenten können für komplexe Teilaufgaben spezialisierte Unteragenten spawnen. Der Marketing-Agent beauftragt einen Keyword-Research-Unteragenten. Der Strategie-Agent einen Wettbewerbsanalyse-Unteragenten. Ergebnis kommt zurück, Unteragent löst sich auf.

**Zwei Modi**
CLI-Modus läuft kostenlos über Claude Code ohne API Key. API-Modus läuft mit eigenem Anthropic Key — dann auch mit autonomem 24/7-Betrieb auf dem Raspberry Pi, Web-Dashboard, Token-Budget und automatischen täglichen Zyklen.

Jede Deliberation endet als grafisch aufbereitetes PDF das automatisch geöffnet wird.

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
