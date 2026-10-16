/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useSaveFeedback } from "./useSaveFeedback";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it("병렬 저장이 모두 끝날 때까지 기다리고 다른 요청의 성공이 실패를 숨기지 않는다", async () => {
  const { result } = renderHook(() => useSaveFeedback("term/team"));
  const first = deferred(); const second = deferred();
  let firstRun!: Promise<void>; let secondRun!: Promise<void>;
  act(() => { firstRun = result.current.run("first", () => first.promise).catch(() => {}); secondRun = result.current.run("second", () => second.promise); });
  expect(result.current.state).toBe("saving");
  await act(async () => { first.reject(new Error("합성 오류")); await firstRun; });
  expect(result.current.state).toBe("saving");
  await act(async () => { second.resolve(); await secondRun; });
  expect(result.current.state).toBe("error");
  await act(async () => { await result.current.run("first", async () => {}); });
  expect(result.current.state).toBe("saved");
});

it("다른 대상에 도착한 이전 저장 응답은 현재 상태에 섞이지 않는다", async () => {
  const { result, rerender } = renderHook(({ scope }) => useSaveFeedback(scope), { initialProps: { scope: "first" } });
  const pending = deferred(); let run!: Promise<void>;
  act(() => { run = result.current.run("goal", () => pending.promise); });
  rerender({ scope: "second" });
  expect(result.current.state).toBe("idle");
  await act(async () => { pending.resolve(); await run; });
  expect(result.current.state).toBe("idle");
});

it("저장 도중의 새 입력은 미저장으로 남기고 변경을 취소한 필드는 초기 상태로 돌린다", async () => {
  const { result } = renderHook(() => useSaveFeedback("term/team"));
  const pending = deferred(); let run!: Promise<void>;
  act(() => { run = result.current.run("plan", () => pending.promise); });
  act(() => result.current.markDirty("plan"));
  await act(async () => { pending.resolve(); await run; });
  expect(result.current.stateFor("plan")).toBe("dirty");
  act(() => result.current.reset("plan"));
  expect(result.current.stateFor("plan")).toBe("idle");
});
