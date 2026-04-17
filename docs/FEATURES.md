# FEATURES — Company OS

Vollstaendige Referenz aller Funktionen. Stand: v4.

---

## 1. Iterativer Deliberations-Loop

**Was es tut:**
Agenten analysieren ein Thema in mehreren Runden. Nach jeder Runde gibt der CEO-Agent Feedback. Die naechste Runde startet mit vollem Kontext aller vorherigen Runden.

**Wie es funktioniert:**
- Runde 1: Jeder Agent analysiert mit eigenem Gedaechtnis und globalem Kontext
- CEO-Zwischenfeedback: Was ist ungeklaert? Wo liegen Spannungen?
- Runde 2+: Jeder Agent sieht alle vorherigen Runden + CEO-Feedback
- Konvergenz-Check: Wenn Positionen sich kaum aendern, stoppt der Loop fruehzeitig
- Konfigurierbar: MAX_LOOP_ROUNDS in .env (default: 3)

**Verwendung:**
```bash
node run.js "Sollen wir in den DACH-Markt expandieren?"
```

---

## 2. 360-Grad-Kontext

**Was es tut:**
Jeder Agent sieht in jeder Runde den vollstaendigen Informationsstand — nicht nur seine eigene Perspektive.

**Was jeder Agent sieht:**
- Eigenes persistentes Gedaechtnis (abteilungsspezifisch)
- Globaler Unternehmenskontext (company_context, active_projects, current_goals, etc.)
- Alle Analysen aller anderen Agenten aus vorherigen Runden
- CEO-Zwischenfeedback
- Geteiltes Wissen aus Agent-zu-Agent-Fragen
- Beantwortete Operator-Eskalationen

---

## 3. Agent-zu-Agent-Fragen

**Was es tut:**
Agenten koennen waehrend einer Deliberation direkte Fragen an andere Agenten stellen und auf deren Antwort warten, bevor sie ihre eigene Einschaetzung finalisieren.

**Format in der Analyse:**
```
Frage an Finanzen: Was ist der maximale Rabattspielraum ohne Margenverlust?
```

**Wie es funktioniert:**
- Loop.js erkennt das Muster "Frage an [Abteilung]: [Frage]"
- Die Zielabteilung antwortet sofort in 2-3 Saetzen
- Antwort wird als geteiltes Wissen in alle nachfolgenden Runden eingefuegt

---

## 4. Verhandlungsrunden (Phase 2b)

**Was es tut:**
Definierte Abteilungspaare verhandeln strukturiert miteinander, bevor der CEO entscheidet. Echter Widerspruch statt paralleler Monologe.

**Verhandlungspaare:**
- Sales vs. Legal (Vertragskonditionen und Risiken)
- Marketing vs. Finanzen (Budget und ROI)
- F&E vs. Operations (Innovation vs. Stabilitaet)
- Strategie vs. Finanzen (Wachstum vs. Kosteneffizienz)

**Wie es funktioniert:**
- Jedes Paar fuehrt MAX_ROUNDS Verhandlungsrunden durch
- Jede Seite reagiert auf die Position der anderen, verteidigt Standpunkte, macht Zugestaendnisse
- Ergebnisse fliessen als Kontext in die CEO-Synthese

---

## 5. Unteragenten (Spawn-Mechanismus)

**Was es tut:**
Haupt-Agenten koennen spezialisierte Unteragenten fuer Teilaufgaben beauftragen. Der Unteragent liefert sein Ergebnis zurueck, der Haupt-Agent nutzt es in seiner Analyse.

**Wie es funktioniert:**
- Agent definiert in seinem JSON-Response: spawn_subagents
- Unteragent bekommt eine spezialisierte Rolle und eine konkrete Aufgabe
- Ergebnis landet im Kontext des Haupt-Agenten
- Unteragent loest sich nach Abschluss auf

**Beispiel:**
Der Marketing-Agent spawnt einen Keyword-Research-Unteragenten fuer SEO-Analyse, waehrend er selbst die Gesamtkampagne bewertet.

---

## 6. Dynamische Agent-Erstellung durch CEO

**Was es tut:**
Der CEO-Agent erkennt nach jeder Deliberation ob eine wichtige Perspektive gefehlt hat. Wenn ja, erstellt er die fehlende Abteilung automatisch — mit definierter Rolle, Aufgaben und Systemlogik.

**Wie es funktioniert:**
- CEO analysiert missing_perspectives im JSON-Response
- Neue Abteilung wird in der agents-Tabelle der SQLite-DB gespeichert
- Beim naechsten Lauf ist sie automatisch aktiv
- CEO schickt sofort einen ersten Task an den neuen Agenten

**Beispiel:**
Bei einer Frage zur KI-Implementierung erstellt der CEO automatisch einen "AI Ethics"-Agenten, weil keine der 8 Kern-Abteilungen diese Perspektive abgedeckt hat.

