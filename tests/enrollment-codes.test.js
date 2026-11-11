import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  formatEnrollmentCode,
  generateEnrollmentCode,
  hashEnrollmentCode,
  normalizeEnrollmentCode
} from "../public/js/enrollment-codes.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

test("genera códigos aleatorios de 80 bits con formato legible", () => {
  const code = generateEnrollmentCode();
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.equal(normalizeEnrollmentCode(code).length, 16);
});

test("normaliza minúsculas, espacios y guiones", () => {
  assert.equal(
    normalizeEnrollmentCode(" abcd-efgh-jkmn-pqrs "),
    "ABCDEFGHJKMNPQRS"
  );
});

test("rechaza códigos incompletos y caracteres ambiguos", () => {
  assert.throws(() => normalizeEnrollmentCode("ABC-123"), TypeError);
  assert.throws(() => normalizeEnrollmentCode("ABCD-EFGH-IJKL-MNOP"), TypeError);
});

test("formatea y calcula un hash SHA-256 estable sin almacenar el código original", async () => {
  const first = await hashEnrollmentCode("ABCD-EFGH-JKMN-PQRS");
  const second = await hashEnrollmentCode("abcd-efgh-jkmn-pqrs");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, await hashEnrollmentCode("ABCD-EFGH-JKMN-PQRT"));
  assert.equal(formatEnrollmentCode("abcd-efgh-jkmn-pqrs"), "ABCD-EFGH-JKMN-PQRS");
});
