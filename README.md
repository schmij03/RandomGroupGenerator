# Team Generator

Eine reine Client-seitige WebApp (HTML/CSS/JavaScript, kein Server nötig) zum Verwalten von Klassen, Erfassen der Anwesenheit und Erstellen von zufälligen Teams. Alle Daten werden im `localStorage` des Browsers gespeichert.

## Features

- **Klassen verwalten**: Klassen anlegen, umbenennen, löschen; Schüler einzeln oder per Mehrfach-Import (Text) hinzufügen.
- **Import/Export**: Klassen als JSON exportieren und wieder importieren (auch CSV/TXT im Format `Klasse;Name;Geschlecht`).
- **Anwesenheit**: Pro Klasse Schüler als anwesend/abwesend markieren.
- **Teams generieren**: Zufällige, optional geschlechterbalancierte Teams aus den anwesenden bzw. manuell hinzugefügten Personen erstellen, kopieren und neu mischen.

## Lokal öffnen

Einfach `index.html` im Browser öffnen, oder lokal servieren:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Online hosten

Die App besteht nur aus statischen Dateien (`index.html`, `style.css`, `app.js`) und kann auf jedem statischen Hosting-Dienst kostenlos gehostet werden:

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
    "students": [
      { "name": "Anna", "gender": "female" },
      { "name": "Max", "gender": "male" }
    ]
  }
]
```

Gültige Werte für `gender`: `female`, `male`, `diverse`.
