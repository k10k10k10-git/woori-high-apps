"use client";

// 현장 접수 — 학생 원장(classes)과 공식스탭 명단(teacherStaff)에서 대상을 탭해 신청 처리.
// classes·teacherStaff는 읽기 전용(다른 앱 소유). 연락처는 학생 원장 값이 기본이고,
// 신청서에서 받은 연락처·보호자 연락처는 🔒 semestersPrivate에만 저장한다.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import {
  getClassesByYear,
  getStaffByYear,
  makeAppKey,
  removeApplication,
  subscribeApplicationsPrivate,
  upsertApplication,
} from "@/features/semester/db";
import { STAFF_BU } from "@/features/semester/applicant";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { parseClassKey } from "@/features/semester/classKey";
import { Application, ApplicationPrivate, ClassInfo, StaffPerson, Team } from "@/features/semester/types";

interface Props {
  sid: string;
  teams: Team[];
  applications: Application[];
}

interface PersonRow {
  personId: string;
  name: string;
  bu: string;
  grade: number;
  classNum: number;
  jang?: boolean;
  /** 명단(classes/teacherStaff)에 등록된 연락처 — 읽기 전용 원천 */
  rosterPhone?: string;
  title?: string;
}

type Bucket = { key: string; label: string; sub?: string; rows: PersonRow[] };

