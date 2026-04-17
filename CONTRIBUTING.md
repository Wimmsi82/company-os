# Contributing to Company OS

## Was du beitragen kannst

- **Neue Agenten** — spezialisierte Abteilungen für bestimmte Branchen
- **Bug Fixes** — Fehler im Scheduler, DB-Layer oder CLI-Wrapper
- **Verbesserungen** — bessere System-Prompts, Gedächtnis-Logik, Dashboard
- **Dokumentation** — Übersetzungen, Beispiele, Tutorials

## Wie du beiträgst

1. Fork erstellen
2. Branch anlegen: `git checkout -b feature/mein-feature`
3. Änderungen committen: `git commit -m "feat: neuer Customer-Success-Agent"`
4. Push: `git push origin feature/mein-feature`
5. Pull Request öffnen

## Regeln

- Kein TypeScript — plain Node.js, kein Build-Step
- try/catch in jedem Agent-Aufruf
- Alle Claude-Calls über `src/api/claude.js` — nie direkt
- Kein API Key im Code
- CHANGELOG.md nach jeder Änderung aktualisieren

## Neuen Agenten beisteuern

Einfachster Beitrag: einen neuen Agenten in `src/agents/index.js` hinzufügen.

```js
{
  id: 'customer_success',
  name: 'Customer Success',
  systemPrompt: 'Du bist der Head of Customer Success. ...'
}
```

Dazu ein kurzes Beispiel im PR was der Agent besser kann als die bestehenden.
