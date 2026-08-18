# Audit-Pruefliste

Pruefliste fuer den Bestandscheck eines Projekts gegen `wartezeit-ux`. Ergebnis als
Tabelle je Projekt, Spalten:

| Datei und Zeile | Vorgang | Geschaetzte Dauer | Aktueller Zustand | Verletzte Regel | Empfohlene Loesung | Aufwand |
|---|---|---|---|---|---|---|

Dauer messen wo moeglich (Netzwerk-Tab, Server-Logs, Timer im Code), nur schaetzen
wo nicht messbar, und die Schaetzung als solche kennzeichnen. Aufwand S/M/L.

## Suchmuster

Code:
- Spinner-, Loader- und Loading-Komponenten (Dateiname/Import)
- `isLoading`, `pending`, `fetching`, `Suspense`, `useQuery`, `useMutation`
- `await fetch`, `axios`, Datei-Upload-Handler, Formular-Submit-Handler
- `animate-spin`, `animate-pulse` und aehnliche Loading-Klassen

Verhalten:
- Button, der nach Klick keinen sichtbaren Zustand aendert (kein `disabled`, kein
  `aria-busy`, kein visuelles Feedback)
- Ladevorgang ohne Fehlerzustand oder ohne Wiederholen-Moeglichkeit
- Erfolgreicher, aber ergebnisloser Ladevorgang ohne eigenen leeren Zustand
  (Liste bleibt einfach leer/weiss)
- Animation ohne `prefers-reduced-motion`-Behandlung
- Ladezustand ohne `role`/`aria-live`/`aria-busy`
- Skeleton, das nicht die Groesse/Struktur des spaeteren Inhalts hat
  (Layout-Sprung beim Einblenden)
- Skeleton, das sofort erscheint und bei schnellen Antworten aufblitzt
  (fehlende Verzoegerung, harte Regel 2)
- Fortschrittsbalken mit erfundenen/geschaetzten statt gemessenen Werten
  (harte Regel 1)

## Bewertungskriterium fuer die Rangliste

Sichtbarer Nutzen geteilt durch Aufwand. Kriterien fuer "sichtbarer Nutzen":
- Wie oft trifft ein Nutzer auf diesen Pfad (taeglich vs. selten)?
- Wie lang ist die tatsaechliche/geschaetzte Wartezeit (laenger = mehr Hebel)?
- Ist es ein kritischer Pfad (Login, Bezahlung, Formular-Absenden, Export) oder ein
  Anzeigepfad (Liste, Dashboard)? Kritische Pfade zuerst.
- Risiken vor der Empfehlung nennen: z.B. "Skeleton-Einfuehrung hier riskiert einen
  Layout-Sprung, wenn die Kartenzahl variiert" oder "Restdauer-Anzeige braucht erst
  eine Messbasis, sonst wird sie zu Fake-Fortschritt".

## Nicht bewerten

- Backend-Performance-Optimierung selbst ist ausserhalb des Scopes. Nur die
  Wahrnehmungsgestaltung waehrend der (ggf. unveraenderten) Dauer.
- Rein interne/Admin-Tools ohne echte Nutzer niedriger priorisieren als Flaechen mit
  echtem Publikum, aber nicht komplett auslassen, wenn sie taeglich genutzt werden.
