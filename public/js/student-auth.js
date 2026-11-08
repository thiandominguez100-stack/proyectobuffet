const isLocalEmulator = ["localhost", "127.0.0.1"].includes(location.hostname);
if (location.hostname !== "buffet411-f80af.web.app" && !isLocalEmulator) {
  // GitHub Pages is only a static preview; never collect credentials or profile data here.
  const gate = document.querySelector("#student-auth-gate");
  const app = document.querySelector("#student-app");
  const footer = document.querySelector("#student-footer");
  const account = document.querySelector("#student-account");
  if (gate) gate.hidden = true;
  if (app) {
    app.hidden = false;
    const notice = document.createElement("section");
    notice.className = "preview-banner wrap";
    notice.innerHTML = "<strong>Vista de demostración</strong><p>Esta dirección solo muestra el diseño. No ingreses contraseñas ni datos personales y no se envían pedidos. La versión operativa se publicará en Firebase Hosting.</p>";
    app.prepend(notice);
  }
  if (footer) footer.hidden = false;
  if (account) account.hidden = true;
} else {
  const { auth, db } = await import("./firebase.js");
  const { normalizeEnrollmentCode, isValidEnrollmentCode } = await import("./enrollment.js");
  const {
    createUserWithEmailAndPassword,
    deleteUser,
    onAuthStateChanged,
    reload,
    sendEmailVerification,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut
  } = await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js");
  const {
    doc,
    getDoc,
    serverTimestamp,
    runTransaction,
    updateDoc,
    writeBatch
  } = await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js");

const $ = (selector) => document.querySelector(selector);
const authGate = $("#student-auth-gate");
const studentApp = $("#student-app");
const studentFooter = $("#student-footer");
const feedback = $("#student-auth-feedback");
const tabs = [...document.querySelectorAll("[data-auth-mode]")];
const loginForm = $("#student-login-form");
const registerForm = $("#student-register-form");
const verifyPanel = $("#student-verify-notice");
const accountBar = $("#student-account");
const profileDialog = $("#student-profile-dialog");
const profileForm = $("#student-profile-form");

let activeProfile = null;
let activePhotoData = "";
let selectedPhotoFile = null;
let removeCurrentPhoto = false;
let previewObjectUrl = null;
let authOperationInProgress = false;
let sessionLoadToken = 0;

function showFeedback(message, kind = "") {
  feedback.textContent = message;
  if (kind) feedback.dataset.kind = kind;
  else delete feedback.dataset.kind;
}

function showAuthMode(mode) {
  verifyPanel.hidden = true;
  loginForm.hidden = mode !== "login";
  registerForm.hidden = mode !== "register";
  $("#student-auth-tabs").hidden = false;
  $("#student-auth-title").textContent = mode === "login" ? "¡Bienvenido!" : "Creá tu cuenta";
  $("#student-auth-subtitle").textContent = mode === "login"
    ? "Ingresá a tu cuenta para ver los productos y preparar tu encargo."
    : "Completá tus datos para crear tu cuenta de alumno.";
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === mode));
  showFeedback(mode === "login"
    ? "Usá tu correo para ingresar o creá una cuenta nueva."
    : "El nombre para mostrar puede ser distinto de tu correo.", "");
}

function showVerificationPanel() {
  studentApp.hidden = true;
  studentFooter.hidden = true;
  authGate.hidden = false;
  accountBar.hidden = true;
  document.querySelectorAll("[data-member-only]").forEach((item) => { item.hidden = true; });
  loginForm.hidden = true;
  registerForm.hidden = true;
  $("#student-auth-tabs").hidden = true;
  verifyPanel.hidden = false;
  $("#student-auth-title").textContent = "Un paso más";
  $("#student-auth-subtitle").textContent = "Tu cuenta se creó. Confirmá el correo para ingresar a Buffet 411.";
  showFeedback("Revisá también la carpeta de correo no deseado.", "");
}

