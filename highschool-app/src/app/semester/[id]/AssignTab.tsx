"use client";

// 팀 배치 — 미배정 신청자를 팀에 배정. 지망 칩 표시, 팀별 인원 집계.
// 저장은 신청 문서 단일 경로 update (전체 덮어쓰기 없음).

import { useEffect, useMemo, useState } from "react";
import { useUI } from "@/context/UIContext";
import { describeApplicant, subscribeApplicationsPrivate, updateApplication } from "@/features/semester/db";
import { STAFF_BU } from "@/features/semester/applicant";
import { applicantSortKey } from "@/features/semester/applicant";
import { useSemesterCanEdit } from "@/features/semester/EditContext";
import { Application, ApplicationPrivate, Team, TrainingClass } from "@/features/semester/types";

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

export default function AssignTab({ sid, teams, trainingClasses, applications, teamById }: Props) {
  const { toast } = useUI();
  const canEdit = useSemesterCanEdit();
  const [privateMap, setPrivateMap] = useState<Record<string, ApplicationPrivate>>({});
  const [detailTeamId, setDetailTeamId] = useState<string | null>(null);
  const [expandedApplicantId, setExpandedApplicantId] = useState<string | null>(null);

  useEffect(() => {
    if (!canEdit) return;
    return subscribeApplicationsPrivate(sid, setPrivateMap, (error) => toast(`상세정보 로드 실패: ${error.message}`, "error"));
  }, [sid, canEdit, toast]);

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
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {a.name}
                    <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(a)}</span>
                  </span>
                  <select
                    aria-label={`${a.name} 팀 배치`}
                    value=""
                    disabled={!canEdit}
                    onChange={(e) => e.target.value && void assign(a, e.target.value)}
                    className="input h-8 w-28 px-1.5 py-1 text-xs"
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
          return (
            <div key={t.id} className="card overflow-hidden">
              <div className={`flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold ${t.color}`}>
                <span>{t.name} <span className="font-normal text-slate-600">{members.length}명</span></span>
                <button
                  onClick={() => {
                    setDetailTeamId(t.id);
                    setExpandedApplicantId(null);
                  }}
                  className="rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
                >
                  명단 상세
                </button>
              </div>
              <ul className="grid gap-1 p-3">
                {members.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-slate-50">
                    <span>
                      {a.name}
                      <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(a)}</span>
                      {a.choice1 === t.id && <span className="ml-1 text-xs" style={{ color: "var(--color-primary)" }}>★</span>}
                    </span>
                    {canEdit && (
                      <button
                        aria-label={`${a.name} 배치 해제`}
                        onClick={() => void assign(a, "")}
                        className="text-xs text-slate-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
                {members.length === 0 && <li className="px-2 py-1 text-xs text-slate-300">아직 없음</li>}
              </ul>
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
                  <span>
                    {a.name}
                    <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(a)}</span>
                  </span>
                  <select
                    aria-label={`${a.name} 훈련 반 배정`}
                    value=""
                    disabled={!canEdit}
                    onChange={(e) => e.target.value && void assignTraining(a, e.target.value)}
                    className="input h-8 w-28 px-1.5 py-1 text-xs"
                  >
                    <option value="">배정…</option>
                    {trainingClasses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {trainingClasses.map((c) => {
              const members = [...(byTrainingClass.get(c.id) ?? [])].sort(byApplicant);
              return (
                <div key={c.id} className="card overflow-hidden">
                  <div className={`px-4 py-2.5 text-sm font-semibold ${c.color}`}>
                    {c.name} <span className="font-normal text-slate-600">{members.length}명</span>
                    {c.teacher && <span className="ml-1 text-xs font-normal text-slate-500">담당 {c.teacher}</span>}
                  </div>
                  <ul className="grid gap-1 p-3">
                    {members.map((a) => (
                      <li key={a.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-slate-50">
                        <span>
                          {a.name}
                          <span className="ml-1.5 text-xs text-slate-400">{describeApplicant(a)}</span>
                        </span>
                        {canEdit && (
                          <button
                            aria-label={`${a.name} 훈련 반 해제`}
                            onClick={() => void assignTraining(a, "")}
                            className="text-xs text-slate-400 hover:text-red-500"
                          >
                            ✕
                          </button>
                        )}
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
                  <p className="mt-1 text-xs text-slate-400">학생 이름을 누르면 지원 동기와 하고 싶은 활동을 확인할 수 있습니다.</p>
                </div>
                <button onClick={() => setDetailTeamId(null)} aria-label="닫기" className="rounded-lg px-2 py-1 text-lg text-slate-400 hover:bg-slate-100">✕</button>
              </div>
              <ul className="grid gap-2">
                {members.map((application) => {
                  const detail = canEdit ? privateMap[application.id] : undefined;
                  const expanded = expandedApplicantId === application.id;
                  return (
                    <li key={application.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <button
                        onClick={() => setExpandedApplicantId(expanded ? null : application.id)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <span>
                          <strong className="text-sm text-slate-800">{application.name}</strong>
                          <span className="ml-2 text-xs text-slate-400">{describeApplicant(application)}</span>
                          {application.choice1 === detailTeamId && <span className="ml-1 text-xs text-emerald-600">★ 1지망</span>}
                        </span>
                        <span className="text-xs text-slate-400">{expanded ? "접기" : "상세 보기"}</span>
                      </button>
                      {expanded && (
                        <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:grid-cols-2">
                          <DetailField label="본인 연락처" value={canEdit ? detail?.phone : undefined} locked={!canEdit} />
                          <DetailField label="보호자 연락처" value={canEdit ? detail?.parentPhone : undefined} locked={!canEdit} />
                          <DetailField label="지원 동기" value={canEdit ? detail?.motive : undefined} locked={!canEdit} wide />
                          <DetailField label="하고 싶은 활동" value={canEdit ? detail?.wish : undefined} locked={!canEdit} wide />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        );
      })()}
    </div>
  );
}

function DetailField({ label, value, locked, wide = false }: { label: string; value?: string; locked: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{locked ? "행정 권한에서 확인할 수 있습니다." : value?.trim() || "입력된 내용이 없습니다."}</p>
    </div>
  );
}
