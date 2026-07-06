# Klassenmanager

*(früher "Team Generator" — umbenannt, weil die App inzwischen deutlich mehr kann als Teams zu generieren)*

Eine reine Client-seitige WebApp (HTML/CSS/JavaScript, kein Server nötig) zum Verwalten von Klassen, Führen eines Anwesenheitschecks mit Wochenplan und Abwesenheitsgründen, Auswerten der Anwesenheit und Erstellen von zufälligen Teams. Alle Daten werden im `localStorage` des Browsers gespeichert. Die App lädt **keine externen Ressourcen** (alle Schriften, Icons und Styles sind lokal gebündelt) und funktioniert dank Service Worker auch **offline** — z.B. in der Turnhalle ohne WLAN.

## Features

- **Klassen verwalten**: Klassen anlegen, umbenennen, löschen; Schüler einzeln oder per Mehrfach-Import (Text) hinzufügen und jederzeit wieder entfernen. Pro Klasse kann ein **Wochenplan** hinterlegt werden (ein oder mehrere Wochentag/Uhrzeit-Termine). Pro Schüler(in) kann markiert werden, ob die Person **sportlich** ist (Läufer-Symbol in der Schülerliste zum Umschalten). Doppelte Vornamen (z.B. zwei "Lena") sind nach Rückfrage möglich — am besten mit Initial unterscheiden ("Lena M").
- **Klassenkürzel**: Wenn eine Gruppe Schüler(innen) aus mehreren echten Schulklassen mischt (z.B. Sportunterricht 7a+7b), kann pro Schüler(in) ein Kürzel hinterlegt werden — beim Einzel-Hinzufügen (Feld "Klasse"), im Mehrfach-Import (`Max m [7b]`), per CSV (5. Spalte) oder nachträglich über das Tag-Symbol in der Schülerliste. Die Anwesenheits-Auswertung lässt sich danach filtern, und Prüfungen werden pro Kürzel separat ausgewertet.
- **Import/Export**: Klassen (inkl. Wochenplan und Sportlich-Markierung) als JSON exportieren und wieder importieren (auch CSV/TXT im Format `Klasse;Name;Geschlecht;Sportlich`, letzte Spalte optional: `s`/`ja`/`x`/`1`; eine Kopfzeile wird automatisch erkannt und übersprungen).
- **Termin-Import**: Vergangene Anwesenheitschecks lassen sich als CSV importieren (in Excel: Datei → Speichern unter → CSV), Format `Datum;Name;Status;Grund;Notiz` — siehe Fragezeichen-Hilfe neben dem Import-Knopf im Anwesenheits-Tab.
- **Anwesenheitscheck**: Pro Klasse und Datum wird eine eigene Anwesenheits-Sitzung erfasst (mehrere Termine pro Klasse möglich, z.B. jede Woche). Bei Abwesenheit kann ein Grund angegeben werden (Kategorie: Krank / Verletzt / Entschuldigt / Unentschuldigt / Sonstiges, plus optionale Notiz). Passt das gewählte Datum nicht zum hinterlegten Wochenplan, wird ein Hinweis angezeigt. Erfasste Termine lassen sich in der Terminliste erneut öffnen, bearbeiten oder löschen (mit Rückgängig-Option). **Ungespeicherte Änderungen** werden angezeigt und vor Verlust (Datums-/Klassenwechsel, Schliessen der Seite) gewarnt.
- **Auswertung**: Pro Klasse eine Übersicht mit Anwesenheits-/Abwesenheitszahlen, Anwesenheitsquote, Anzahl erfasster Termine pro Schüler(in) und Aufschlüsselung der Abwesenheitsgründe – inkl. Durchschnittszeile, sortierbaren Spalten und CSV-Export. Lässt sich nach **Semester 1 (Aug–Jan) oder Semester 2 (Feb–Jul)** und — wenn die Gruppe Klassenkürzel nutzt — nach **Klassenkürzel** filtern. Aus der Klasse entfernte Schüler(innen) mit erfasster Historie bleiben als **"ehemalig"** in der Auswertung sichtbar.
- **Prüfungen/Lernzielkontrollen**: Pro Klasse/Gruppe lassen sich Prüfungen anlegen (Titel, Datum) — wahlweise mit **Punkten und Maximum** (Note automatisch nach Schweizer Formel 5 × Punkte ÷ Max + 1, auf Zehntel gerundet) oder mit **direkter Noteneingabe** (1–6). Die Auswertung zeigt Anzahl bewertet, Ø-Note, min/max und Anzahl ungenügend — bei gemischten Gruppen zusätzlich **separat pro Klassenkürzel**. Jede Prüfung kann als **TXT** exportiert werden (Zeilenformat `Name Punkte` bzw. `Name Note` im Noten-Modus); mischt die Gruppe mehrere Klassen, entsteht **pro Klassenkürzel eine eigene Datei**.
- **Teams generieren**: Zufällige Teams aus den anwesenden bzw. manuell hinzugefügten Personen erstellen — wahlweise nach **Anzahl Teams oder Personen pro Team** — kopieren, **drucken** und neu mischen. Optional werden Geschlechter und/oder **Sportlichkeit fair verteilt** (z.B. für den Sportunterricht) — die Sportlich-Markierung ist dabei bewusst **nirgends im Teams-Tab sichtbar**, damit sie beim Projizieren vor der Klasse nicht erkennbar ist. Über **"Nicht zusammen"-Regeln** lassen sich Paare definieren, die nicht im gleichen Team landen sollen.
- **Komplett-Backup**: Über die Fusszeile lassen sich alle Daten (Klassen, Wochenpläne, Anwesenheitsdaten, Teilnehmerliste, Nicht-zusammen-Regeln) als JSON sichern — **optional mit Passwort verschlüsselt** (AES-GCM) — und auf einem anderen Gerät/Browser wiederherstellen.
- **Automatische lokale Datendatei** (Chrome/Edge): In der Fusszeile kann eine JSON-Datei auf der Festplatte verbunden werden (z.B. im Dokumente-Ordner). Danach speichert die App **jede Änderung automatisch in diese Datei** und lädt sie beim Start wieder — die Daten hängen damit nicht mehr nur am Browser-Speicher. Weicht der Datei-Stand vom Browser-Stand ab (z.B. via iCloud/Cloud-Sync von einem anderen Gerät), fragt die App, welcher Stand gelten soll. In Safari/Firefox steht die Funktion nicht zur Verfügung (fehlende File-System-Access-API) — dort gilt weiterhin localStorage + manuelles Backup.
- **PWA**: Die App kann als App installiert werden (Manifest + Icon) und läuft nach dem ersten Aufruf vollständig offline.

