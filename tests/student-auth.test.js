import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const auth = await readFile(new URL("../public/js/student-auth.js", import.meta.url), "utf8");
const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");

test("el catálogo permanece oculto hasta validar un alumno", () => {
  assert.match(html, /<main id="student-app" hidden>/);
  assert.match(auth, /currentUser\.emailVerified/);
  assert.match(auth, /profile\.role !== "student"/);
  assert.match(auth, /profile\.active !== true/);
});

test("el registro crea únicamente perfiles con rol de alumno", () => {
  assert.match(auth, /role: "student"/);
  assert.match(rules, /request\.resource\.data\.role == 'student'/);
  assert.match(rules, /request\.resource\.data\.active == true/);
});

test("el perfil de Firestore no duplica el correo de autenticación", () => {
  const userCreateRule = rules.slice(rules.indexOf("match /users/{uid}"), rules.indexOf("match /profilePhotos/{uid}"));
  assert.doesNotMatch(userCreateRule, /request\.resource\.data\.email/);
  assert.doesNotMatch(auth, /email: newUser\.email/);
});

test("el alumno solo puede cambiar su nombre para mostrar", () => {
  assert.match(rules, /hasOnly\(\['displayName', 'updatedAt'\]\)/);
});

test("las fotos se guardan aparte y quedan limitadas al propietario", () => {
  assert.match(html, /id="student-photo-file"/);
  assert.match(rules, /match \/profilePhotos\/\{uid\}/);
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(rules, /photoData\.size\(\) <= 150000/);
  assert.match(rules, /allow list: if false/);
});

test("los pedidos siguen bloqueados hasta implementar sus propias reglas", () => {
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write: if false/);
});


test("GitHub Pages muestra solo la demo y no carga autenticación", () => {
  const preview = auth.slice(0, auth.indexOf("} else {"));
  assert.match(preview, /location\.hostname\.endsWith\("\.github\.io"\)/);
  assert.match(preview, /Vista de demostración/);
  assert.doesNotMatch(preview, /signInWithEmailAndPassword|onAuthStateChanged|firebase\.js/);
});

test("GitHub Pages no inicializa Firebase desde la lógica de catálogo", async () => {
  const app = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /from ["']\.\/firebase\.js["']/);
});
