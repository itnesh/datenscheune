// Firebase-Konfiguration (oeffentlich, kein Geheimnis). Zugriffsschutz ueber die Firestore-Regeln (nur deine E-Mail).
// Leer lassen = App laeuft nur lokal im Browser (zum Testen).
window.DS_FIREBASE = null;
/* Beispiel nach Einrichtung (Werte aus Firebase > Projekteinstellungen > Meine Apps):
window.DS_FIREBASE = {
  apiKey: "...",
  authDomain: "datenscheune-xxxxx.firebaseapp.com",
  projectId: "datenscheune-xxxxx",
  storageBucket: "datenscheune-xxxxx.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
*/
