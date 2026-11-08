// Configuración pública de la aplicación web Firebase.
// Esta configuración identifica el proyecto; NO es una clave de administrador.
// La seguridad de los datos depende de Authentication y de las reglas de Firestore.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDKCVl0m-3DUPwXUXyjwdJTqpwZBT3jiUw",
  authDomain: "buffet411-f80af.firebaseapp.com",
  projectId: "buffet411-f80af",
  storageBucket: "buffet411-f80af.firebasestorage.app",
  messagingSenderId: "796406577302",
  appId: "1:796406577302:web:f2c35617ebbfc0538c6ab7"
};

const isLocalEmulator = ["localhost", "127.0.0.1"].includes(location.hostname);
const runtimeConfig = isLocalEmulator
  ? {
      ...firebaseConfig,
      projectId: "demo-buffet411-local",
      authDomain: "demo-buffet411-local.firebaseapp.com"
    }
  : firebaseConfig;

const app = getApps().length ? getApp() : initializeApp(runtimeConfig);
const auth = getAuth(app);
auth.languageCode = "es";
const db = getFirestore(app);

if (isLocalEmulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export { app, auth, db };