---

## 7. Tiefenspezialisierte Kern-Agenten

**Was es tut:**
Alle 8 Kern-Agenten arbeiten mit professionellen Experten-System-Prompts, die echte Frameworks, Kennzahlen und Denkweisen der jeweiligen Rolle abbilden.

**Agenten und ihre Frameworks:**

| Agent | Frameworks | Kernkennzahlen |
|-------|-----------|----------------|
| Strategie | Porter's Five Forces, Blue Ocean, Ansoff-Matrix, OKR | Marktanteil, TAM/SAM/SOM, NPS |
| Finanzen | DCF, EBITDA, Unit Economics, Szenario-Modellierung | Free Cashflow, Gross Margin, CAC Payback |
| Marketing | AARRR-Funnel, Brand Equity, Positioning, Attribution | CAC, LTV, ROAS, Churn Rate |
| Sales | MEDDIC, Challenger Sale, Pipeline Velocity | ARR, Win Rate, Pipeline Coverage |
| HR | 9-Box-Grid, EVP, Skills-based Org | eNPS, Regrettable Attrition, Time-to-Hire |
| F&E | DORA Metrics, ADR, Shape Up, Tech Debt Quadrant | Deployment Frequency, MTTR, Error Rate |
| Legal | Risk-Reward, Regulatory Scanning, DSGVO | Litigation Exposure, Compliance Rate |
| Operations | Theory of Constraints, Lean Six Sigma, Kaizen | Throughput, Cycle Time, OTIF |

---

## 8. Externe Consultants

**Was es tut:**
Spezialisierte Berater-Agenten koennen situativ hinzugezogen werden. Jeder Consultant hat den methodischen Ansatz der jeweiligen Firma.

**Verfuegbare Consultants:**

| ID | Firma | Schwerpunkt | Methodik |
|----|-------|------------|---------|
| mckinsey | McKinsey & Company | Strukturierung, Hebel | MECE, Pyramid Principle, 80/20 |
| bcg | Boston Consulting Group | Portfolio, Wettbewerb | BCG-Matrix, Experience Curve |
| ey | Ernst & Young | Risiko, Compliance | Risk Framework, Due Diligence |
| deloitte | Deloitte | Digital, Tech | Digital Maturity, Cyber Risk |
| rolandberger | Roland Berger | DACH, Mittelstand | Pragmatismus, Restrukturierung |
| kpmg | KPMG | Audit, Tax, Governance | Audit Mindset, Tax Efficiency |

**Verwendung:**
```bash
# Alle verfuegbaren Consultants anzeigen
node run.js --list-consultants

# Mit einem Consultant
node run.js --consultant mckinsey "Frage"

# Mehrere Consultants kombinieren
node run.js --consultant mckinsey,ey "Frage"

# Consultants + normale Deliberation
node run.js --consultant bcg,deloitte "Markteintrittsstrategie"
```

---

## 9. Meta-Agent und Selbstverbesserung

**Was es tut:**
Nach jeder Deliberation bewertet ein Meta-Agent die Qualitaet jedes Agenten auf einer Skala von 1-10. Schwache Agenten bekommen automatisch verbesserte System-Prompts.

**Wie es funktioniert:**
- Meta-Agent analysiert: Welche Einschaetzung war praezise, welche vage, was wurde uebersehen?
- Score unter 7: System-Prompt wird ueberarbeitet
- Verbesserungen werden in der DB gespeichert und sind persistent
- Konfigurierbar: META_EVALUATION=false in .env deaktiviert den Meta-Agenten

**Performance anzeigen:**
```bash
node run.js --performance
```

---

## 10. CEO-Synthese und Delegation

**Was es tut:**
Der CEO-Agent synthetisiert alle Runden, Verhandlungen und Consultant-Inputs zu einer strukturierten Entscheidung und delegiert Action Items direkt an Abteilungen.

**CEO-Output:**
- Entscheidung: ja / nein / bedingt
- Begruendung mit Abteilungsreferenz
- Action Items mit Verantwortlichkeit und Deadline (als Tasks in DB)
- Hauptrisiko + Gegenmassnahme
- Follow-ups mit messbaren Bedingungen und Pruef-Datum
- Neue Agenten wenn Perspektive fehlte
- Eskalation an Operator wenn menschliche Entscheidung noetig

---

## 11. Persistentes Gedaechtnis

**Was es tut:**
Jede Abteilung hat ein eigenes Gedaechtnis das ueber Deliberationen hinweg erhalten bleibt. Agenten lernen mit der Zeit den Kontext des Unternehmens.

**Gedaechtnisschichten:**

