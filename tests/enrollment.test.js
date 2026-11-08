import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ENROLLMENT_CODE_LENGTH,
  generateEnrollmentCode,
  isValidEnrollmentCode,
  normalizeEnrollmentCode
} from "../public/js/enrollment.js";

const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const auth = await readFile(new URL("../public/js/student-auth.js", import.meta.url), "utf8");
const staff = await readFile(new URL("../public/js/staff.js", import.meta.url), "utf8");
const staffHtml = await readFile(new URL("../public/personal.html", import.meta.url), "utf8");

test("los códigos de inscripción se normalizan sin espacios y en mayúsculas", () => {
  assert.equal(normalizeEnrollmentCode(" abcd efgh jkmn pqrs "), "ABCDEFGHJKMNPQRS");
  assert.equal(isValidEnrollmentCode("abcd efgh jkmn pqrs"), true);
});

test("los códigos válidos tienen 16 caracteres y excluyen caracteres ambiguos", () => {
  assert.equal(ENROLLMENT_CODE_LENGTH, 16);
  assert.equal(isValidEnrollmentCode("ABCDEFGHJKLMNPQR"), true);
  assert.equal(isValidEnrollmentCode("ABCDEFGHJKLMNPQ0"), false);
  assert.equal(isValidEnrollmentCode("ABCDEFGHJKLMNPQ1"), false);
  assert.equal(isValidEnrollmentCode("ABCDEFGHJKLMNPQI"), false);
  assert.equal(isValidEnrollmentCode("ABCDEFGHJKLMNPQO"), false);
  assert.equal(isValidEnrollmentCode("ABCDEFGHJKLMNPQ"), false);
});

test("la generación usa crypto.getRandomValues y nunca Math.random", () => {
  const fakeCrypto = {
    getRandomValues(bytes) {
      bytes.fill(31);
      return bytes;
    }
  };
  const code = generateEnrollmentCode(fakeCrypto);
  assert.equal(code, "9999999999999999");
  assert.equal(code.length, ENROLLMENT_CODE_LENGTH);
  assert.equal(isValidEnrollmentCode(code), true);
  assert.throws(() => generateEnrollmentCode(null), /códigos seguros/);
});

test("el registro consume el código y crea el perfil en una sola transacción", () => {
  assert.match(auth, /runTransaction\(db/);
  assert.match(auth, /transaction\.get\(codeRef\)/);
  assert.match(auth, /transaction\.set\(userRef/);
  assert.match(auth, /transaction\.update\(codeRef/);
  assert.match(auth, /registrationCodeId: registrationCode/);
});

test("Firestore solo permite emitir códigos a administración y no permite enumerarlos como alumno", () => {
  const section = rules.slice(rules.indexOf("match /enrollmentCodes/{codeId}"), rules.indexOf("match /users/{uid}"));
  assert.match(section, /allow create: if isAdmin\(\)/);
  assert.match(section, /allow list: if isAdmin\(\)/);
  assert.match(section, /resource\.data\.status == 'available'/);
  assert.match(section, /request\.resource\.data\.status == 'used'/);
  assert.match(section, /getAfter\(\/databases\/\$\(database\)\/documents\/users\/\$\(request\.auth\.uid\)\)/);
});

test("un perfil no puede crearse sin que el código quede consumido en la misma operación", () => {
  const users = rules.slice(rules.indexOf("match /users/{uid}"), rules.indexOf("match /profilePhotos/{uid}"));
  assert.match(users, /registrationCodeId/);
  assert.match(users, /existsAfter\(\/databases\/\$\(database\)\/documents\/enrollmentCodes/);
  assert.match(users, /getAfter\(\/databases\/\$\(database\)\/documents\/enrollmentCodes/);
});

test("el panel muestra herramientas de inscripción solo a administración", () => {
  assert.match(staff, /currentAuthorizedRole !== "admin"/);
  assert.match(staff, /startEnrollmentCodeManager\(user\)/);
  assert.match(staffHtml, /id="staff-enrollment-tools" hidden/);
  assert.match(staffHtml, /id="staff-enrollment-create"/);
});

test("personal operativo no puede enumerar perfiles ni contadores privados", () => {
  const users = rules.slice(rules.indexOf("match /users/{uid}"), rules.indexOf("match /profilePhotos/{uid}"));
  const totals = rules.slice(rules.indexOf("match /dailyOrderTotals/{totalId}"), rules.indexOf("Todas las colecciones no definidas"));
  assert.match(users, /allow list: if isAdmin\(\)/);
  assert.match(totals, /allow list: if signedIn\(\) && resource\.data\.uid == request\.auth\.uid/);
  assert.doesNotMatch(totals, /allow list: if isStaff/);
});
