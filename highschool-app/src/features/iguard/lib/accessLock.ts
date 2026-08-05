import type { IguardAccessLock } from "./types";

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;
export const PIN_HASH_ITERATIONS = 120_000;

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isValidRetreatPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function createPinSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function deriveRetreatPinHash(pin: string, salt: string, iterations = PIN_HASH_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function createRetreatAccessLock(pin: string, updatedBy?: string): Promise<IguardAccessLock> {
  if (!isValidRetreatPin(pin)) {
    throw new Error(`PIN은 ${PIN_MIN_LENGTH}~${PIN_MAX_LENGTH}자리 숫자여야 합니다.`);
  }
  const salt = createPinSalt();
  return {
    enabled: true,
    version: 1,
    algorithm: "PBKDF2-SHA256",
    iterations: PIN_HASH_ITERATIONS,
    salt,
    pinHash: await deriveRetreatPinHash(pin, salt),
    updatedAt: Date.now(),
    updatedBy: updatedBy?.trim() || undefined,
  };
}

export async function verifyRetreatPin(pin: string, lock: IguardAccessLock): Promise<boolean> {
  if (!isValidRetreatPin(pin) || lock.algorithm !== "PBKDF2-SHA256" || lock.iterations < 1) return false;
  const actual = await deriveRetreatPinHash(pin, lock.salt, lock.iterations);
  if (actual.length !== lock.pinHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i += 1) mismatch |= actual.charCodeAt(i) ^ lock.pinHash.charCodeAt(i);
  return mismatch === 0;
}

export function retreatUnlockStorageKey(retreatId: string, lock: IguardAccessLock): string {
  return `iguard:retreat-unlock:v1:${encodeURIComponent(retreatId)}:${lock.pinHash.slice(0, 24)}`;
}

export function hasRetreatSessionUnlock(retreatId: string, lock: IguardAccessLock, storage: SessionStorageLike): boolean {
  return storage.getItem(retreatUnlockStorageKey(retreatId, lock)) === "ok";
}

export function rememberRetreatSessionUnlock(retreatId: string, lock: IguardAccessLock, storage: SessionStorageLike): void {
  storage.setItem(retreatUnlockStorageKey(retreatId, lock), "ok");
}
