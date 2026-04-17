---
name: agents
description: Projekt-spezifischer Skill für Agent-Entwicklung in Company OS.
  Triggern bei Aufgaben rund um Agenten, processTask, deliberate, memory, message bus.
---

# Agents — Company OS

## Setup
Basis-Klasse: @src/agents/base.js
Registry: @src/agents/index.js
CEO: @src/agents/ceo.js
Claude-Wrapper: @src/api/claude.js — nie direkt Anthropic importieren

## Neuen Agenten hinzufügen
1. Eintrag in AGENT_DEFS in src/agents/index.js
2. id, name, systemPrompt definieren
3. Kein eigenes File nötig — BaseAgent übernimmt alles

## processTask Response-Format (JSON)
```json
{
  "analysis": "text",
  "tasks_for_others": [{"to_dept":"..","type":"..","priority":1-10,"title":"..","body":".."}],
  "messages_to": [{"to_dept":"..","subject":"..","body":".."}],
  "memory_updates": [{"key":"..","value":"..","confidence":0.0-1.0}],
  "needs_human_decision": false,
  "human_question": null
}
```

## Erfolg
Agent liefert valides JSON, Task-Status → done, Folge-Tasks in Queue

## Fehler
JSON-Parse-Fehler → _parseResult() fängt ab, speichert Rohtext als analysis
API-Fehler → Task-Status → failed, Fehlermeldung in result

## Gotchas
- system-Prompt nie zu lang — Pi hat genug RAM aber Token kosten Geld
- MAX_AGENT_CALLS_PER_CYCLE beachten — default 20
- 'all' als to_dept: alle Agenten bearbeiten diesen Task
- memory UNIQUE(dept, key) — upsert, nicht insert

## Referenzen
@src/agents/base.js
@src/db/index.js
@docs/SYSTEM_DESIGN.md