function showSignedOut(message = "Usá tu correo para ingresar o creá una cuenta nueva.", kind = "") {
  authGate.hidden = false;
  studentApp.hidden = true;
  studentFooter.hidden = true;
  accountBar.hidden = true;
  document.querySelectorAll("[data-member-only]").forEach((item) => { item.hidden = true; });
  $("#student-auth-tabs").hidden = false;
  verifyPanel.hidden = true;
  showAuthMode("login");
  showFeedback(message, kind);
}

function initialsFor(name) {
  return String(name || "Alumno").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "A";
}

function setAvatar(initialsSelector, imageSelector, data) {
  const initials = $(initialsSelector);
  const image = $(imageSelector);
  initials.textContent = initialsFor(activeProfile?.displayName);
  if (data) {
    image.src = data;
    image.hidden = false;
    initials.hidden = true;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    initials.hidden = false;
  }
}

async function loadStudentSession(user) {
  const loadToken = ++sessionLoadToken;
  studentApp.hidden = true;
  studentFooter.hidden = true;
  authGate.hidden = false;
  accountBar.hidden = true;
  try {
    // El observador de Firebase ya entrega el estado de autenticación vigente.
    // Solo se recarga el usuario al pulsar «Ya confirmé mi correo».
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== user.uid) return;
    if (!currentUser.emailVerified) {
      showVerificationPanel();
      return;
    }

    const profileSnapshot = await getDoc(doc(db, "users", currentUser.uid));
    if (loadToken !== sessionLoadToken || !auth.currentUser) return;
    if (!profileSnapshot.exists()) {
      await signOut(auth);
      showSignedOut("Esta cuenta no tiene un perfil de alumno. Usá el acceso correspondiente.", "error");
      return;
    }
    const profile = profileSnapshot.data();
    if (profile.role !== "student" || profile.active !== true) {
      await signOut(auth);
      showSignedOut("Esta cuenta no está habilitada como alumno.", "error");
      return;
    }

    // La foto es opcional: un fallo al leerla no debe expulsar al alumno del catálogo.
    let photoData = "";
    try {
      const photoSnapshot = await getDoc(doc(db, "profilePhotos", currentUser.uid));
      if (photoSnapshot.exists()) photoData = photoSnapshot.data().photoData || "";
    } catch (photoError) {
      console.warn("No se pudo cargar la foto de perfil; se mostrará el avatar inicial:", photoError);
    }
    if (loadToken !== sessionLoadToken || !auth.currentUser) return;

    activeProfile = profile;
    activePhotoData = photoData;
    authGate.hidden = true;
    studentApp.hidden = false;
    studentFooter.hidden = false;
    accountBar.hidden = false;
    document.querySelectorAll("[data-member-only]").forEach((item) => { item.hidden = false; });
    $("#student-display-name").textContent = profile.displayName;
    setAvatar("#student-avatar-initials", "#student-avatar-image", activePhotoData);
  } catch (error) {
    console.error("No se pudo cargar el perfil del alumno:", error);
    if (loadToken !== sessionLoadToken) return;
    // Un error temporal de red o permisos no invalida por sí solo la sesión.
    const detail = error.code === "permission-denied"
      ? "Firebase no permitió consultar tu perfil. Tu sesión sigue abierta; revisaremos los permisos del perfil."
      : "No pudimos comprobar tu perfil por un problema de conexión. Tu sesión sigue abierta.";
    showSignedOut(detail + " Tocá «Ingresar» para volver a intentar.", "error");
  }
}