| Schicht | Beschreibung | Scope |
|---------|-------------|-------|
| Globales Gedaechtnis | Unternehmenskontext, Projekte, Ziele | Alle Agenten |
| Abteilungs-Gedaechtnis | Fachspezifische Erkenntnisse | Pro Agent |
| Gedaechtnis-Log | Verlauf aller Aenderungen | Pro Agent |
| Geteiltes Wissen | Agent-zu-Agent-Antworten | Pro Deliberation |

**Kontext setzen:**
```bash
node run.js --onboarding
node run.js --set-context "key=value"
node run.js --context
```

---

## 12. Token-Budget und Kostenkontrolle

**Was es tut:**
Schuetzt vor unkontrollierten API-Kosten. Nur relevant wenn CLAUDE_MODE=api.

**Funktionen:**
- Hartes Tageslimit (DAILY_TOKEN_LIMIT in .env)
- Warnung bei 80% Verbrauch (Eskalation in Inbox)
- Blockierung bei 100% bis Mitternacht
- Kostenhistorie der letzten 30 Tage im Dashboard

---

## 13. Eskalations-Inbox

**Was es tut:**
Agenten und CEO stellen Fragen an den Operator wenn eine menschliche Entscheidung noetig ist. Antworten fliessen als Kontext in nachfolgende Tasks.

**Verwendung:**
- Web-Dashboard: http://[HOST]:3000 (API-Modus)
- Antwort wird als Nachricht zurueck an die fragende Abteilung geschickt

---

## 14. PDF-Export

**Was es tut:**
Nach jeder Deliberation wird automatisch ein grafisch ansprechender PDF-Report erstellt und geoeffnet.

**Inhalt des Reports:**
- Cover mit Thema, Datum, Metadaten
- Phase 1: Erstanalysen aller Agenten (farbcodiert nach Abteilung)
- Phase 2: Deliberation
- CEO-Entscheidung mit Handlungsplan

**Deaktivieren:**
```bash
node run.js --no-pdf "Frage"
```

---

## 15. Autonomer Dauerbetrieb (API-Modus)

**Was es tut:**
Im API-Modus laeuft Company OS als 24/7-Service auf dem Server mit automatischen Zyklen.

**Automatische Jobs:**
- Task-Queue-Loop alle N Minuten (CYCLE_INTERVAL_MINUTES)
- Taeglicher Strategiepuls um 08:00
- Woechentliches Review montags um 07:00
- Stuendlicher Follow-up-Check

**Deployment:**
```bash
sudo systemctl enable company-os
sudo systemctl start company-os
```

---

## 16. Web-Dashboard (API-Modus)

**Was es tut:**
Browser-Interface zum Beobachten und Steuern des Systems.

**Ansichten:**
- Task-Queue mit Status
- Nachrichten-Bus zwischen Agenten
- Agent-Gedaechtnis aller Abteilungen
- Metriken mit Alert-Status
- Follow-up-Uebersicht
- Token-Budget mit 30-Tage-History
- Eskalations-Inbox mit Antwort-Funktion
- Orchestrations-Zyklen

---

## 17. Setup-Wizard

**Was es tut:**
Fuehrt durch die Ersteinrichtung — Modus-Auswahl, API-Key, Limits, DB-Initialisierung.

```bash
npm run setup
```

---

## Befehlsuebersicht

```bash
# Einrichtung
npm run setup                              # Ersteinrichtung
node run.js --onboarding                  # Unternehmenskontext eingeben

# Deliberation
node run.js "Frage"                        # Standard (3 Runden, PDF)
node run.js --no-pdf "Frage"               # Ohne PDF
node run.js --consultant mckinsey "Frage"  # Mit Consultant
node run.js --consultant mckinsey,ey "Frage"  # Mehrere Consultants

# Kontext
node run.js --context                      # Kontext anzeigen
node run.js --set-context "key=value"      # Kontext setzen

# Auswertung
node run.js --performance                  # Agent-Performance
node run.js --list-consultants             # Verfuegbare Consultants

# Server (API-Modus)
npm start                                  # Server + Dashboard
```

---

## Konfiguration (.env)

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| CLAUDE_MODE | cli | cli = Claude Code, api = Anthropic API |
| ANTHROPIC_API_KEY | — | Nur fuer api-Modus |
| CLAUDE_MODEL | claude-sonnet-4-20250514 | Modell |
| PORT | 3000 | Dashboard-Port |
| MAX_LOOP_ROUNDS | 3 | Runden im iterativen Loop |
| CYCLE_INTERVAL_MINUTES | 60 | Task-Queue-Interval |
| MAX_AGENT_CALLS_PER_CYCLE | 20 | Token-Schutz |
| DAILY_TOKEN_LIMIT | 100000 | Budget-Limit (api-Modus) |
| META_EVALUATION | true | Selbstverbesserung ein/aus |
| LOG_LEVEL | info | debug / info / warn / error |