## Sicherheit & Datenschutz

- **Keine externen Requests**: Tailwind ist vorkompiliert, Font Awesome und die Inter-Schrift sind lokal gebündelt (`vendor/`). Es fliessen keine IP-Adressen an Google Fonts, cdnjs o.ä. — relevant für DSGVO/DSG im Schulkontext.
- Alle Namen, Notizen und importierten Daten werden ausschliesslich als Text ins DOM eingefügt (kein HTML-Injection/XSS über Schülernamen o.ä. möglich).
- Importierte Dateien (Klassen-Import und Backup-Wiederherstellung) werden strikt validiert; ungültige Werte werden verworfen oder normalisiert.
- CSV-Exporte sind gegen Formel-Injection abgesichert (führende `=`, `+`, `-`, `@` werden neutralisiert).
- Eine strikte Content-Security-Policy (`default-src 'self'`) verhindert das Nachladen fremder Skripte/Styles.
- Backups können mit einem Passwort verschlüsselt werden (WebCrypto: PBKDF2-SHA-256 + AES-GCM) — empfohlen, da sie sensible Daten (Abwesenheitsgründe) enthalten.
- Es werden keine Daten an einen Server gesendet – alles bleibt im `localStorage` des Browsers. Hinweis: Der `localStorage` selbst ist unverschlüsselt; auf geteilten Geräten nach Gebrauch abmelden bzw. Browserdaten löschen.

## Lokal öffnen

Einfach `index.html` im Browser öffnen, oder lokal servieren (für den Service Worker nötig):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Entwicklung

```bash
npm install          # einmalig (nur Tailwind als Dev-Dependency)
npm run build:css    # Tailwind neu kompilieren (nach Änderungen an index.html/app.js/core.js)
npm test             # Unit-Tests (Parser, Validierung, Team-Verteilung)
```

Struktur:
- `core.js` — reine, DOM-freie Logik (Parser, Backup-Validierung, Team-Verteilung); wird von den Tests direkt geladen.
- `app.js` — UI/State, nutzt `window.TG` aus `core.js`.
- `vendor/` — gebündelte Assets (kompiliertes Tailwind, Font Awesome, Inter). `vendor/tailwind.css` ist ein Build-Artefakt: nach Änderungen an den Tailwind-Klassen `npm run build:css` ausführen und mit einchecken.
- `sw.js` / `manifest.webmanifest` / `icon.svg` — PWA/Offline.

## Online hosten

Die App besteht nur aus statischen Dateien und kann auf jedem statischen Hosting-Dienst kostenlos gehostet werden:

### GitHub Pages
1. Repository auf GitHub pushen.
2. Unter **Settings → Pages** als Quelle den Branch `main` (Ordner `/root`) auswählen.
3. Die App ist danach unter `https://<username>.github.io/<repo>/` erreichbar.

### Netlify / Vercel
1. Repository importieren.
2. Kein Build-Schritt nötig (Framework: "None" / "Static"), Publish-Verzeichnis: `.`
3. Deployen.

## Datenformat für den Klassen-Import (JSON)

```json
[
  {
    "name": "7a",
    "schedule": [
      { "weekday": 0, "time": "10:00" }
    ],
    "students": [
      { "name": "Anna", "gender": "female", "sporty": true },
      { "name": "Max", "gender": "male", "sporty": false }
    ]
  }
]
```

Gültige Werte für `gender`: `female`, `male`, `diverse`.
Gültige Werte für `weekday`: `0` = Montag ... `6` = Sonntag. `schedule` ist optional.
