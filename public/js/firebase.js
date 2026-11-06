// Configuración pública de la aplicación web Firebase.
// Esta configuración identifica el proyecto; NO es una clave de administrador.
// La seguridad de los datos depende de Authentication y de las reglas de Firestore.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDKCVl0m-3DUPwXUXyjwdJTqpwZBT3jiUw",
  authDomain: "buffet411-f80af.firebaseapp.com",
  projectId: "buffet411-f80af",
  storageBucket: "buffet411-f80af.firebasestorage.app",
  messagingSenderId: "796406577302",
  appId: "1:796406577302:web:f2c35617ebbfc0538c6ab7"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = "es";
const db = getFirestore(app);

export { app, auth, db };
