export interface PasswordVerifier {
  version: 1;
  salt: string;
  hash: string;
}

export function isPasswordVerifier(value: unknown): value is PasswordVerifier {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<PasswordVerifier>;
  return record.version === 1
    && typeof record.salt === "string" && /^[a-f0-9]{32}$/.test(record.salt)
    && typeof record.hash === "string" && /^[a-f0-9]{64}$/.test(record.hash);
}

export async function createVerifier(password: string): Promise<PasswordVerifier> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { version: 1, salt, hash: toHex(await derive(password, salt)) };
}

export async function verifyPassword(password: string, verifier: PasswordVerifier): Promise<boolean> {
  const actual = await derive(password, verifier.salt);
  const expected = fromHex(verifier.hash);
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected[index] ^ actual[index];
  }
  return difference === 0;
}

async function derive(password: string, salt: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(salt), iterations: 600_000 }, key, 256,
  );
  return new Uint8Array(bits);
}

function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
