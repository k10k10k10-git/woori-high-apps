"use client";

import { useEffect, useRef, useState } from "react";
import { useUI } from "@/context/UIContext";

type Props = {
  id?: string;
  value: string | number | null | undefined;
  ariaLabel: string;
  onSave: (value: string) => Promise<void>;
  errorMessage: string;
  className?: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "search" | "email" | "url";
  type?: "text" | "time";
  rows?: number;
  multiline?: boolean;
  disabled?: boolean;
  allowEmpty?: boolean;
  normalize?: (value: string) => string;
};

/**
 * RTDB 구독값과 로컬 입력을 안전하게 연결하는 행 단위 자동 저장 필드.
 * 편집 중 서버 값이 바뀌면 로컬 값을 자동 저장하지 않고 최신 서버 값을 우선해
 * 다른 사용자의 변경을 과거 값으로 덮어쓰지 않는다.
 */
export default function ProgramAutosaveField({
  id,
  value,
  ariaLabel,
  onSave,
  errorMessage,
  className = "",
  placeholder,
  maxLength,
  inputMode,
  type = "text",
  rows = 3,
  multiline = false,
  disabled = false,
  allowEmpty = true,
  normalize = (next) => next,
}: Props) {
  const { toast } = useUI();
  const remoteValue = value == null ? "" : String(value);
  const remoteRef = useRef(remoteValue);
  const focusedRef = useRef(false);
  const [draft, setDraft] = useState(remoteValue);
  const [remoteConflict, setRemoteConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
  }, []);

  useEffect(() => {
    if (remoteValue === remoteRef.current) return;
    remoteRef.current = remoteValue;
    if (focusedRef.current && draft !== remoteValue) {
      setRemoteConflict(true);
      return;
    }
    setDraft(remoteValue);
    setRemoteConflict(false);
  }, [draft, remoteValue]);

  async function commit() {
    focusedRef.current = false;
    if (remoteConflict) {
      setDraft(remoteRef.current);
      setRemoteConflict(false);
      toast(`${ariaLabel}: 다른 사람이 수정한 최신 값을 반영했습니다. 필요한 경우 다시 입력해 주세요.`, "warning");
      return;
    }

    const next = normalize(draft);
    if (!allowEmpty && !next.trim()) {
      setDraft(remoteRef.current);
      toast(`${ariaLabel}은(는) 비워 둘 수 없습니다.`, "warning");
      return;
    }
    if (next === remoteRef.current) {
      if (next !== draft) setDraft(next);
      return;
    }

    setDraft(next);
    setSaving(true);
    setSaveState("saving");
    try {
      await onSave(next);
      remoteRef.current = next;
      setSaveState("saved");
      if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
      stateTimerRef.current = setTimeout(() => setSaveState("idle"), 2200);
    } catch (error) {
      setSaveState("error");
      toast(error instanceof Error ? error.message : errorMessage, "error");
    } finally {
      setSaving(false);
    }
  }

  const shared = {
    id,
    className: `input program-autosave-field ${className}`.trim(),
    value: draft,
    placeholder,
    maxLength,
    disabled: disabled || saving,
    "aria-label": ariaLabel,
    "aria-busy": saving || undefined,
    "aria-invalid": remoteConflict || undefined,
    "data-conflict": remoteConflict ? "true" : undefined,
    onFocus: () => { focusedRef.current = true; },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
    onBlur: () => void commit(),
  };

  const stateLabel = saveState === "saving" ? "저장 중" : saveState === "saved" ? "저장됨" : saveState === "error" ? "저장 실패" : "";
  return (
    <span className="program-autosave-control" data-save-state={saveState}>
      {multiline ? <textarea {...shared} rows={rows} /> : <input {...shared} type={type} inputMode={inputMode} />}
      {stateLabel && <small className="program-autosave-state" aria-live="polite">{stateLabel}</small>}
    </span>
  );
}
