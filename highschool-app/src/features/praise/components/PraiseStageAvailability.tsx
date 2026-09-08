"use client";
import { praiseMeetingWriteLocked, type PraiseMeetingProps } from "./shared";
/** 등단 편성에서 회차를 벗어나지 않고 스탭 참석 조건을 확인한다. 클릭한 항목만 저장한다. */
export function PraiseStageAvailability({
  view,
  meeting,
  busy,
  execute,
}: PraiseMeetingProps) {
  if (!meeting) return null;
  const editable =
    view.permissions.stageEdit &&
    !praiseMeetingWriteLocked(view, meeting) &&
    !busy;
  return (
    <details className="praise-disclosure">
      <summary>주일 스탭 참석과 역할</summary>
      <p className="praise-note">
        {meeting.worshipDate} 참석 여부를 기록한 뒤 자동 편성하세요. 참석을
        수정하면 기존 초안은 다시 생성해야 합니다.
      </p>
      <div className="praise-attendance-list">
        {view.people
          .filter((p) => p.kind === "STAFF" && p.active)
          .map((p) => {
            const row = view.availability[meeting.id]?.[p.id];
            const save = (
              present: boolean | null,
              role: "SINGER" | "SESSION",
            ) =>
              execute({
                type: "availability.set",
                meetingId: meeting.id,
                personId: p.id,
                present,
                role,
                expectedRevision: row?.revision ?? 0,
              });
            const role = row?.role ?? (p.singerCapable ? "SINGER" : "SESSION");
            return (
              <div className="praise-attendance-row" key={p.id}>
                <strong>{p.name}</strong>
                <div className="praise-row-actions">
                  <div
                    className="praise-status-buttons"
                    role="group"
                    aria-label={`${p.name} 주일 참석`}
                  >
                    <button
                      type="button"
                      disabled={!editable || row?.present === true}
                      aria-pressed={row?.present === true}
                      onClick={() => void save(true, role)}
                    >
                      참석
                    </button>
                    <button
                      type="button"
                      disabled={!editable || row?.present === false}
                      aria-pressed={row?.present === false}
                      onClick={() => void save(false, role)}
                    >
                      불참
                    </button>
                    <button
                      type="button"
                      disabled={!editable || row?.present == null}
                      onClick={() => void save(null, role)}
                    >
                      미입력
                    </button>
                  </div>
                  <label className="praise-field">
                    <span className="sr-only">{p.name} 주일 역할</span>
                    <select
                      disabled={!editable || !row}
                      value={role}
                      onChange={(e) =>
                        void save(
                          row?.present ?? null,
                          e.target.value as "SINGER" | "SESSION",
                        )
                      }
                    >
                      <option value="SINGER">싱어</option>
                      <option value="SESSION">세션</option>
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
      </div>
    </details>
  );
}
