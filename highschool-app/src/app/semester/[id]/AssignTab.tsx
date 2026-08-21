"use client";

// 팀 배치 — 미배정 신청자를 팀에 배정. 지망 칩 표시, 팀별 인원 집계.
// 저장은 신청 문서 단일 경로 update (전체 덮어쓰기 없음).

import { useEffect, useMemo, useState } from "react";
import { useUI } from "@/context/UIContext";
import {
  describeApplicant,
  subscribeApplicationsPrivate,
  subscribeClassesByYear,
  subscribeStaffByYear,
  updateApplication,
} from "@/features/semester/db";
import { STAFF_BU } from "@/features/semester/applicant";
import { applicantSortKey } from "@/features/semester/applicant";
import { isStaffApplication, splitStudentsAndStaff } from "@/features/semester/roster";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { useDialogEscape } from "@/components/useDialogEscape";
import { buildRosterContactMap, resolvedContact } from "@/features/semester/rosterContact";
import { Application, ApplicationPrivate, ClassInfo, StaffPerson, Team, TrainingClass } from "@/features/semester/types";

interface Props {
  sid: string;
  teams: Team[];
  trainingClasses: TrainingClass[];
  applications: Application[];
  teamById: Map<string, Team>;
}

function byApplicant(a: Application, b: Application) {
  return applicantSortKey(a).localeCompare(applicantSortKey(b), "ko");
}

/**
 * 팀 명단을 학생 칸·교사·스탭 칸으로 나눈다.
 * 팀 카드와 명단 상세가 같은 구분을 쓰도록 여기 하나로 모은다 — 스탭은 지망·보호자 연락처
 * 대상이 아니라 표시 항목 자체가 다르다.
 */
function groupByKind(members: Application[]): { key: string; label: string; rows: Application[] }[] {
  const { students, staff } = splitStudentsAndStaff(members);
  return [
    { key: "students", label: `학생 ${students.length}명`, rows: students },
    { key: "staff", label: `교사·스탭 ${staff.length}명`, rows: staff },
  ].filter((section) => section.rows.length > 0);
}

