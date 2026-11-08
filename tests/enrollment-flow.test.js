import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, auth, rules, staffPage, staff] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/js/student-auth.js", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  readFile(new URL("../public/personal.html", import.meta.url), "utf8"),
  readFile(new URL("../public/js/staff.js", import.meta.url), "utf8")
]);

test("el formulario solicita un código de inscripción obligatorio y no permite autodeclarar curso y división", () => {
  assert.match(page, /id="student-register-code"[^>]*required/);
  assert.doesNotMatch(page, /id="student-register-course"/);
  assert.doesNotMatch(page, /id="student-register-division"/);
  assert.match(page, /curso y división se asignarán automáticamente/i);
});

test("el cliente canjea el código y crea el perfil en una sola transacción", () => {
  assert.match(auth, /runTransaction\(db, async \(transaction\)/);
  assert.match(auth, /transaction\.update\(enrollmentCodeRef/);
  assert.match(auth, /transaction\.set\(userProfileRef/);
  assert.match(auth, /enrollmentCodeHash/);
});

test("las reglas vinculan el perfil nuevo a un código disponible y lo marcan como usado atómicamente", () => {
  assert.match(rules, /profileHasValidEnrollmentCode/);
  assert.match(rules, /codeRedemptionMatchesProfile/);
  assert.match(rules, /getAfter\(codePath\)\.data\.status == 'redeemed'/);
  assert.match(rules, /getAfter\(codePath\)\.data\.redeemedBy == uid/);
  assert.match(rules, /match \/enrollmentCodes\/\{codeHash\}/);
  assert.match(rules, /allow list: if isAdmin\(\);/);
  assert.match(rules, /allow delete: if false;/);
});

test("solo el panel de administración muestra la emisión de códigos", () => {
  assert.match(staffPage, /id="staff-enrollment-admin" hidden/);
  assert.match(staff, /currentAuthorizedRole !== "admin"/);
  assert.match(staff, /writeBatch\(db\)/);
  assert.match(staff, /enrollmentRevokeButton/);
  assert.match(staffPage, /id="staff-enrollment-revoke"/);
});
