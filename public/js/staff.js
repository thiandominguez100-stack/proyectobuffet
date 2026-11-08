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
const authorizedStep = document.querySelector("#staff-authorized-step");
const enterPanelButton = document.querySelector("#staff-enter-panel");
const logoutButton = document.querySelector("#staff-logout");

let currentAuthorizedUid = null;

function showMessage(text, kind = "") {
  message.textContent = text;
  if (kind) message.dataset.kind = kind;
  else delete message.dataset.kind;
}

function showLogin(text = "Solo pueden ingresar cuentas con rol de personal o administrador.", kind = "") {
  currentAuthorizedUid = null;
  dashboard.hidden = true;
  authPanel.hidden = false;
  form.hidden = false;
  authorizedStep.hidden = true;
  passwordInput.value = "";
  showMessage(text, kind);
}

function showAuthorizedStep(user) {
  currentAuthorizedUid = user.uid;
  dashboard.hidden = true;
  authPanel.hidden = false;
  form.hidden = true;
  authorizedStep.hidden = false;
  showMessage("Acceso autorizado. Tu cuenta está verificada.", "success");
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
  showMessage("Verificando cuenta y permisos…");
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
    showAuthorizedStep(credential.user);
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

enterPanelButton.addEventListener("click", async () => {
  enterPanelButton.disabled = true;
  showMessage("Comprobando permisos nuevamente…");
  try {
    const user = auth.currentUser;
    if (!user || user.uid !== currentAuthorizedUid || !(await checkStaffRole(user))) {
      await signOut(auth);
      showLogin("Tu autorización ya no está vigente. Iniciá sesión nuevamente.", "error");
      return;
    }
    authPanel.hidden = true;
    dashboard.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("No se pudieron revalidar los permisos:", error);
    showLogin("No se pudieron comprobar tus permisos. El panel sigue bloqueado.", "error");
  } finally {
    enterPanelButton.disabled = false;
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

  dashboard.hidden = true;
  authPanel.hidden = false;

  try {
    const authorized = await checkStaffRole(user);
    if (authorized) {
      // La sesión puede mantenerse en el navegador, pero el panel no se abre
      // hasta que la persona pulse expresamente "Ingresar al panel".
      showAuthorizedStep(user);
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