export default function AssignTab({ sid, teams, trainingClasses, applications, teamById }: Props) {
  const { toast } = useUI();
  const canEdit = useSemesterCanEdit();
  const year = sid.split("-")[0];
  const [privateMap, setPrivateMap] = useState<Record<string, ApplicationPrivate>>({});
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [staff, setStaff] = useState<StaffPerson[]>([]);
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null);
  const [detailTrainingClassId, setDetailTrainingClassId] = useState<string | null>(null);
  useDialogEscape(!!detailTeamId || !!detailTrainingClassId, () => {
    setDetailTeamId(null);
    setDetailTrainingClassId(null);
  });
  const [expandedApplicantId, setExpandedApplicantId] = useState<string | null>(null);
  // 팀 카드의 스탭 목록은 한 번에 하나만 펼친다. 여러 개를 열어두면 카드 높이가 들쭉날쭉해진다.
  const [staffOpenTeamId, setStaffOpenTeamId] = useState<string | null>(null);
  // 명단 상세도 팀 카드와 같게 스탭을 접어 연다 — 열자마자 눈에 들어와야 하는 쪽은 학생 명단이다.
  const [detailStaffOpen, setDetailStaffOpen] = useState(false);

  useEffect(() => {
    if (!canEdit) return;
    const fail = (error: Error) => toast(`상세정보 로드 실패: ${error.message}`, "error");
    const unsubs = [
      subscribeApplicationsPrivate(sid, setPrivateMap, fail),
      subscribeClassesByYear(year, setClasses, fail),
      subscribeStaffByYear(year, setStaff, fail),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [sid, year, canEdit, toast]);

  const rosterContactMap = useMemo(() => buildRosterContactMap(classes, staff), [classes, staff]);

  const targets = useMemo(
    () => applications.filter((a) => a.status !== "취소" && !a.trainingOnly),
    [applications],
  );
  const unassigned = targets.filter((a) => !a.teamId);
  const byTeam = useMemo(() => {
    const m = new Map<string, Application[]>();
    for (const t of teams) m.set(t.id, []);
    for (const a of targets) if (a.teamId && m.has(a.teamId)) m.get(a.teamId)!.push(a);
    return m;
  }, [targets, teams]);

  // 훈련 배치 — 학생만 대상(교사·스탭은 훈련 과정이 없다)
  const trainingTargets = useMemo(
    () => applications.filter((a) => a.status !== "취소" && a.bu !== STAFF_BU),
    [applications],
  );
  const trainingUnassigned = trainingTargets.filter((a) => !a.trainingClassId);
  const byTrainingClass = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const trainingClass of trainingClasses) map.set(trainingClass.id, []);
    for (const app of trainingTargets) {
      if (app.trainingClassId && map.has(app.trainingClassId)) map.get(app.trainingClassId)!.push(app);
    }
    return map;
  }, [trainingTargets, trainingClasses]);

  async function assignTraining(app: Application, trainingClassId: string) {
    try {
      await updateApplication(sid, app.id, { trainingClassId });
      if (trainingClassId) {
        toast(`${app.name} → ${trainingClasses.find((c) => c.id === trainingClassId)?.name ?? ""} 훈련 반 배정`, "success");
      }
    } catch (e) {
      toast(`훈련 반 배정 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function assign(app: Application, teamId: string) {
    try {
      await updateApplication(sid, app.id, { teamId, status: teamId ? "배치" : "접수" });
      if (teamId) toast(`${app.name} → ${teamById.get(teamId)?.name ?? ""} 배치`, "success");
    } catch (e) {
      toast(`배치 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  if (teams.length === 0) {
    return <p className="text-sm text-slate-400">먼저 설정 탭에서 팀을 만들어주세요.</p>;
  }

  return (
    <div className="grid gap-6">
    <section>
      <h3 className="mb-2 text-sm font-bold text-slate-700">사역팀 배치</h3>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      {/* 미배정 풀 */}
      <section className="card card-body">
        <h3 className="font-semibold text-slate-800">
          미배정 <span className="text-sm text-slate-400">{unassigned.length}명</span>
        </h3>
        {unassigned.length === 0 && <p className="text-sm text-slate-400">모두 배치되었습니다 🎉</p>}
        <ul className="grid gap-1.5">
          {[...unassigned].sort(byApplicant).map((a) => {
            const c1 = a.choice1 ? teamById.get(a.choice1) : undefined;
            const c2 = a.choice2 ? teamById.get(a.choice2) : undefined;
            return (
              <li key={a.id} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    {a.name}
                    <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(a)}</span>
                  </span>
                  {/* .input은 @layer 밖 규칙이라 h-*·px-*·text-*가 먹지 않는다.
                      h-8로 높이를 고정했더니 padding 8px + text-base가 32px를 넘겨 "배치…"가 잘렸다.
                      높이는 고정하지 않고, 폭은 감싼 div로 준다(루트 CLAUDE.md 함정 1).
                      글꼴을 줄이려면 유틸리티(text-xs)로는 안 되고 인라인 style이어야 한다. */}
                  <div className="w-32 shrink-0">
                    <select
                      aria-label={`${a.name} 팀 배치`}
                      value=""
                      disabled={!canEdit}
                      onChange={(e) => e.target.value && void assign(a, e.target.value)}
                      className="input"
                      style={{ fontSize: "var(--text-sm)" }}
                    >
                      <option value="">배치…</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.id === a.choice1 ? " ★1지망" : t.id === a.choice2 ? " ☆2지망" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {(c1 || c2) && (
                  <div className="mt-1 flex gap-1">
                    {c1 && <span className={`rounded px-1.5 py-0.5 text-xs ${c1.color}`}>1지망 {c1.name}</span>}
                    {c2 && <span className={`rounded px-1.5 py-0.5 text-xs ${c2.color}`}>2지망 {c2.name}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {unassigned.length > 0 && canEdit && (
          <button
            onClick={async () => {
              // 1지망 일괄 배치 — 지망이 있는 미배정 전원을 1지망 팀으로
              const withChoice = unassigned.filter((a) => a.choice1);
              for (const a of withChoice) await assign(a, a.choice1!);
              toast(`1지망 일괄 배치 완료 (${withChoice.length}명)`, "success");
            }}
            className="btn-primary w-full justify-center"
          >
            1지망대로 일괄 배치
          </button>
        )}
      </section>

      {/* 팀 칼럼 */}
      <section className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => {
          const members = [...(byTeam.get(t.id) ?? [])].sort(byApplicant);
          // 카드 명단은 학생만 둔다. 스탭은 팀마다 몇 명씩 고정으로 붙어 있어
          // 같이 나열하면 학생 배치 현황이 묻힌다. 헤더에서 펼쳐 확인한다.
          const { students, staff } = splitStudentsAndStaff(members);
          const staffOpen = staffOpenTeamId === t.id;
          return (
            <div key={t.id} className="card overflow-hidden">
              <div className={`flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold ${t.color}`}>
                <span>{t.name} <span className="font-normal text-slate-600">{members.length}명</span></span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {staff.length > 0 && (
                    <button
                      type="button"
                      aria-expanded={staffOpen}
                      aria-controls={`team-staff-${t.id}`}
                      onClick={() => setStaffOpenTeamId(staffOpen ? null : t.id)}
                      className="rounded-lg bg-white/80 px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                    >
                      스탭 {staff.length}명 <span className="font-normal text-slate-500">{staffOpen ? "▲" : "▼"}</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setDetailTeamId(t.id);
                      setExpandedApplicantId(null);
                      // 학생이 없는 팀은 접을 이유가 없다 — 접어 두면 모달이 빈 채로 열린다.
                      setDetailStaffOpen(students.length === 0);
                    }}
                    className="rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
                  >
                    명단 상세
                  </button>
                </span>
              </div>
              <div id={`team-staff-${t.id}`}>
                {staff.length > 0 && staffOpen && (
                  <p className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                    {staff.map((a) => <span key={a.id}>{a.name}</span>)}
                  </p>
                )}
              </div>
              {/* 배치 해제(✕)는 명단 상세 안으로 옮겼다 - 목록에서 바로 지우면 실수로 누르기 쉽다. */}
              <div className="grid gap-2 p-3">
                <ul className="grid gap-1">
                  {students.map((a) => (
                    <li key={a.id} className="rounded px-2 py-1 text-sm hover:bg-slate-50">
                      {a.name}
                      <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(a)}</span>
                      {a.choice1 === t.id && <span className="ml-1 text-xs" style={{ color: "var(--color-primary)" }}>★</span>}
                    </li>
                  ))}
                </ul>
                {students.length === 0 && (
                  <p className="px-2 py-1 text-xs text-slate-300">{members.length === 0 ? "아직 없음" : "배치된 학생 없음"}</p>
                )}
              </div>
            </div>
          );
        })}
      </section>

      </div>
    </section>

    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-700">훈련 배치</h3>
        <span className="text-xs text-slate-400">교사·스탭은 훈련 대상이 아니라 목록에 없습니다.</span>
      </div>
      {trainingClasses.length === 0 ? (
        <p className="text-sm text-slate-400">먼저 설정 탭의 훈련 관리에서 반을 만들어주세요.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <div className="card card-body">
            <h4 className="font-semibold text-slate-800">
              반 미정 <span className="text-sm text-slate-400">{trainingUnassigned.length}명</span>
            </h4>
            {trainingUnassigned.length === 0 && <p className="text-sm text-slate-400">모두 배정되었습니다 🎉</p>}
            <ul className="grid gap-1.5">
              {[...trainingUnassigned].sort(byApplicant).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--color-border)" }}>
                  <span className="min-w-0">
                    {a.name}
                    <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(a)}</span>
                  </span>
                  {/* 사역팀 배치와 같은 이유로 높이를 고정하지 않는다(글자 잘림) — 폭만 감싼 div로. */}
                  <div className="w-32 shrink-0">
                    <select
                      aria-label={`${a.name} 훈련 반 배정`}
                      value=""
                      disabled={!canEdit}
                      onChange={(e) => e.target.value && void assignTraining(a, e.target.value)}
                      className="input"
                      style={{ fontSize: "var(--text-sm)" }}
                    >
                      <option value="">배정…</option>
                      {trainingClasses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {trainingClasses.map((c) => {
              const members = [...(byTrainingClass.get(c.id) ?? [])].sort(byApplicant);
              return (
                <div key={c.id} className="card overflow-hidden">
                  <div className={`flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold ${c.color}`}>
                    <span>
                      {c.name} <span className="font-normal text-slate-600">{members.length}명</span>
                      {c.teacher && <span className="ml-1 text-xs font-normal text-slate-500">담당 {c.teacher}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDetailTrainingClassId(c.id);
                        setExpandedApplicantId(null);
                      }}
                      className="shrink-0 rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
                    >
                      명단 상세
                    </button>
                  </div>
                  <ul className="grid gap-1 p-3">
                    {members.map((a) => (
                      <li key={a.id} className="rounded px-2 py-1 text-sm hover:bg-slate-50">
                        {a.name}
                        <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(a)}</span>
                      </li>
                    ))}
                    {members.length === 0 && <li className="px-2 py-1 text-xs text-slate-300">아직 없음</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>

      {detailTeamId && (() => {
        const detailTeam = teamById.get(detailTeamId);
        const members = [...(byTeam.get(detailTeamId) ?? [])].sort(byApplicant);
        if (!detailTeam) return null;
        return (
          <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setDetailTeamId(null)}>
            <section role="dialog" aria-modal="true" aria-label={`${detailTeam.name} 명단 상세`} className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900">{detailTeam.name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${detailTeam.color}`}>{members.length}명</span>
                  </div>
                  {/* 스탭에게는 지원 동기가 없다 — 학생이 없으면 이 안내는 사실과 다르다. */}
                  {members.some((application) => !isStaffApplication(application)) && (
                    <p className="mt-1 text-xs text-slate-400">학생 이름을 누르면 지원 동기와 하고 싶은 활동을 확인할 수 있습니다.</p>
                  )}
                </div>
                <button onClick={() => setDetailTeamId(null)} aria-label="닫기" className="rounded-lg px-2 py-1 text-lg text-slate-400 hover:bg-slate-100">✕</button>
              </div>
              {/* 여기서 전원을 해제하면 명단이 빈다 — 빈 화면 대신 상태를 알린다. */}
              {members.length === 0 && (
                <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
                  배치된 인원이 없습니다.
                </p>
              )}
              {/* 학생과 교사·스탭을 나눠 보여준다. 스탭은 지망·보호자 연락처 대상이 아니라 항목도 다르다. */}
              {groupByKind(members).map((section) => {
                // 스탭 칸만 접는다. 학생은 이 모달을 여는 이유 그 자체라 항상 펼쳐 둔다.
                const collapsible = section.key === "staff";
                const sectionOpen = !collapsible || detailStaffOpen;
                return (
                <div key={section.key} className="mb-3 last:mb-0">
                  {collapsible ? (
                    <button
                      type="button"
                      className="mb-1.5 flex min-h-9 items-center gap-2 rounded-lg px-1 text-xs font-semibold text-slate-500 transition hover:text-emerald-700"
                      aria-expanded={detailStaffOpen}
                      aria-controls="detail-staff-list"
                      onClick={() => setDetailStaffOpen((value) => !value)}
                    >
                      {section.label}
                      <span className="font-normal text-slate-400">{detailStaffOpen ? "접기 ▲" : "펼치기 ▼"}</span>
                    </button>
                  ) : (
                    <p className="mb-1.5 text-xs font-semibold text-slate-500">{section.label}</p>
                  )}
                  <ul className="grid gap-2" id={collapsible ? "detail-staff-list" : undefined} hidden={!sectionOpen}>
                    {section.rows.map((application) => {
                      const detail = canEdit ? privateMap[application.id] : undefined;
                      const contact = resolvedContact(detail, rosterContactMap[application.id]);
                      const expanded = expandedApplicantId === application.id;
                      const staffMember = isStaffApplication(application);
                      // 스탭에게는 지원 동기·하고 싶은 활동이 없다 — 펼칠 내용이 없으면 토글도 만들지 않는다.
                      const canExpand = !staffMember;
                      const heading = (
                        <>
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <strong className="text-sm text-slate-800">{application.name}</strong>
                            <span className="text-xs text-slate-400">{describeApplicant(application)}</span>
                            {!staffMember && application.choice1 === detailTeamId && <span className="text-xs text-emerald-600">★ 1지망</span>}
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                            {canEdit ? (
                              <>
                                <span>본인 {contact.phone || "-"}</span>
                                {!staffMember && <span>보호자 {contact.parentPhone || "-"}</span>}
                              </>
                            ) : (
                              <span>연락처는 행정 권한에서 확인할 수 있습니다.</span>
                            )}
                          </span>
                        </>
                      );
                      return (
                        <li key={application.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          <div className="flex items-center">
                            {canExpand ? (
                              <button
                                onClick={() => setExpandedApplicantId(expanded ? null : application.id)}
                                className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                              >
                                <span className="min-w-0">{heading}</span>
                                <span className="shrink-0 text-xs text-slate-400">{expanded ? "접기" : "상세 보기"}</span>
                              </button>
                            ) : (
                              <div className="min-w-0 flex-1 px-4 py-3">{heading}</div>
                            )}
                            {canEdit && (
                              <button
                                aria-label={`${application.name} 배치 해제`}
                                title="배치 해제"
                                onClick={() => void assign(application, "")}
                                className="shrink-0 self-stretch px-4 text-sm text-slate-400 hover:bg-red-50 hover:text-red-500"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          {expanded && (
                            <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-4">
                              <DetailField label="지원 동기" value={detail?.motive} locked={!canEdit} />
                              <DetailField label="하고 싶은 활동" value={detail?.wish} locked={!canEdit} />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                );
              })}
            </section>
          </div>
        );
      })()}

      {detailTrainingClassId && (() => {
        const trainingClass = trainingClasses.find((item) => item.id === detailTrainingClassId);
        const members = [...(byTrainingClass.get(detailTrainingClassId) ?? [])].sort(byApplicant);
        if (!trainingClass) return null;
        return (
          <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setDetailTrainingClassId(null)}>
            <section role="dialog" aria-modal="true" aria-label={`${trainingClass.name} 명단 상세`} className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900">{trainingClass.name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${trainingClass.color}`}>{members.length}명</span>
                    {trainingClass.teacher && <span className="text-xs text-slate-500">담당 {trainingClass.teacher}</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">학생 이름을 누르면 신청 내용과 연락처를 확인할 수 있습니다.</p>
                </div>
                <button onClick={() => setDetailTrainingClassId(null)} aria-label="닫기" className="rounded-lg px-2 py-1 text-lg text-slate-400 hover:bg-slate-100">✕</button>
              </div>
              {members.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">배정된 인원이 없습니다.</p>
              ) : (
                <ul className="grid gap-2">
                  {members.map((application) => {
                    const detail = canEdit ? privateMap[application.id] : undefined;
                    const contact = resolvedContact(detail, rosterContactMap[application.id]);
                    const expanded = expandedApplicantId === application.id;
                    return (
                      <li key={application.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="flex items-center">
                          <button
                            onClick={() => setExpandedApplicantId(expanded ? null : application.id)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                          >
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-baseline gap-x-2">
                                <strong className="text-sm text-slate-800">{application.name}</strong>
                                <span className="text-xs text-slate-400">{describeApplicant(application)}</span>
                              </span>
                              <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                                {canEdit ? <><span>본인 {contact.phone || "-"}</span><span>보호자 {contact.parentPhone || "-"}</span></> : <span>연락처는 행정 권한에서 확인할 수 있습니다.</span>}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-slate-400">{expanded ? "접기" : "상세 보기"}</span>
                          </button>
                          {canEdit && (
                            <button
                              aria-label={`${application.name} 훈련 반 해제`}
                              title="훈련 반 해제"
                              onClick={() => void assignTraining(application, "")}
                              className="shrink-0 self-stretch px-4 text-sm text-slate-400 hover:bg-red-50 hover:text-red-500"
                            >✕</button>
                          )}
                        </div>
                        {expanded && (
                          <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-4">
                            <DetailField label="지원 동기" value={detail?.motive} locked={!canEdit} />
                            <DetailField label="하고 싶은 활동" value={detail?.wish} locked={!canEdit} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        );
      })()}
    </div>
  );
}

function DetailField({ label, value, locked }: { label: string; value?: string; locked: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{locked ? "행정 권한에서 확인할 수 있습니다." : value?.trim() || "입력된 내용이 없습니다."}</p>
    </div>
  );
}