tabs.forEach((tab) => tab.addEventListener("click", () => showAuthMode(tab.dataset.authMode)));

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (authOperationInProgress) return;
  authOperationInProgress = true;
  const submit = $("#student-login-submit");
  submit.disabled = true;
  showFeedback("Ingresando…");
  try {
    const email = $("#student-login-email").value.trim();
    if (auth.currentUser && auth.currentUser.email === email) {
      // Si la sesión sigue abierta pero falló una lectura temporal, reintenta sin
      // obligar al alumno a iniciar sesión una y otra vez.
      await loadStudentSession(auth.currentUser);
    } else {
      if (auth.currentUser) await signOut(auth);
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        $("#student-login-password").value
      );
      await loadStudentSession(credential.user);
    }
  } catch (error) {
    const message = error.code === "auth/invalid-credential"
      ? "El correo o la contraseña no son correctos."
      : error.code === "auth/too-many-requests"
        ? "Hubo demasiados intentos. Esperá un momento y probá nuevamente."
        : "No se pudo iniciar sesión. Revisá los datos e intentá nuevamente.";
    showFeedback(message, "error");
  } finally {
    authOperationInProgress = false;
    submit.disabled = false;
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (authOperationInProgress) return;
  const displayName = $("#student-register-name").value.trim();
  const email = $("#student-register-email").value.trim();
  const registrationCode = normalizeEnrollmentCode($("#student-register-code").value);
  const password = $("#student-register-password").value;
  const confirmation = $("#student-register-confirm").value;
  if (displayName.length < 2 || displayName.length > 32) {
    showFeedback("Ingresá un nombre para mostrar de entre 2 y 32 caracteres.", "error");
    return;
  }
  if (!isValidEnrollmentCode(registrationCode)) {
    showFeedback("Ingresá el código de inscripción de 16 caracteres que te entregó el buffet.", "error");
    return;
  }
  if (password.length < 8) {
    showFeedback("La contraseña debe tener al menos 8 caracteres.", "error");
    return;
  }
  if (password !== confirmation) {
    showFeedback("Las contraseñas no coinciden.", "error");
    return;
  }

  authOperationInProgress = true;
  const submit = $("#student-register-submit");
  submit.disabled = true;
  showFeedback("Creando tu cuenta…");
  let newUser = null;
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    newUser = credential.user;
    await runTransaction(db, async (transaction) => {
      const codeRef = doc(db, "enrollmentCodes", registrationCode);
      const codeSnapshot = await transaction.get(codeRef);
      if (!codeSnapshot.exists() || codeSnapshot.data().status !== "available") {
        throw new Error("ENROLLMENT_CODE_INVALID");
      }

      const codeData = codeSnapshot.data();
      if (typeof codeData.course !== "string" || typeof codeData.division !== "string") {
        throw new Error("ENROLLMENT_CODE_INVALID");
      }

      const userRef = doc(db, "users", newUser.uid);
      transaction.set(userRef, {
        uid: newUser.uid,
        displayName,
        course: codeData.course,
        division: codeData.division,
        registrationCodeId: registrationCode,
        role: "student",
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      transaction.update(codeRef, {
        status: "used",
        usedBy: newUser.uid,
        usedAt: serverTimestamp()
      });
    });
    showVerificationPanel();
    try {
      await sendEmailVerification(newUser);
      showFeedback("Te enviamos un correo de verificación. Confirmalo para continuar.", "success");
    } catch (mailError) {
      console.error("No se pudo enviar el correo de verificación:", mailError);
      showFeedback("La cuenta se creó, pero no pudimos enviar el correo. Tocá «Reenviar correo».", "error");
    }
  } catch (error) {
    console.error("No se pudo crear la cuenta:", error);
    let preserveAccount = false;
    let profileCheckFailed = false;

    if (newUser) {
      try {
        // A network error may happen after Firestore committed both writes.
        // Never delete the Auth user until we know that the profile was not created.
        const existingProfile = await getDoc(doc(db, "users", newUser.uid));
        preserveAccount = existingProfile.exists()
          && existingProfile.data().uid === newUser.uid
          && existingProfile.data().role === "student"
          && existingProfile.data().registrationCodeId === registrationCode;

        if (!preserveAccount && !existingProfile.exists()) {
          try {
            await deleteUser(newUser);
          } catch (deleteError) {
            console.error("No se pudo limpiar la cuenta de registro incompleta:", deleteError);
          }
        }
      } catch (profileError) {
        profileCheckFailed = true;
        console.error("No se pudo verificar si el perfil se creó:", profileError);
      }
    }

    if (preserveAccount) {
      showVerificationPanel();
      try {
        await sendEmailVerification(newUser);
        showFeedback("La cuenta se creó correctamente. Te enviamos el correo de verificación; si no lo recibís, podés reenviarlo desde esta pantalla.", "success");
      } catch (mailError) {
        console.error("No se pudo enviar la verificación tras recuperar el registro:", mailError);
        showFeedback("La cuenta se creó correctamente, pero no pudimos enviar el correo. Tocá «Reenviar correo» para intentar otra vez.", "error");
      }
      return;
    }

    if (profileCheckFailed) {
      await signOut(auth).catch(() => {});
      showSignedOut("No pudimos confirmar si tu cuenta se creó. No uses otro código ni vuelvas a registrarte todavía; intentá ingresar con el mismo correo más tarde o consultá al personal.", "error");
      return;
    }

    const message = error.code === "auth/email-already-in-use"
        ? "Ese correo ya tiene una cuenta. Probá ingresar."
        : error.code === "auth/invalid-email"
          ? "Ingresá una dirección de correo válida."
          : error.code === "auth/weak-password"
            ? "Elegí una contraseña más segura, de al menos 8 caracteres."
            : error.message === "ENROLLMENT_CODE_INVALID" || error.code === "permission-denied"
              ? "El código no existe, ya fue utilizado o no está habilitado. Pedí uno al personal del buffet."
              : "No se pudo crear la cuenta. Revisá los datos e intentá nuevamente.";
    showAuthMode("register");
    showFeedback(message, "error");
  } finally {
    authOperationInProgress = false;
    submit.disabled = false;
  }
});

