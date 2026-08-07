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
import { deriveTrainingOnly, isStaffApplicant, validateIntake } from "@/features/semester/intakeRule";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { parseClassKey } from "@/features/semester/classKey";
import { Application, ApplicationPrivate, ClassInfo, StaffPerson, Team, TrainingClass } from "@/features/semester/types";

interface Props {
  sid: string;
  teams: Team[];
  trainingClasses: TrainingClass[];
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

export default function IntakeTab({ sid, teams, trainingClasses, applications }: Props) {
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
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [query, setQuery] = useState("");

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

  const SEARCH_LIMIT = 40;
  const matched = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    if (!normalized) return [];
    return buckets.flatMap((bucket) => bucket.rows.map((row) => ({ bucket, row })))
      .filter(({ row }) => row.name.toLocaleLowerCase("ko").includes(normalized));
  }, [buckets, query]);
  const queryResults = matched.slice(0, SEARCH_LIMIT);

  // 검색어가 없을 때는 이미 접수된 사람만 보여준다 (반 목록 없이 이름 중심 운영)
  const applied = useMemo(
    () => buckets
      .flatMap((bucket) => bucket.rows.map((row) => ({ bucket, row })))
      .filter(({ bucket, row }) => appByKey.has(makeAppKey(row.bu, row.personId)) && bucket.key !== "")
      .sort((a, b) => a.row.name.localeCompare(b.row.name, "ko")),
    [buckets, appByKey],
  );

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

      <div className="card mb-4 p-3 sm:p-4">
        <label className="block text-xs font-semibold text-slate-500" htmlFor="semester-applicant-search">이름으로 찾기</label>
        <input
          id="semester-applicant-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="학생·스탭 이름 검색"
          className="input mt-1.5 text-sm"
        />
        <p className="mt-2 text-xs text-slate-400">이름을 입력해 신청을 접수하거나 수정합니다.</p>
        {query.trim() && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {queryResults.map(({ bucket, row }) => {
              const appKey = makeAppKey(row.bu, row.personId);
              const app = appByKey.get(appKey);
              return (
                <button
                  key={appKey}
                  onClick={() => setEditing(row)}
                  disabled={!canEdit && !app}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50 disabled:cursor-default"
                >
                  <strong className="text-sm">{row.name}</strong>
                  <span className="ml-2 text-xs text-slate-400">{bucket.label}</span>
                  {app && <span className="ml-2 text-xs font-semibold text-emerald-600">신청됨</span>}
                </button>
              );
            })}
            {queryResults.length === 0 && <p className="col-span-full py-3 text-center text-sm text-slate-400">검색 결과가 없습니다.</p>}
            {matched.length > queryResults.length && (
              <p className="col-span-full text-center text-xs text-slate-400">
                {matched.length}명 중 {queryResults.length}명만 표시했습니다 — 이름을 더 입력해주세요.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 접수된 신청자 — 검색 없이도 현황을 바로 본다 */}
      <div className="card card-body">
        <h3 className="font-semibold text-slate-800">
          접수 명단 <span className="ml-1 text-sm font-normal text-slate-400">{applied.length}명</span>
        </h3>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {applied.map(({ bucket, row }) => {
            const appKey = makeAppKey(row.bu, row.personId);
            const app = appByKey.get(appKey);
            const priv = privateMap[appKey];
            const team = app?.teamId ? teams.find((t) => t.id === app.teamId) : undefined;
            const choice1 = app?.choice1 ? teams.find((t) => t.id === app.choice1) : undefined;
            const trainingClass = app?.trainingClassId ? trainingClasses.find((c) => c.id === app.trainingClassId) : undefined;
            const phone = priv?.phone || row.rosterPhone;
            return (
              <li key={appKey}>
                <button
                  onClick={() => setEditing(row)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-sm transition disabled:cursor-default"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-800">{row.name}</span>
                      <span className="ml-1.5 text-xs text-slate-400">{bucket.label}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {team?.name ?? (choice1 ? `지망: ${choice1.name}` : app?.trainingOnly ? "훈련만" : "접수됨")}
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                    <span>훈련 {trainingClass?.name ?? (app?.trainingOnly ? "신청" : "미신청")}</span>
                    <span>본인 {phone || "—"}</span>
                    <span>보호자 {priv?.parentPhone || "—"}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {applied.length === 0 && (
            <li className="text-sm text-slate-400">아직 접수된 신청이 없습니다. 위에서 이름을 검색해 접수하세요.</li>
          )}
        </ul>
      </div>

      {editing && (
        <IntakeModal
          sid={sid}
          teams={teams}
          trainingClasses={trainingClasses}
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
  trainingClasses,
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
  trainingClasses: TrainingClass[];
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
  const [trainingClassId, setTrainingClassId] = useState(existing?.trainingClassId ?? "");
  const [assignedTeamId, setAssignedTeamId] = useState(existing?.teamId ?? "");
  const isStaff = isStaffApplicant({ grade: person.grade, bu: person.bu });
  const [phone, setPhone] = useState(existingPrivate?.phone ?? person.rosterPhone ?? "");
  const [parentPhone, setParentPhone] = useState(existingPrivate?.parentPhone ?? "");
  const [motive, setMotive] = useState(existingPrivate?.motive ?? "");
  const [wish, setWish] = useState(existingPrivate?.wish ?? "");
  const [saving, setSaving] = useState(false);

  const selection = { trainingClassId, ministryChoice1: choice1, assignedTeamId };
  const check = validateIntake(selection, { grade: person.grade, bu: person.bu }, sid);
  const trainingOnly = deriveTrainingOnly(selection);

  async function save() {
    if (!check.ok) {
      toast(check.message, "warning");
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
          choice1: isStaff ? "" : choice1 || "",
          choice2: isStaff ? "" : (choice1 && choice2 ? choice2 : ""),
          trainingClassId: isStaff ? "" : trainingClassId,
          trainingOnly,
          status: isStaff ? (assignedTeamId ? "배치" : "접수") : (existing?.status ?? "접수"),
          teamId: isStaff ? assignedTeamId : (existing?.teamId ?? ""),
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
        className="modal-card card max-h-[90vh] w-full max-w-md overflow-y-auto px-5 pb-5 pt-7"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 font-bold text-slate-800">
          {person.name}{" "}
          <span className="text-sm font-normal text-slate-400">
            {person.bu === STAFF_BU ? person.title || "스탭" : `${person.bu} ${person.grade}학년 ${person.classNum}반`}
          </span>
        </h3>
        <p className="mb-4 text-xs text-slate-400">{existing ? "신청 내용 수정" : "새 신청 접수"}</p>

        {isStaff ? (
          <div className="mb-3">
            <label className="block text-sm">
              <span className="text-xs font-semibold text-slate-600">사역팀 배정</span>
              <select
                value={assignedTeamId}
                disabled={!canEdit}
                onChange={(e) => setAssignedTeamId(e.target.value)}
                className="input mt-1"
              >
                <option value="">팀 선택</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              교사·스탭은 훈련 대상이 아니라 지망 없이 사역팀에 바로 배정됩니다.
            </p>
          </div>
        ) : (
        <>
        <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
          <label className="block text-sm">
            <span className="text-xs font-semibold text-emerald-800">훈련 반</span>
            <select
              value={trainingClassId}
              disabled={!canEdit}
              onChange={(e) => setTrainingClassId(e.target.value)}
              className="input mt-0.5"
            >
              <option value="">훈련 신청 안 함</option>
              {trainingClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-800/80">
            사역팀은 훈련을 신청해야 지원할 수 있습니다. 고3 2학기만 훈련 없이 사역팀을 신청할 수 있습니다.
          </p>
          {trainingClasses.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-700">설정 탭의 훈련 관리에서 훈련 반을 먼저 만들어주세요.</p>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="text-sm">
            <span className="text-xs text-slate-500">사역팀 1지망</span>
            <select value={choice1} disabled={!canEdit} onChange={(e) => setChoice1(e.target.value)} className="input mt-0.5">
              <option value="">신청 안 함</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-slate-500">2지망 (선택)</span>
            <select value={choice2} disabled={!canEdit || !choice1} onChange={(e) => setChoice2(e.target.value)} className="input mt-0.5">
              <option value="">없음</option>
              {teams.filter((t) => t.id !== choice1).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
        </div>
        </>
        )}

        {!check.ok && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
            {check.message}
          </p>
        )}
        {check.ok && check.hint && (
          <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {check.hint}
          </p>
        )}
        {check.ok && trainingOnly && !isStaff && (
          <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            훈련만 신청 — 사역팀 배치 대상에서 제외됩니다.
          </p>
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
              <button onClick={() => void save()} disabled={saving || !check.ok} className="btn-primary">
                {saving ? "저장 중…" : "저장"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
