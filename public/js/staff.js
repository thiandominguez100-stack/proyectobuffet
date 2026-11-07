import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const form = document.querySelector("#staff-login-form");
const emailInput = document.querySelector("#staff-email");
const passwordInput = document.querySelector("#staff-password");
const submitButton = document.querySelector("#staff-login-submit");
const message = document.querySelector("#staff-auth-message");
const dashboard = document.querySelector("#staff-dashboard");
const authPanel = document.querySelector("#staff-auth");
const logoutButton = document.querySelector("#staff-logout");

function showMessage(text, kind = "") {
  message.textContent = text;
  if (kind) message.dataset.kind = kind;
  else delete message.dataset.kind;
}

function showLogin(text = "Solo pueden ingresar cuentas con rol de personal o administrador.", kind = "") {
  dashboard.hidden = true;
  authPanel.hidden = false;
  showMessage(text, kind);
}

async function checkStaffRole(user) {
  const roleSnapshot = await getDoc(doc(db, "staffRoles", user.uid));
  if (!roleSnapshot.exists()) return false;
  const role = roleSnapshot.data().role;
  return role === "staff" || role === "admin";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  showMessage("Verificando cuenta…");
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );
    const authorized = await checkStaffRole(credential.user);
    if (!authorized) {
      await signOut(auth);
      showLogin("Esta cuenta no tiene permisos para acceder al panel.", "error");
      return;
    }
    showMessage("Acceso autorizado.", "success");
    authPanel.hidden = true;
    dashboard.hidden = false;
  } catch (error) {
    console.error("Error de acceso del personal:", error);
    const text = error.code === "auth/invalid-credential"
      ? "Correo o contraseña incorrectos."
      : error.code === "permission-denied"
        ? "No se pudieron verificar los permisos. Revisá las reglas de Firestore."
        : "No se pudo iniciar sesión. Revisá la conexión e intentá nuevamente.";
    showLogin(text, "error");
  } finally {
    submitButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  showLogin("Sesión cerrada correctamente.", "success");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showLogin();
    return;
  }
  try {
    const authorized = await checkStaffRole(user);
    if (authorized) {
      authPanel.hidden = true;
      dashboard.hidden = false;
    } else {
      await signOut(auth);
      showLogin("Esta cuenta no tiene permisos para acceder al panel.", "error");
    }
  } catch (error) {
    console.error("No se pudieron verificar los permisos:", error);
    await signOut(auth);
    showLogin("No se pudieron verificar los permisos. El panel quedó bloqueado.", "error");
  }
});