$("#student-forgot-password").addEventListener("click", async () => {
  const email = $("#student-login-email").value.trim();
  if (!email) {
    showFeedback("Primero escribí tu correo electrónico.", "error");
    $("#student-login-email").focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showFeedback("Si el correo está registrado, recibirás instrucciones para recuperar la contraseña.", "success");
  } catch (error) {
    console.error("No se pudo solicitar el restablecimiento:", error);
    showFeedback("No se pudo enviar el correo de recuperación. Revisá la dirección.", "error");
  }
});

$("#student-resend-verification").addEventListener("click", async () => {
  if (!auth.currentUser) return;
  try {
    await sendEmailVerification(auth.currentUser);
    showFeedback("Correo de verificación reenviado. Revisá tu bandeja de entrada.", "success");
  } catch (error) {
    console.error(error);
    showFeedback("No pudimos reenviar el correo. Esperá un momento e intentá nuevamente.", "error");
  }
});

$("#student-refresh-verification").addEventListener("click", async () => {
  if (!auth.currentUser) return;
  try {
    await reload(auth.currentUser);
    await loadStudentSession(auth.currentUser);
  } catch (error) {
    console.error(error);
    showFeedback("Todavía no pudimos confirmar tu correo. Abrí el enlace recibido e intentá otra vez.", "error");
  }
});

$("#student-verify-logout").addEventListener("click", () => signOut(auth));

$("#student-logout").addEventListener("click", async () => {
  await signOut(auth);
  showSignedOut("Sesión cerrada correctamente.", "success");
});

function clearPreviewUrl() {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
}

function showProfilePhoto(data) {
  const initials = $("#student-profile-initials");
  const image = $("#student-profile-image");
  initials.textContent = initialsFor(activeProfile?.displayName);
  if (data) {
    image.src = data;
    image.hidden = false;
    initials.hidden = true;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    initials.hidden = false;
  }
}

function openProfile() {
  if (!activeProfile || !auth.currentUser) return;
  $("#student-profile-name").value = activeProfile.displayName;
  $("#student-profile-course").value = activeProfile.course;
  $("#student-profile-division").value = activeProfile.division;
  selectedPhotoFile = null;
  removeCurrentPhoto = false;
  $("#student-photo-file").value = "";
  $("#student-profile-feedback").textContent = "";
  $("#student-remove-photo").hidden = !activePhotoData;
  showProfilePhoto(activePhotoData);
  profileDialog.showModal();
}

$("#student-profile-open").addEventListener("click", openProfile);
$("#student-profile-close").addEventListener("click", () => profileDialog.close());
$("#student-profile-cancel").addEventListener("click", () => profileDialog.close());

