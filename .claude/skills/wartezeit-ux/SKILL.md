---
name: wartezeit-ux
description: >
  Gestaltet Wartezeit in Frontend-/UI-Arbeit bewusst, statt sie als stillen Spinner
  enden zu lassen. Triggert bei jeder Arbeit mit Datenabruf, Formular-Absenden,
  Datei-Upload, Login, Suche, Bericht-Generierung, KI-Antwort oder Dashboard-Aufbau,
  sowie bei `isLoading`, `pending`, `fetching`, `Suspense`, `useQuery`, `useMutation`,
  `await fetch`/`axios`. Auch bei Formulierungen wie "die App fuehlt sich langsam an",
  "der Spinner dreht ewig", "Ladezustand", "Skeleton", "Loading State", "dauert zu
  lange", "haengt", "keine Rueckmeldung", "empty state", "optimistic update".
---

# Wartezeit-UX

## Kernthese

Gefuehlte Dauer ist nicht gemessene Dauer. Dieselben drei Sekunden koennen sich wie
eine oder wie dreissig anfuehlen, je nachdem was der Nutzer waehrend des Wartens
sieht. Backend-Performance und Wahrnehmungsgestaltung sind zwei getrennte Hebel.
Dieser Skill zieht ausschliesslich den zweiten. Er schlaegt niemals eine
Backend-Optimierung als Ersatz fuer Wahrnehmungsgestaltung vor, beides gilt parallel.

## Die sieben Regeln

1. **Fortschritt zeigen, nicht Stille.** Balken, Prozentwert oder Schrittzaehler statt
   ein rotierender Kreis ohne Kontext. Ein Spinner ohne Text ist Beschaeftigungstherapie
   fuer das Auge, kein Fortschritt.
2. **Dem Kopf etwas zu tun geben.** Mikro-Interaktionen, fachliche Tipps oder eine
   Vorschau halten die Aufmerksamkeit waehrend das System arbeitet.
3. **Dauer nennen, bevor gefragt wird.** "Noch etwa 30 Sekunden" fuehlt sich kuerzer
   an als ein stummer Spinner bei exakt gleicher Dauer.
4. **Kleine Schritte schlagen eine lange Wartezeit.** Zeigarnik-Effekt: sichtbare
   Teilschritte fuehlen sich insgesamt schneller an als ein einziger langer Block.
5. **Zeit borgen, die Menschen schon verstehen.** "2 Minuten Lesezeit" oder "kommt in
   12 Minuten" landet sofort. Neue Wartezeit an bekannte Erfahrung ankern.
6. **Ladeflaechen sind Design, kein Platzhalter.** Skeleton Screens, kluge
   Ladereihenfolge und Detailentscheidungen bestimmen die gefuehlte Geschwindigkeit
   oft staerker als die tatsaechliche Millisekundenzahl.
7. **Zuerst laden, was der Nutzer zuerst sieht.** Ladereihenfolge nach Blickfuehrung,
   nicht nach Datenbankreihenfolge.

## Schwellenwerte

Richtwerte aus etablierter UX-Literatur (Miller 1968, Nielsen 1993, Doherty-Schwelle),
keine Naturgesetze.

| Dauer | Wahrnehmung | UI-Pflicht |
|---|---|---|
| < 100 ms | wirkt sofort | nichts, kein Indikator |
| 100 bis 400 ms | fluessig | optional Zustandswechsel am Element selbst |
| 400 ms bis 1 s | leichte Verzoegerung spuerbar | lokaler Indikator am ausloesenden Element |
| 1 bis 4 s | bewusstes Warten | Skeleton oder bestimmter Fortschritt, Kontexttext |
| 4 bis 10 s | Aufmerksamkeit droht abzureissen | Fortschritt in %/Schritten, Restdauer, Abbrechen moeglich |
| > 10 s | Nutzer wendet sich ab | Vorgang in den Hintergrund, Benachrichtigung bei Fertigstellung, Nutzer arbeitet weiter |

## Drei harte Regeln

1. **Kein Fake-Fortschritt.** Kein Balken der bei 90 % haengt, keine erfundenen
   Prozentwerte. Unbekannter echter Fortschritt heisst unbestimmter Fortschritt plus
   Kontexttext, nie eine erfundene Zahl.
2. **Kein Skeleton unter 400 ms.** Verzoegert einblenden, dann eine Mindestdauer
   halten. Ein Skeleton das aufblitzt wirkt wie ein Fehler.
