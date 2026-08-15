"use client";

import { useCallback, useEffect, useState } from "react";
import { escapeHtml, printAsPDF } from "@/lib/exportUtils";
import { useLoadErrors } from "@/lib/useLoadErrors";
import { saveDutyPlan, subscribeToDutyPlans } from "./db";
import { MAX_DUTY_NAMES, MAX_DUTY_ROWS, dutyKey, type DutyPlans, type DutyRow } from "./worshipContent";
import { previousSunday, sundayOf, type WorshipService } from "./worshipSeating";

const SERVICES: WorshipService[] = ["1", "2"];
const DEFAULT_ROWS: DutyRow[] = [{ label: "헌금위원", names: ["", ""] }, { label: "안내", names: ["", ""] }];

export default function WorshipDutyTab({ canEdit }: { canEdit: boolean }) {
  const [week, setWeek] = useState(() => sundayOf(new Date()));
  const [service, setService] = useState<WorshipService>("1");
  const [plans, setPlans] = useState<DutyPlans>({});
  const [draft, setDraft] = useState<DutyRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { fail, ok, message: loadError } = useLoadErrors(`duty|${week}|${service}`);

  useEffect(() => {
    const unsubscribe = subscribeToDutyPlans((value) => { setPlans(value); ok("예배 담당표"); }, fail("예배 담당표"));
    return () => unsubscribe();
  }, [fail, ok]);

  const saved = plans[dutyKey(week, service)];
  const rows = draft ?? saved ?? DEFAULT_ROWS;
  const dirty = draft !== null;

  const edit = useCallback((next: DutyRow[]) => { setDraft(next); setNotice(null); }, []);
  const patchRow = (index: number, patch: (row: DutyRow) => DutyRow) =>
    edit(rows.map((row, i) => (i === index ? patch(row) : row)));

  const loadPreviousWeek = () => {
    const previous = plans[dutyKey(previousSunday(week), service)];
    if (!previous) { setNotice("지난주 담당표가 없습니다."); return; }
    setDraft(previous.map((row) => ({ ...row, names: [...row.names] })));
    setNotice("지난주 담당표를 불러왔습니다. 저장해야 반영됩니다.");
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setActionError(null);
    try {
      await saveDutyPlan(week, service, draft.filter((row) => row.label.trim()));
      setDraft(null);
      setNotice("저장했습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const print = () => {
    const html = `<h1>${escapeHtml(`주일 예배 담당표 ${week} ${service}부`)}</h1>
      <table><thead><tr><th>역할</th><th>담당</th></tr></thead>
      <tbody>${rows.map((row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.names.filter((name) => name.trim()).join(", "))}</td></tr>`).join("")}</tbody></table>`;
    if (!printAsPDF(html, `주일예배담당표_${week}_${service}부`, false)) {
      setActionError("인쇄 창이 차단됐습니다. 브라우저의 팝업 차단을 해제해주세요.");
    }
  };

  return (
    <section className="card card-body">
      {loadError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 로드 오류: {loadError}</div>}
      {actionError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" aria-live="polite">{notice}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="duty-week" className="mb-1 block text-xs font-semibold text-slate-500">주일</label>
          <div className="w-40"><input id="duty-week" type="date" className="input" value={week}
            onChange={(event) => { if (!event.target.value) return; setWeek(sundayOf(new Date(`${event.target.value}T12:00:00Z`))); setDraft(null); }} /></div>
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold text-slate-500">예배</span>
          <div className="flex gap-1" role="group" aria-label="예배 부 선택">
            {SERVICES.map((value) => (
              <button key={value} type="button" onClick={() => { setService(value); setDraft(null); }}
                aria-pressed={service === value} className={service === value ? "btn-primary" : "btn-secondary"}>{value}부</button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={loadPreviousWeek} disabled={!canEdit}>지난주 불러오기</button>
          <button type="button" className="btn-secondary" onClick={print}>PDF 인쇄</button>
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={!canEdit || !dirty || saving}>
            {saving ? "저장 중…" : dirty ? "저장" : "저장됨"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        역할 이름과 담당자를 직접 적습니다. 학생 명단을 불러오지 않으므로 여기 적은 이름만 저장됩니다.
        {dirty && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">저장하지 않은 변경</span>}
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="w-40 shrink-0">
                <input aria-label={`${rowIndex + 1}번째 역할 이름`} className="input text-sm" placeholder="역할 이름"
                  disabled={!canEdit} value={row.label}
                  onChange={(event) => patchRow(rowIndex, (r) => ({ ...r, label: event.target.value }))} />
              </div>
              <span className="text-xs text-slate-400">담당 {row.names.filter((name) => name.trim()).length}명</span>
              <button type="button" aria-label={`${row.label || "역할"} 줄 빼기`} disabled={!canEdit}
                onClick={() => edit(rows.filter((_, i) => i !== rowIndex))}
                className="ml-auto rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">줄 삭제</button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {row.names.map((name, nameIndex) => (
                <div key={nameIndex} className="w-28">
                  <input aria-label={`${row.label || "역할"} ${nameIndex + 1}번째 담당자`} className="input text-sm"
                    placeholder="이름" disabled={!canEdit} value={name}
                    onChange={(event) => patchRow(rowIndex, (r) => ({
                      ...r, names: r.names.map((value, i) => (i === nameIndex ? event.target.value : value)),
                    }))} />
                </div>
              ))}
              {row.names.length < MAX_DUTY_NAMES && (
                <button type="button" className="btn-secondary text-xs" disabled={!canEdit}
                  onClick={() => patchRow(rowIndex, (r) => ({ ...r, names: [...r.names, ""] }))}>담당자 추가</button>
              )}
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">역할을 추가하세요.</p>
        )}
      </div>

      {rows.length < MAX_DUTY_ROWS && (
        <button type="button" className="btn-secondary mt-3" disabled={!canEdit}
          onClick={() => edit([...rows, { label: "", names: ["", ""] }])}>역할 추가</button>
      )}
    </section>
  );
}
