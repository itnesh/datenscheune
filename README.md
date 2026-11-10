# Datenscheune

Zeiterfassung, Projekte und Rechnungen für die Selbständigkeit. Web-App für den Browser (später PWA fürs Smartphone). Google-Login, nur ein Konto hat Zugriff. Kein Build, kein Dev-Setup.

## Funktionen
- **Firmen**: Adresse, Ansprechpartner, Standard-Stundensatz
- **Projekte**: Status, Personen (aus Ansprechpartnern der Firma), To-dos, Notizen/Protokolle, Links, Stundensatz (leer = Standard der Firma)
- **Zeiterfassung**: Schnellerfassung, Timer, wiederverwendbare Tags, verrechenbar ja/nein, Filter, CSV-Export
- **Spesen**: pro Projekt, verrechenbar ja/nein
- **Rechnungen**: aus offenen Tätigkeiten und Spesen, PDF mit Swiss-QR-Zahlteil und Rapport als Beilage, Status offen/bezahlt/storniert
- **Dashboard**: Stunden Woche/Monat, nicht verrechnet, offene Rechnungen, Umsatz vs. MWST-Grenze, offene To-dos
- **Einstellungen**: eigene Adresse, IBAN/QR-IBAN, Logo, Fusstext, Backup (JSON)

## Architektur
- Statische Dateien (HTML/CSS/JS), gehostet auf **GitHub Pages**
- Daten in **Firestore** unter `datenscheune/main/...`, offline-fähig
- Ohne Firebase-Konfiguration läuft die App **nur lokal** im Browser (zum Testen)
- PDF im Browser (jsPDF, autoTable, qrcode-generator in `vendor/`)

## Einrichtung (einmalig, ca. 15 Min.)

### 1. GitHub
1. github.com > **New repository** > Name `datenscheune` > **Public** (für Gratis-Pages) > Create.
2. **Add file > Upload files** > alle Dateien und Ordner aus diesem Paket hochladen > Commit.
3. **Settings > Pages** > Source "Deploy from a branch" > Branch `main` / `(root)` > Save.
4. Nach ca. 1 Min. erreichbar unter `https://itnesh.github.io/datenscheune/`.
   Bis Schritt 2 erledigt ist, läuft die App dort im lokalen Testmodus.

### 2. Firebase
1. console.firebase.google.com > **Projekt hinzufügen** > Name `datenscheune` > Google Analytics deaktivieren > Erstellen.
2. **Build > Firestore Database > Datenbank erstellen** > Standort `europe-west6 (Zürich)` > Produktionsmodus.
3. **Build > Authentication > Jetzt starten > Sign-in method > Google** aktivieren > Support-E-Mail wählen > Speichern.
4. **Authentication > Einstellungen > Autorisierte Domains** > `itnesh.github.io` hinzufügen.
5. **Projekteinstellungen (Zahnrad) > Allgemein > Meine Apps > Web (`</>`)** > Name `datenscheune` > registrieren (Hosting nicht nötig).
   Die angezeigte `firebaseConfig` in `config.js` eintragen:
   ```js
   window.DS_FIREBASE = {
     apiKey: "...",
     authDomain: "datenscheune-xxxxx.firebaseapp.com",
     projectId: "datenscheune-xxxxx",
     storageBucket: "datenscheune-xxxxx.firebasestorage.app",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   `config.js` auf GitHub ersetzen (Datei öffnen > Stift-Symbol > einfügen > Commit).
6. **Firestore > Regeln** > ersetzen > **Veröffentlichen**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /datenscheune/{document=**} {
         allow read, write: if request.auth != null
           && request.auth.token.email_verified == true
           && request.auth.token.email == 'erdinmatthias@gmail.com';
       }
     }
   }
   ```

### 3. Start
`https://itnesh.github.io/datenscheune/` öffnen > "Mit Google anmelden".
Danach: Einstellungen (Adresse, IBAN) > Firma > Projekt > Zeit erfassen > Rechnung.

Testdaten aus dem lokalen Modus übernehmen: vor dem Eintragen der Firebase-Config **Einstellungen > Backup herunterladen**, danach angemeldet **Backup einlesen**.

## Sicherheit
Zugriff nur für die E-Mail in den Firestore-Regeln. Die Firebase-Config im Code ist öffentlich, das ist bei Web-Apps normal. Das Repo ist öffentlich, enthält aber keine Geschäftsdaten.

## Fachliche Regeln
- Stundensatz: Projektansatz, sonst Standard der Firma.
- Dauer-Eingabe: `1:30` = 1 Std. 30 Min., `1.5` = 1.5 Std., `45m` = 45 Min.
- Rechnung: Positionen pro Projekt und Ansatz (Stunden x Ansatz), Spesen einzeln, Beträge auf 5 Rappen gerundet.
- Rechnungsnummer: `JJJJ-NNN`, fortlaufend pro Jahr.
- QR-Referenz: mit QR-IBAN = QR-Referenz (QRR), mit normaler IBAN = Creditor Reference (SCOR, RF...).
- Rechnung löschen gibt Tätigkeiten/Spesen wieder frei. Stornieren lässt sie als verrechnet markiert.
- Keine MWST (in Einstellungen Fusstext anpassbar). MWST-Grenze im Dashboard überwacht.

## Backup
Einstellungen > "Backup herunterladen (JSON)". Empfehlung: 1x pro Monat.

## Updates
Datei ändern, committen. Die App lädt neue Versionen automatisch (Netzwerk zuerst, Cache als Offline-Fallback).
