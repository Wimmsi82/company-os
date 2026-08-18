# Texte

Deutsche Formulierungsbausteine fuer Ladezustaende. Klare Sprache, keine
Fantasie-Froehlichkeit, kein "Wir zaubern gerade", kein Ausrufezeichen-Overkill.
In Kontexten mit Geld, Recht oder Kundendaten (Zahlung, Vertrag, Export mit
personenbezogenen Daten) gilt strikt sachliche Sprache, keine verspielte Copy.

Platzhalter in {geschweiften Klammern} durch echte Werte ersetzen. Zeitangaben nur
setzen, wenn sie aus echten Daten kommen (keine erfundene Restdauer).

## Einfaches Laden (Skeleton, kurzer Indikator)

- "Daten werden geladen"
- "Wird geladen …"
- "Einen Moment"
- Sichtbarer Text nur bei laengerem Warten noetig, unter 1s reicht der stille
  Indikator plus die Screenreader-Ansage.

## Mit Restdauer (ab ca. 4s, wenn Dauer bekannt/schaetzbar)

- "Noch etwa {20} Sekunden"
- "Noch etwa {2} Minuten"
- "Fast fertig"
- "{42} von {120} Datensaetzen"

## Bekannte Zeit als Anker (R5)

- "{2} Minuten Lesezeit"
- "Dauert erfahrungsgemaess unter einer Minute"
- "Fertig in etwa {12} Minuten"
- Nur verwenden, wenn der Wert aus echten Messungen/Erfahrungswerten stammt, nicht
  geraten.

## Mehrstufiger Fortschritt (R4)

- "Schritt {2} von {4}: Daten werden geprueft"
- "Schritt {1} von {3}: Datei wird hochgeladen"
- "Schritt {3} von {3}: Ergebnis wird gespeichert"
- Nach Abschluss eines Schritts: "{Schrittname} abgeschlossen" (kurz, fuer die
  Live-Region, nicht als Dauertext)

## Hintergrundvorgang (> 10s)

- "Bericht wird erstellt, du kannst weiterarbeiten. Wir sagen Bescheid, wenn er
  fertig ist."
- "Export laeuft im Hintergrund"
- Bei Fertigstellung: "{Bericht} ist fertig" mit direktem Link/Bedienelement zum
  Ergebnis, nicht nur eine Statusaenderung ohne Aktion.
- Ansprache je Flaeche beachten (siehe Projekt-CLAUDE.md): Owner-/Manager-Flaechen
  siezen, Mitarbeiter-Self-Service duzt, wenn das Projekt diese Unterscheidung
  fuehrt.

## Unbestimmter Fortschritt (Dauer unbekannt/schwankt, z.B. KI-Antwort)

- "Wird verarbeitet"
- "Antwort wird erstellt"
- "Ergebnis wird berechnet, das kann je nach Umfang variieren"
- Niemals eine Prozentzahl, die nicht gemessen ist.

## Fehler

- "{Vorgang} ist fehlgeschlagen. Bitte versuche es erneut."
- "Die Verbindung wurde unterbrochen. Bitte versuche es erneut."
- "{Vorgang} konnte nicht gespeichert werden."
- Keine rohen Fehlermeldungen/Stacktraces/Statuscodes an den Nutzer weitergeben.
  Technische Details ins Log, nicht in die Meldung.

## Leerer Zustand nach Ladeende

- "Keine Ergebnisse fuer diese Suche"
- "Noch keine Eintraege vorhanden"
- "Fuer diesen Zeitraum liegen keine Daten vor"
- Bei Filtern: "Keine Treffer mit den aktuellen Filtern" plus Bedienelement zum
  Zuruecksetzen.
- Nicht verwenden: unbelegte Erfolgsaussagen auf leeren Daten (z.B. ein
  Compliance-Score von 100 % auf einem Plan ohne Eintraege). Stattdessen explizit
  sagen, dass nichts zu pruefen war.

## Optimistisches Update, Fehlerfall

- "Konnte nicht gespeichert werden, bitte erneut versuchen"
- Zustand sichtbar zuruecksetzen, nicht nur die Meldung zeigen und den falschen
  Stand stehen lassen.

## Was vermieden wird

- "Wir zaubern gerade …"
- "Gleich geht's los!" (uebertriebene Ausrufezeichen-Froehlichkeit)
- Emojis in Ladezustaenden von Geld-/Rechts-/Kundendaten-Flaechen
- Erfundene Prozentzahlen oder Restzeiten ohne Datenbasis
- Technisches Jargon ("Payload wird verarbeitet") in nutzersichtbaren Texten
