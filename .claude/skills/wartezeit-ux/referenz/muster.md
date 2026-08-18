# Muster

Acht wiederkehrende Situationen und wie sie nach den sieben Regeln geloest werden.
Jedes Muster nennt den Schwellenwertbereich, fuer den es gedacht ist.

## 1. Lokaler Button-Zustand (400 ms bis 1 s)

Situation: Formular absenden, Aktion ausloesen, Ergebnis kommt schnell.

- Button geht in `loading`, zeigt einen kleinen Spinner statt des Labels oder davor,
  bleibt in der gleichen Groesse (kein Layout-Sprung).
- Button ist `disabled`, `aria-busy="true"`.
- Kein Vollbild-Overlay, kein Skeleton. Der Rest der Seite bleibt bedienbar.
- Referenz: `Komponent Button` in `komponenten.tsx`.

## 2. Skeleton (1 bis 4 s, Zielstruktur bekannt)

Situation: Liste, Tabelle oder Karte laedt, die Struktur des Ergebnisses ist stabil
und vorhersehbar (z.B. immer 5 Spalten, immer eine Kopfzeile plus N Zeilen).

- Skeleton erscheint erst nach 300 bis 400 ms Verzoegerung (harte Regel 2), damit
  ein schneller Request kein Aufblitzen erzeugt.
- Sobald sichtbar, bleibt es mindestens 400 bis 500 ms stehen, auch wenn die Antwort
  frueher da ist. Sonst Flackern.
- Belegt exakt dieselbe Hoehe/Breite wie der spaetere Inhalt (Abgrenzung zu
  `viewport-fit`). Anzahl Skeleton-Zeilen = typische/erwartete Zeilenzahl, nicht
  willkuerlich.
- `aria-hidden="true"` auf die Skeleton-Flaechen selbst, `role="status"` plus
  `aria-live="polite"` auf den umgebenden Container mit einem versteckten Text wie
  "Daten werden geladen".
- Ist die Zielstruktur NICHT vorhersehbar (z.B. variable Kartenzahl, variable
  Textlaenge), kein Skeleton verwenden, stattdessen Muster 3 oder ein einfacher
  zentrierter Indikator mit Text.

## 3. Bestimmter Fortschritt (1 bis 10 s, Fortschritt messbar)

Situation: Datei-Upload, Export, mehrteiliger Datenabruf mit bekannter Gesamtzahl.

- `role="progressbar"`, `aria-valuenow`/`aria-valuemin`/`aria-valuemax` korrekt
  gesetzt und live aktualisiert.
- Zahl UND Balken, nie nur der Balken (R1). Text wie "42 von 120 Datensaetzen" statt
  nur "35 %", wenn die Einheit dem Nutzer etwas sagt.
- Ab 4 s zusaetzlich Restdauer schaetzen und nennen (R3), z.B. aus bisheriger Rate
  hochrechnen. Nie eine Restdauer nennen, die nicht aus echten Daten stammt.
- Referenz: `Komponent Progressbar` in `komponenten.tsx`.

## 4. Mehrstufiger Fortschritt (4 s und mehr, in Teilschritte zerlegbar)

Situation: Onboarding-Verarbeitung, Import mit Validierung/Mapping/Schreiben,
mehrstufige Pruefung.

- Schritte einzeln benennen ("Schritt 2 von 4: Daten werden geprueft"), jeder
  abgeschlossene Schritt bekommt ein sichtbares Haekchen (Zeigarnik-Effekt, R4).
- Aktueller Schritt zeigt einen eigenen kleinen Indikator, nicht nur den globalen
  Fortschrittsbalken.
- Wenn ein Schritt fehlschlaegt: nur dieser Schritt wird als Fehler markiert, die
  vorherigen bleiben als erledigt sichtbar. Kein Reset auf Schritt 1.
- Referenz: `Komponent Stepper` in `komponenten.tsx`.

## 5. Hintergrundvorgang mit Benachrichtigung (> 10 s)

Situation: Bericht-Generierung, grosser Export, KI-Analyse mit unklarer Dauer.

- Vorgang startet, Nutzer bekommt sofort eine Bestaetigung und darf weiterarbeiten
  (kein blockierendes Overlay, kein Verlassen-Verhindern).
- Ein persistenter, dezenter Hinweis (Badge, Leiste, Glocken-Icon) zeigt "laeuft
  noch". Bei Fertigstellung: Benachrichtigung plus direkter Link zum Ergebnis.
- Bricht der Vorgang serverseitig ab, bekommt der Nutzer eine Fehlermeldung an
  derselben Stelle, nicht nur einen stillen Timeout.
- Referenz: `Komponent HintergrundBadge` in `komponenten.tsx`.

## 6. Optimistisches Update (jede Dauer, wenn der Ausgang so gut wie sicher ist)

Situation: Haekchen setzen, Reihenfolge aendern, einfache Statuswechsel mit hoher
Erfolgswahrscheinlichkeit.

- UI zeigt den neuen Zustand sofort, bevor die Serverantwort da ist.
- Im Hintergrund laeuft die echte Anfrage. Bei Erfolg passiert nichts sichtbar
  Zusaetzliches. Bei Fehler: Zustand zurueckrollen plus kurze, sichtbare Meldung
  warum ("Konnte nicht gespeichert werden, bitte erneut versuchen").
- Nicht verwenden bei Vorgaengen mit Geld-, Rechts- oder Datenwirkung, deren
  Ausgang nicht sicher ist (Zahlung, Vertragsaenderung, Loeschung). Dort immer
  echten Ladezustand plus Bestaetigung nach Antwort.

## 7. Fehler- und Wiederholungszustand (nach jedem gescheiterten Ladevorgang)

Situation: Request schlaegt fehl, Timeout, Server-Fehler.

- `role="alert"`, `aria-live="assertive"`.
- Klarer Grund in einfacher Sprache, keine rohe Fehlermeldung/kein Stacktrace.
- Immer ein Wiederholen-Bedienelement, wenn ein erneuter Versuch sinnvoll ist.
- Layout an derselben Stelle wie der urspruengliche Ladezustand, kein Sprung.
- Referenz: `Komponent Fehlerzustand` in `komponenten.tsx`.

## 8. Leerer Zustand nach Ladeende (Laden erfolgreich, aber Ergebnis ist leer)

Situation: Suche ohne Treffer, Liste ohne Eintraege, Filter ohne Ergebnis.

- Niemals denselben Skeleton/Spinner stehen lassen oder einfach nichts anzeigen.
- Klarer Satz was der leere Zustand bedeutet, plus ein Bedienelement fuer die
  naechste sinnvolle Aktion (Filter zuruecksetzen, ersten Eintrag anlegen, Suche
  aendern).
- Ein leerer Zustand darf keinen Erfolg behaupten, den er nicht geprueft hat (z.B.
  "Alles in Ordnung" auf einer Liste die schlicht leer ist statt tatsaechlich
  gepruefter Daten).