3. **Skeleton ist nicht automatisch besser als Spinner.** Bei kurzen Wartezeiten
   schneiden Skeletons in Untersuchungen teils schlechter ab. Entscheidung nach Dauer
   und danach ob die Zielstruktur wirklich vorhersehbar ist. Ein Skeleton das nicht
   der spaeteren Struktur entspricht, erzeugt einen Layout-Sprung und schadet mehr
   als es hilft.

## Entscheidungsbaum

```
Wie lange dauert der Vorgang (gemessen, nicht geraten wenn messbar)?
│
├─ < 100 ms → nichts anzeigen
│
├─ 100 bis 400 ms
│   └─ nur eine Interaktion am Element selbst (z.B. Button-Zustand), kein Overlay
│
├─ 400 ms bis 1 s
│   └─ lokaler Indikator direkt am Ausloeser (Button-Spinner, Feld-Rahmen), kein
│      Vollbild-Ladezustand
│
├─ 1 bis 4 s
│   ├─ Zielstruktur bekannt UND stabil (Liste, Karte, Tabelle) → Skeleton in exakt
│   │  der spaeteren Groesse, verzoegert nach 300 bis 400 ms, danach Mindestdauer
│   └─ Zielstruktur unbekannt/variabel → bestimmter Fortschritt wenn messbar,
│      sonst unbestimmter Fortschritt plus Kontexttext ("Daten werden geprueft")
│
├─ 4 bis 10 s
│   └─ Fortschritt in % oder Schritten, Restdauer nennen (R3), Abbrechen anbieten
│      wenn der Vorgang abbrechbar ist, mehrstufig zerlegen wenn moeglich (R4)
│
└─ > 10 s
    └─ Vorgang in den Hintergrund verlagern, Nutzer darf weiterarbeiten,
       Benachrichtigung/Badge bei Fertigstellung, kein blockierendes Overlay
```

Kenne ich den Fortschritt nicht, aber die Dauer schwankt stark (z.B. KI-Antwort)?
Dann R5 nutzen (bekannte Zeit borgen: "meist unter einer Minute") statt eine falsche
Praezision vorzutaeuschen, und ab 4 s auf unbestimmten Fortschritt plus Kontexttext
wechseln (nie eine erfundene Prozentzahl, siehe harte Regel 1).

## Barrierefreiheit

- Jeder Ladezustand hat eine Ansage: `role="status"` mit `aria-live="polite"`,
  bei Fehlern `role="alert"` mit `aria-live="assertive"`.
- Container die nachladen bekommen `aria-busy="true"`.
- Rein dekorative Skeleton-Flaechen bekommen `aria-hidden="true"`.
- Jede Puls-/Shimmer-Animation respektiert `prefers-reduced-motion: reduce` und
  faellt dann auf eine statische Flaeche zurueck.
- Fortschrittsbalken nutzen `role="progressbar"` mit `aria-valuenow`,
  `aria-valuemin`, `aria-valuemax`. Bei unbestimmtem Fortschritt entfaellt
  `aria-valuenow`.
- Der Fokus darf beim Wechsel von Ladezustand zu Inhalt nicht verloren gehen.

## Abgrenzung zu anderen Skills

- `frontend-design`/`impeccable-design`/`impeccable` liefern Optik und Vokabular.
  Dieser Skill liefert das Verhalten waehrend des Wartens, nicht die Farbe des
  Skeletons.
- `viewport-fit` liefert die Hoehenregel (100dvh, kein Page-Scroll auf App-Seiten).
  Ein Skeleton darf diese Regel nicht brechen und muss dieselbe Hoehe belegen wie
  der spaetere Inhalt, sonst springt das Layout (siehe harte Regel 3).
- `web-quality-check` prueft die ARIA-Umsetzung aus dem Barrierefreiheit-Abschnitt
  nach der Umsetzung.
- `security-launch-review`/`security` bleiben unberuehrt, betreffen andere Ebenen.

## Referenzdateien

- `referenz/muster.md`: konkrete Loesungsmuster je Situation (lokaler Button-Zustand,
  Skeleton, bestimmter/mehrstufiger Fortschritt, Hintergrundvorgang, optimistisches
  Update, Fehler-/Wiederholungszustand, leerer Zustand nach Ladeende).
- `referenz/komponenten.tsx`: fertige React/TypeScript/Tailwind-Bausteine mit ARIA
  und `prefers-reduced-motion`.
- `referenz/texte.md`: deutsche Formulierungsbausteine fuer Ladezustaende, sachlich,
  ohne Fantasie-Froehlichkeit.
- `referenz/audit.md`: Pruefliste fuer den Bestandscheck eines Projekts.