export default function IntakeTab({ sid, teams, applications }: Props) {
  const { user } = useAuth();
  const { toast, uiConfirm } = useUI();
  const canEdit = useSemesterCanEdit();
  const year = sid.split("-")[0]; // "2026-1" → classes/2026
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [staff, setStaff] = useState<StaffPerson[]>([]);
  const [privateMap, setPrivateMap] = useState<Record<string, ApplicationPrivate>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setLoadError(null);
      setStaffError(null);
      try {
        setClasses(await getClassesByYear(year));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
      try {
        setStaff(await getStaffByYear(year));
      } catch (e) {
        // 스탭 명단은 보조 원천이다 — 실패해도 학생 접수는 계속 가능해야 한다.
        setStaffError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [year]);

  // 🔒 연락처는 행정 계열만 읽을 수 있다(Rules). 조회 전용 역할에서는 구독하지 않는다.
  useEffect(() => {
    if (!canEdit) {
      setPrivateMap({});
      return;
    }
    return subscribeApplicationsPrivate(sid, setPrivateMap, (e) => setLoadError(e.message));
  }, [sid, canEdit]);

  const appByKey = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications]);

  const buckets = useMemo<Bucket[]>(() => {
    const classBuckets = classes
      .map((c) => ({ c, p: parseClassKey(c.classKey) }))
      .filter((x) => x.p !== null)
      .sort((a, b) =>
        a.p!.bu !== b.p!.bu
          ? a.p!.bu.localeCompare(b.p!.bu)
          : a.p!.grade !== b.p!.grade
            ? a.p!.grade - b.p!.grade
            : a.p!.classNum - b.p!.classNum,
      )
      .map(({ c, p }): Bucket => ({
        key: c.classKey,
        label: `${p!.bu} ${p!.grade}학년 ${p!.classNum}반`,
        sub: c.teacher ? `담임 ${c.teacher}` : undefined,
        rows: Object.entries(c.students)
          .map(([studentId, student]): PersonRow => ({
            personId: studentId,
            name: student.name,
            bu: p!.bu,
            grade: p!.grade,
            classNum: p!.classNum,
            jang: student.jang,
            rosterPhone: student.phone,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      }));

    const staffBucket: Bucket[] = staff.length > 0
      ? [{
          key: "__staff__",
          label: "스탭",
          sub: `공식스탭 ${staff.length}명`,
          rows: staff.map((person): PersonRow => ({
            personId: person.staffId,
            name: person.name,
            bu: STAFF_BU,
            grade: 0,
            classNum: 0,
            rosterPhone: person.phone,
            title: person.title,
          })),
        }]
      : [];

    return [...classBuckets, ...staffBucket];
  }, [classes, staff]);

  const selected = buckets.find((bucket) => bucket.key === selectedKey);

  function bucketAppCount(bucket: Bucket): number {
    return bucket.rows.filter((row) => appByKey.has(makeAppKey(row.bu, row.personId))).length;
  }

  return (
    <div>
      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          ⚠ 명단 로드 오류: {loadError}
        </div>
      )}
      {staffError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          스탭 명단(teacherStaff/{year})을 불러오지 못했습니다 — {staffError}
        </div>
      )}
      {!canEdit && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500">
          조회 전용 역할입니다. 접수·수정은 할 수 없고, 연락처는 행정 계열 권한에서만 표시됩니다.
        </div>
      )}
      {loading && <p className="text-sm text-slate-400">명단({year}) 불러오는 중…</p>}
      {!loading && !loadError && buckets.length === 0 && (
        <p className="text-sm text-slate-400">classes/{year} 에 명단이 없습니다. 학생 출석부 앱에서 먼저 명단을 동기화해주세요.</p>
      )}

      {/* 반·스탭 그리드 */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {buckets.map((bucket) => {
          const total = bucket.rows.length;
          const count = bucketAppCount(bucket);
          const active = bucket.key === selectedKey;
          return (
            <button
              key={bucket.key}
              onClick={() => setSelectedKey(active ? null : bucket.key)}
              className="card p-2.5 text-left text-sm transition"
              data-hover=""
              style={active
                ? { boxShadow: `0 0 0 2px var(--color-primary)` }
                : undefined}
            >
              <div className="font-medium text-slate-800">{bucket.label}</div>
              <div className={`mt-0.5 text-xs ${count > 0 ? "font-semibold" : "text-slate-400"}`}
                style={count > 0 ? { color: "var(--color-primary)" } : undefined}>
                신청 {count} / {total}명
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 반·스탭 명단 */}
      {selected && (
        <div className="card card-body">
          <h3 className="font-semibold text-slate-800">
            {selected.label}
            {selected.sub && <span className="ml-2 text-xs text-slate-400">{selected.sub}</span>}
          </h3>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {selected.rows.map((row) => {
              const appKey = makeAppKey(row.bu, row.personId);
              const app = appByKey.get(appKey);
              const priv = privateMap[appKey];
              const team = app?.teamId ? teams.find((t) => t.id === app.teamId) : undefined;
              const choice1 = app?.choice1 ? teams.find((t) => t.id === app.choice1) : undefined;
              const phone = priv?.phone || row.rosterPhone;
              return (
                <li key={appKey}>
                  <button
                    onClick={() => setEditing(row)}
                    disabled={!canEdit && !app}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-default ${
                      app ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-emerald-200"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="font-medium text-slate-800">{row.name}</span>
                        {row.title && <span className="ml-1 text-xs text-slate-400">{row.title}</span>}
                        {row.jang && <span className="ml-1 text-xs text-slate-400">(장결)</span>}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {app
                          ? app.trainingOnly
                            ? "훈련만"
                            : team?.name ?? (choice1 ? `지망: ${choice1.name}` : "접수됨")
                          : ""}
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span>본인 {phone || "—"}</span>
                      <span>보호자 {priv?.parentPhone || "—"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {selected.rows.length === 0 && <li className="text-sm text-slate-400">명단이 비어 있습니다.</li>}
          </ul>
        </div>
      )}

      {editing && (
        <IntakeModal
          sid={sid}
          teams={teams}
          person={editing}
          existing={appByKey.get(makeAppKey(editing.bu, editing.personId))}
          existingPrivate={privateMap[makeAppKey(editing.bu, editing.personId)]}
          canEdit={canEdit}
          byUid={user?.uid}
          onClose={() => setEditing(null)}
          onRemove={async () => {
            if (!(await uiConfirm(`${editing.name} 신청을 삭제할까요?`))) return;
            await removeApplication(sid, makeAppKey(editing.bu, editing.personId));
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
  person,
  existing,
  existingPrivate,
  canEdit,
  byUid,
  onClose,
  onRemove,
}: {
  sid: string;
  teams: Team[];
  person: PersonRow;
  existing?: Application;
  existingPrivate?: ApplicationPrivate;
  canEdit: boolean;
  byUid?: string;
  onClose: () => void;
  onRemove: () => Promise<void>;
}) {
  const { toast } = useUI();
  const [choice1, setChoice1] = useState(existing?.choice1 ?? "");
  const [choice2, setChoice2] = useState(existing?.choice2 ?? "");
  const [trainingOnly, setTrainingOnly] = useState(existing?.trainingOnly ?? false);
  const [phone, setPhone] = useState(existingPrivate?.phone ?? person.rosterPhone ?? "");
  const [parentPhone, setParentPhone] = useState(existingPrivate?.parentPhone ?? "");
  const [motive, setMotive] = useState(existingPrivate?.motive ?? "");
  const [wish, setWish] = useState(existingPrivate?.wish ?? "");
  const [saving, setSaving] = useState(false);

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
          studentId: person.personId,
          bu: person.bu,
          grade: person.grade,
          class: person.classNum,
          name: person.name,
          choice1: trainingOnly ? "" : choice1,
          choice2: trainingOnly ? "" : choice2,
          trainingOnly,
          status: existing?.status ?? "접수",
          teamId: existing?.teamId ?? "",
          createdAt: existing?.createdAt,
          createdBy: existing?.createdBy ?? byUid,
        },
        {
          motive: motive.trim(),
          wish: wish.trim(),
          phone: phone.trim(),
          parentPhone: parentPhone.trim(),
        },
      );
      toast(`${person.name} 접수 완료`, "success");
      onClose();
    } catch (e) {
      toast(`저장 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${person.name} 신청 접수`}
        className="modal-card card max-h-[90vh] w-full max-w-md overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-bold text-slate-800">
          {person.name}{" "}
          <span className="text-sm font-normal text-slate-400">
            {person.bu === STAFF_BU ? person.title || "스탭" : `${person.bu} ${person.grade}학년 ${person.classNum}반`}
          </span>
        </h3>
        <p className="mb-4 text-xs text-slate-400">{existing ? "신청 내용 수정" : "새 신청 접수"}</p>

        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={trainingOnly} disabled={!canEdit} onChange={(e) => setTrainingOnly(e.target.checked)} />
          훈련만 신청 (사역팀 배치 제외)
        </label>

        {!trainingOnly && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="text-xs text-slate-500">1지망</span>
              <select value={choice1} disabled={!canEdit} onChange={(e) => setChoice1(e.target.value)} className="input mt-0.5">
                <option value="">선택</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-500">2지망 (선택)</span>
              <select value={choice2} disabled={!canEdit} onChange={(e) => setChoice2(e.target.value)} className="input mt-0.5">
                <option value="">없음</option>
                {teams.filter((t) => t.id !== choice1).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="text-sm">
            <span className="text-xs text-slate-500">본인 연락처</span>
            <input
              value={phone}
              disabled={!canEdit}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              inputMode="tel"
              className="input mt-0.5"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-slate-500">보호자 연락처</span>
            <input
              value={parentPhone}
              disabled={!canEdit}
              onChange={(e) => setParentPhone(e.target.value)}
              placeholder="010-0000-0000"
              inputMode="tel"
              className="input mt-0.5"
            />
          </label>
        </div>

        <label className="mb-2 block text-sm">
          <span className="text-xs text-slate-500">지원 동기 (종이 신청서 내용, 선택)</span>
          <textarea value={motive} disabled={!canEdit} onChange={(e) => setMotive(e.target.value)} rows={2} className="input mt-0.5" />
        </label>
        <label className="mb-4 block text-sm">
          <span className="text-xs text-slate-500">하고 싶은 활동 (선택)</span>
          <textarea value={wish} disabled={!canEdit} onChange={(e) => setWish(e.target.value)} rows={2} className="input mt-0.5" />
        </label>

        <div className="flex justify-between">
          {existing && canEdit ? (
            <button onClick={() => void onRemove()} className="text-sm text-red-500 hover:text-red-700">
              신청 삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">닫기</button>
            {canEdit && (
              <button onClick={() => void save()} disabled={saving} className="btn-primary">
                {saving ? "저장 중…" : "저장"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
