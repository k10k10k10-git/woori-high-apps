import { describe, expect, it } from "vitest";
import {
  deriveRetreatPinHash,
  hasRetreatSessionUnlock,
  isValidRetreatPin,
  rememberRetreatSessionUnlock,
  retreatUnlockStorageKey,
  verifyRetreatPin,
} from "@/lib/accessLock";
import type { IguardAccessLock } from "@/lib/types";

async function lockFor(pin: string, salt = "fixed-salt"): Promise<IguardAccessLock> {
  const iterations = 1_000;
  return {
    enabled: true,
    version: 1,
    algorithm: "PBKDF2-SHA256",
    iterations,
    salt,
    pinHash: await deriveRetreatPinHash(pin, salt, iterations),
    updatedAt: 1,
  };
}

describe("수련회별 PIN 잠금", () => {
  it("4~8자리 숫자만 PIN으로 허용한다", () => {
    expect(isValidRetreatPin("1234")).toBe(true);
    expect(isValidRetreatPin("12345678")).toBe(true);
    expect(isValidRetreatPin("123")).toBe(false);
    expect(isValidRetreatPin("123456789")).toBe(false);
    expect(isValidRetreatPin("12a4")).toBe(false);
  });

  it("같은 PIN만 PBKDF2 해시 검증을 통과한다", async () => {
    const lock = await lockFor("2580");
    await expect(verifyRetreatPin("2580", lock)).resolves.toBe(true);
    await expect(verifyRetreatPin("0000", lock)).resolves.toBe(false);
  });

  it("PIN이나 salt가 달라지면 해시도 달라진다", async () => {
    const a = await deriveRetreatPinHash("2580", "salt-a", 1_000);
    const b = await deriveRetreatPinHash("2580", "salt-b", 1_000);
    const c = await deriveRetreatPinHash("2581", "salt-a", 1_000);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("현재 PIN 해시에 대해서만 세션 잠금 해제를 기억한다", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const oldLock = await lockFor("2580", "old-salt");
    const newLock = await lockFor("2580", "new-salt");

    rememberRetreatSessionUnlock("retreat-1", oldLock, storage);
    expect(hasRetreatSessionUnlock("retreat-1", oldLock, storage)).toBe(true);
    expect(hasRetreatSessionUnlock("retreat-1", newLock, storage)).toBe(false);
    expect(retreatUnlockStorageKey("retreat-1", oldLock)).not.toBe(retreatUnlockStorageKey("retreat-1", newLock));
  });
});
