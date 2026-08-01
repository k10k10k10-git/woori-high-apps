import { describe, expect, it } from "vitest";

/**
 * useSubmitLock의 잠금 규칙을 훅 렌더 없이 고정한다.
 * (jsdom·testing-library를 새로 추가하지 않기 위해 잠금 본체와 같은 알고리즘을 검증한다.
 *  ⚠ 훅 구현을 바꿀 때 이 파일의 시나리오도 함께 유지할 것.)
 */
function makeLock() {
  let locked = false;
  return async function run(task: () => Promise<void> | void) {
    if (locked) return "skipped" as const;
    locked = true;
    try {
      await task();
      return "ran" as const;
    } finally {
      locked = false;
    }
  };
}

describe("useSubmitLock — 이중 제출 방지", () => {
  it("진행 중이면 두 번째 호출을 통째로 건너뛴다", async () => {
    const run = makeLock();
    let calls = 0;
    let release: () => void = () => {};
    const slow = () => new Promise<void>(res => { release = res; }).then(() => { calls++; });

    const first = run(slow);
    const second = await run(slow); // 첫 저장이 끝나기 전 연타

    expect(second).toBe("skipped");
    release();
    await first;
    expect(calls).toBe(1);
  });

  it("완료 후에는 다시 실행할 수 있다", async () => {
    const run = makeLock();
    let calls = 0;
    const task = async () => { calls++; };

    expect(await run(task)).toBe("ran");
    expect(await run(task)).toBe("ran");
    expect(calls).toBe(2);
  });

  it("작업이 예외를 던져도 잠금이 풀린다", async () => {
    const run = makeLock();
    await expect(run(async () => { throw new Error("실패"); })).rejects.toThrow("실패");

    let ran = false;
    expect(await run(async () => { ran = true; })).toBe("ran");
    expect(ran).toBe(true);
  });
});
