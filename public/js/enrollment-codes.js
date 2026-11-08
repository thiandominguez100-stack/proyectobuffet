const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RANDOM_BYTE_COUNT = 10;
const CODE_CHARACTER_COUNT = 16;

export function normalizeEnrollmentCode(value) {
  const normalized = String(value ?? "")
    .toUpperCase()
    .replace(/[\\s-]/g, "");

  if (
    normalized.length !== CODE_CHARACTER_COUNT ||
    [...normalized].some((character) => !CODE_ALPHABET.includes(character))
  ) {
    throw new TypeError("El código de inscripción no tiene un formato válido.");
  }

  return normalized;
}

export function formatEnrollmentCode(value) {
  const normalized = normalizeEnrollmentCode(value);
  return normalized.match(/.{4}/g).join("-");
}

export function generateEnrollmentCode() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Este navegador no permite generar códigos seguros.");
  }

  const bytes = new Uint8Array(RANDOM_BYTE_COUNT);
  globalThis.crypto.getRandomValues(bytes);

  let buffer = 0;
  let bitsAvailable = 0;
  let code = "";

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsAvailable += 8;

    while (bitsAvailable >= 5) {
      bitsAvailable -= 5;
      code += CODE_ALPHABET[(buffer >> bitsAvailable) & 31];
    }
  }

  return formatEnrollmentCode(code);
}

export async function hashEnrollmentCode(value) {
  const normalized = normalizeEnrollmentCode(value);
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    throw new Error("Este navegador no permite validar códigos seguros.");
  }

  const bytes = new TextEncoder().encode(normalized);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
