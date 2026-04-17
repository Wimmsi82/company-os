# PRD — Company OS

## Problem
Strategische und operative Aufgaben erfordern Input aus mehreren Perspektiven gleichzeitig. Manuelle Koordination zwischen Funktionen ist langsam, lückenhaft und abhängig von menschlicher Verfügbarkeit.

## Zielgruppe
Bernhard — Operator und Entscheider. Kein weiteres Team.

## User Stories

**Als Operator möchte ich** eine Aufgabe eingeben und automatisch eine strukturierte Entscheidungsgrundlage erhalten, **damit** ich nicht jede Perspektive selbst erarbeiten muss.

**Als Operator möchte ich** dass Abteilungen sich gegenseitig beauftragen, **damit** Folgethemen ohne mein Zutun weiterverfolgt werden.

**Als Operator möchte ich** Metriken setzen die automatisch Reaktionen auslösen, **damit** kritische Schwellenwerte nicht unbemerkt überschritten werden.

**Als Operator möchte ich** das System per Browser-Dashboard überwachen, **damit** ich jederzeit sehen kann was die Agenten getan haben.

## Erfolgskriterien
- Deliberation (3 Phasen) läuft ohne manuellen Eingriff durch
- Tasks zwischen Abteilungen werden korrekt weitergegeben und bearbeitet
- Metrik-Alerts erzeugen automatisch Folge-Tasks
- Dashboard zeigt aktuellen Systemstand in Echtzeit
- System läuft stabil als systemd-Service auf dem Pi
