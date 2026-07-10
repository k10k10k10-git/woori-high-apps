"use client";

// 현장 접수 — 학생 원장(classes) 반 명단에서 학생을 탭해 신청 처리.
// 시트 전사를 대체하는 핵심 화면. classes는 읽기 전용.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { getClassesByYear, makeAppKey, upsertApplication, removeApplication, getApplicationPrivate } from "@/lib/db";
import { parseClassKey } from "@/lib/classKey";
import { Application, ClassInfo, Team } from "@/lib/types";

interface Props {
  sid: string;
  teams: Team[];
  applications: Application[];
}

interface StudentRow {
  studentId: string;
  name: string;
  bu: string;
  grade: number;
  classNum: number;
  jang?: boolean;
}

export default function IntakeTab({ sid, teams, applications }: Props) {
  const { user } = useAuth();
  const { toast, uiConfirm } = useUI();
  const year = sid.split("-")[0]; // "2026-1" → classes/2026
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedClassKey, setSelectedClassKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<StudentRow | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        setClasses(await getClassesByYear(year));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [year]);

  const appByKey = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);

  const sortedClasses = useMemo(
    () =>
      [...classes]
        .map((c) => ({ c, p: parseClassKey(c.classKey) }))
        .filter((x) => x.p !== null)
        .sort((a, b) =>
          a.p!.bu !== b.p!.bu
            ? a.p!.bu.localeCompare(b.p!.bu)
            : a.p!.grade !== b.p!.grade
              ? a.p!.grade - b.p!.grade
              : a.p!.classNum - b.p!.classNum,
        ),
    [classes],
  );

  const selected = sortedClasses.find((x) => x.c.classKey === selectedClassKey);

  function classAppCount(c: ClassInfo): number {
    const p = parseClassKey(c.classKey);
    if (!p) return 0;
    return Object.keys(c.students).filter((stuId) => appByKey.has(makeAppKey(p.bu, stuId))).length;
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 학생 명단 로드 오류: {loadError}
        </div>
      )}
      {loading && <p className="text-sm text-gray-400">학생 명단({year}) 불러오는 중…</p>}
      {!loading && !loadError && classes.length === 0 && (
        <p className="text-sm text-gray-400">classes/{year} 에 학생 명단이 없습니다. 학생 출석부 앱에서 먼저 명단을 동기화해주세요.</p>
      )}

      {/* 반 그리드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {sortedClasses.map(({ c, p }) => {
          const total = Object.keys(c.students).length;
          const count = classAppCount(c);
          return (
            <button
              key={c.classKey}
              onClick={() => setSelectedClassKey(c.classKey === selectedClassKey ? null : c.classKey)}
              className={`rounded-lg border p-2.5 text-left text-sm ${
                c.classKey === selectedClassKey
                  ? "border-blue-300 bg-blue-50"
                  : "border-gray-200 bg-white hover:border-blue-200"
              }`}
            >
              <div className="font-medium">
                {p!.bu} {p!.grade}학년 {p!.classNum}반
              </div>
              <div className={`text-xs mt-0.5 ${count > 0 ? "text-blue-600" : "text-gray-400"}`}>
                신청 {count} / {total}명
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 반 학생 목록 */}
      {selected && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-semibold mb-3">
            {selected.p!.bu} {selected.p!.grade}학년 {selected.p!.classNum}반
            {selected.c.teacher && <span className="text-xs text-gray-400 ml-2">담임 {selected.c.teacher}</span>}
          </h3>
          <ul className="grid sm:grid-cols-2 gap-1.5">
            {Object.entries(selected.c.students)
              .sort(([, a], [, b]) => a.name.localeCompare(b.name))
              .map(([stuId, stu]) => {
                const p = selected.p!;
                const appKey = makeAppKey(p.bu, stuId);
                const app = appByKey.get(appKey);
                const team = app?.teamId ? teams.find((t) => t.id === app.teamId) : undefined;
                const choice1 = app?.choice1 ? teams.find((t) => t.id === app.choice1) : undefined;
                return (
                  <li key={stuId}>
                    <button
                      onClick={() =>
                        setEditing({ studentId: stuId, name: stu.name, bu: p.bu, grade: p.grade, classNum: p.classNum, jang: stu.jang })
                      }
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm border ${
                        app ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200 hover:border-blue-200"
                      }`}
                    >
                      <span>
                        {stu.name}
                        {stu.jang && <span className="text-xs text-gray-400 ml-1">(장결)</span>}
                      </span>
                      <span className="text-xs text-gray-500">
                        {app
                          ? app.trainingOnly
                            ? "훈련만"
                            : team?.name ?? (choice1 ? `지망: ${choice1.name}` : "접수됨")
                          : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {editing && (
        <IntakeModal
          sid={sid}
          teams={teams}
          student={editing}
          existing={appByKey.get(makeAppKey(editing.bu, editing.studentId))}
          byUid={user?.uid}
          onClose={() => setEditing(null)}
          onRemove={async () => {
            if (!(await uiConfirm(`${editing.name} 신청을 삭제할까요?`))) return;
            await removeApplication(sid, makeAppKey(editing.bu, editing.studentId));
            toast("신청이 삭제되었습니다", "info");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function IntakeModal({
  sid,
  teams,
  student,
  existing,
  byUid,
  onClose,
  onRemove,
}: {
  sid: string;
  teams: Team[];
  student: StudentRow;
  existing?: Application;
  byUid?: string;
  onClose: () => void;
  onRemove: () => Promise<void>;
}) {
  const { toast } = useUI();
  const [choice1, setChoice1] = useState(existing?.choice1 ?? "");
  const [choice2, setChoice2] = useState(existing?.choice2 ?? "");
  const [trainingOnly, setTrainingOnly] = useState(existing?.trainingOnly ?? false);
  const [motive, setMotive] = useState("");
  const [wish, setWish] = useState("");
  const [privLoaded, setPrivLoaded] = useState(!existing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing) return;
    (async () => {
      try {
        const priv = await getApplicationPrivate(sid, existing.id);
        setMotive(priv?.motive ?? "");
        setWish(priv?.wish ?? "");
      } catch {
        /* private 로드는 실패해도 본 폼은 사용 가능 */
      } finally {
        setPrivLoaded(true);
      }
    })();
  }, [sid, existing]);

  async function save() {
    if (!trainingOnly && !choice1) {
      toast("희망팀(1지망)을 선택하거나 '훈련만 신청'을 체크해주세요", "warning");
      return;
    }
    setSaving(true);
    try {
      await upsertApplication(
        sid,
        {
          studentId: student.studentId,
          bu: student.bu,
          grade: student.grade,
          class: student.classNum,
          name: student.name,
          choice1: trainingOnly ? "" : choice1,
          choice2: trainingOnly ? "" : choice2,
          trainingOnly,
          status: existing?.status ?? "접수",
          teamId: existing?.teamId ?? "",
          createdAt: existing?.createdAt,
          createdBy: existing?.createdBy ?? byUid,
        },
        { motive: motive.trim(), wish: wish.trim() },
      );
      toast(`${student.name} 접수 완료`, "success");
      onClose();
    } catch (e) {
      toast(`저장 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${student.name} 신청 접수`}
        className="bg-white rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold mb-1">
          {student.name} <span className="text-sm font-normal text-gray-400">{student.bu} {student.grade}학년 {student.classNum}반</span>
        </h3>
        <p className="text-xs text-gray-400 mb-4">{existing ? "신청 내용 수정" : "새 신청 접수"}</p>

        <label className="flex items-center gap-2 text-sm mb-3">
          <input type="checkbox" checked={trainingOnly} onChange={(e) => setTrainingOnly(e.target.checked)} />
          훈련만 신청 (사역팀 배치 제외)
        </label>

        {!trainingOnly && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <label className="text-sm">
              <span className="text-xs text-gray-500">1지망</span>
              <select value={choice1} onChange={(e) => setChoice1(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-0.5">
                <option value="">선택</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs text-gray-500">2지망 (선택)</span>
              <select value={choice2} onChange={(e) => setChoice2(e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-0.5">
                <option value="">없음</option>
                {teams.filter((t) => t.id !== choice1).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label className="block text-sm mb-2">
          <span className="text-xs text-gray-500">지원 동기 (종이 신청서 내용, 선택)</span>
          <textarea
            value={motive}
            onChange={(e) => setMotive(e.target.value)}
            disabled={!privLoaded}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-0.5 text-sm"
          />
        </label>
        <label className="block text-sm mb-4">
          <span className="text-xs text-gray-500">하고 싶은 활동 (선택)</span>
          <textarea
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            disabled={!privLoaded}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 mt-0.5 text-sm"
          />
        </label>

        <div className="flex justify-between">
          {existing ? (
            <button onClick={() => void onRemove()} className="text-sm text-red-500 hover:text-red-700">
              신청 삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100">
              취소
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 disabled:opacity-50 text-sm font-medium"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
