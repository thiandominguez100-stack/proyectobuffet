const ENROLLMENT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ENROLLMENT_CODE_LENGTH = 16;
const ENROLLMENT_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{16}$/;

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

export { ENROLLMENT_CODE_LENGTH };