$("#student-photo-file").addEventListener("change", () => {
  const file = $("#student-photo-file").files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    $("#student-profile-feedback").textContent = "Elegí un archivo de imagen válido.";
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    $("#student-profile-feedback").textContent = "La imagen original debe pesar menos de 12 MB.";
    return;
  }
  selectedPhotoFile = file;
  removeCurrentPhoto = false;
  clearPreviewUrl();
  previewObjectUrl = URL.createObjectURL(file);
  $("#student-profile-image").src = previewObjectUrl;
  $("#student-profile-image").hidden = false;
  $("#student-profile-initials").hidden = true;
  $("#student-remove-photo").hidden = false;
  $("#student-profile-feedback").textContent = "Vista previa lista. Se comprimirá al guardar.";
});

$("#student-remove-photo").addEventListener("click", () => {
  selectedPhotoFile = null;
  removeCurrentPhoto = true;
  $("#student-photo-file").value = "";
  clearPreviewUrl();
  showProfilePhoto("");
  $("#student-remove-photo").hidden = true;
  $("#student-profile-feedback").textContent = "La foto se quitará al guardar los cambios.";
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No pudimos procesar la imagen."));
    reader.readAsDataURL(blob);
  });
}

async function compressProfilePhoto(file) {
  let bitmap = null;
  let fallbackUrl = null;
  try {
    if ("createImageBitmap" in window) {
      bitmap = await createImageBitmap(file);
    } else {
      // Compatibilidad con navegadores que todavía no implementan createImageBitmap.
      fallbackUrl = URL.createObjectURL(file);
      bitmap = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("No pudimos abrir esa imagen."));
        image.src = fallbackUrl;
      });
    }

    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    const side = Math.min(width, height);
    const sx = Math.floor((width - side) / 2);
    const sy = Math.floor((height - side) / 2);
    for (const size of [512, 448, 384, 320]) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("No pudimos preparar la imagen.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size, size);
      context.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
      for (const quality of [0.76, 0.66, 0.56, 0.46]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (!blob || blob.size > 108 * 1024) continue;
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl.length <= 150000) return dataUrl;
      }
    }
    throw new Error("La imagen no se pudo comprimir lo suficiente. Probá con otra foto.");
  } finally {
    if (bitmap && typeof bitmap.close === "function") bitmap.close();
    if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
  }
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!auth.currentUser || !activeProfile) return;
  const displayName = $("#student-profile-name").value.trim();
  if (displayName.length < 2 || displayName.length > 32) {
    $("#student-profile-feedback").textContent = "El nombre debe tener entre 2 y 32 caracteres.";
    return;
  }
  const saveButton = $("#student-profile-save");
  saveButton.disabled = true;
  $("#student-profile-feedback").textContent = "Guardando cambios…";
  try {
    const uid = auth.currentUser.uid;
    const userRef = doc(db, "users", uid);
    if (selectedPhotoFile || removeCurrentPhoto) {
      const batch = writeBatch(db);
      batch.update(userRef, { displayName, updatedAt: serverTimestamp() });
      const photoRef = doc(db, "profilePhotos", uid);
      let nextPhotoData = activePhotoData;
      if (selectedPhotoFile) {
        nextPhotoData = await compressProfilePhoto(selectedPhotoFile);
        batch.set(photoRef, { photoData: nextPhotoData, updatedAt: serverTimestamp() });
      } else if (removeCurrentPhoto) {
        nextPhotoData = "";
        batch.delete(photoRef);
      }
      await batch.commit();
      activePhotoData = nextPhotoData;
    } else {
      await updateDoc(userRef, { displayName, updatedAt: serverTimestamp() });
    }
    activeProfile.displayName = displayName;
    $("#student-display-name").textContent = displayName;
    setAvatar("#student-avatar-initials", "#student-avatar-image", activePhotoData);
    profileDialog.close();
    clearPreviewUrl();
  } catch (error) {
    console.error("No se pudo guardar el perfil:", error);
    $("#student-profile-feedback").textContent = error.message || "No se pudieron guardar los cambios.";
  } finally {
    saveButton.disabled = false;
  }
});

profileDialog.addEventListener("close", clearPreviewUrl);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    sessionLoadToken += 1;
    activeProfile = null;
    activePhotoData = "";
    profileDialog.open && profileDialog.close();
    showSignedOut();
    return;
  }
  loadStudentSession(user);
});

}
