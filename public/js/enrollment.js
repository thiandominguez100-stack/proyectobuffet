const ENROLLMENT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ENROLLMENT_CODE_LENGTH = 16;
const ENROLLMENT_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{16}$/;
const MAX_ENROLLMENT_BATCH_SIZE = 300;

export function normalizeEnrollmentCode(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

export function isValidEnrollmentCode(value) {
  return ENROLLMENT_CODE_PATTERN.test(normalizeEnrollmentCode(value));
}

export function generateEnrollmentCode(cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== "function") {
    throw new Error("Este navegador no permite generar códigos seguros.");
  }
  const bytes = new Uint8Array(ENROLLMENT_CODE_LENGTH);
  cryptoProvider.getRandomValues(bytes);
  return Array.from(bytes, (value) => ENROLLMENT_ALPHABET[value & 31]).join("");
}

export function generateEnrollmentCodes(count, cryptoProvider = globalThis.crypto) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_ENROLLMENT_BATCH_SIZE) {
    throw new RangeError("La cantidad debe estar entre 1 y 300 códigos.");
  }

  const codes = new Set();
  const maxAttempts = count * 10;
  for (let attempt = 0; attempt < maxAttempts && codes.size < count; attempt += 1) {
    codes.add(generateEnrollmentCode(cryptoProvider));
  }

  if (codes.size !== count) {
    throw new Error("No se pudieron generar códigos únicos. Volvé a intentarlo.");
  }
  return [...codes];
}

export { ENROLLMENT_CODE_LENGTH, MAX_ENROLLMENT_BATCH_SIZE };
