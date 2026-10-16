import type { SaveFeedbackState } from "@/features/semester/useSaveFeedback";

export default function SaveFeedback({ state, idleLabel, dirtyLabel = "미저장 · 입력 칸을 벗어나면 자동 저장", errorLabel = "저장 실패 · 다시 시도해 주세요" }: { state: SaveFeedbackState; idleLabel: string; dirtyLabel?: string; errorLabel?: string }) {
  const label = state === "saving" ? "저장 중…" : state === "saved" ? "저장 완료"
    : state === "error" ? errorLabel : state === "dirty" ? dirtyLabel : idleLabel;
  return <p className={`save-feedback save-feedback--${state}`} role="status" aria-live="polite" aria-atomic="true">{label}</p>;
}
