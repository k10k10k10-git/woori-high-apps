"use client";

// 설정 — 학기 메타(제목·수료 기준), 사역팀 CRUD, 훈련 반 CRUD, 회차 CRUD.
// 사역팀과 훈련 반은 같은 형태의 다른 축이라 좌우 2열로 나란히 둔다.

import { useState } from "react";
import { useUI } from "@/context/UIContext";
import {
  addSession,
  addTeam,
  addTrainingClass,
  removeSession,
  removeTeam,
  removeTrainingClass,
  updateSemesterMeta,
  updateSessionDates,
  updateSessionKind,
  updateTeam,
  updateTrainingClass,
} from "@/features/semester/db";
import { Application, SemesterMeta, Session, Team, TrainingClass } from "@/features/semester/types";
import { createSettingsDraft, editSettingsDraft, syncSettingsDraft } from "@/features/semester/settingsDraft";
import { teamRemovalImpact } from "@/features/semester/teamRemoval";
import { trainingClassRemovalImpact } from "@/features/semester/trainingClass";
import {
  normalizedSessionEndDate,
  sessionDateLabel,
  sessionDateRangeError,
} from "@/features/semester/sessionDate";
import {
  needsCustomLabel,
  SESSION_KINDS,
  SESSION_KIND_LABEL,
  sessionKindOf,
  sessionValueFor,
  type SessionKind,
} from "@/features/semester/sessionKind";

const PASTEL_COLORS = [
  "bg-blue-100",
  "bg-green-100",
  "bg-yellow-100",
  "bg-purple-100",
  "bg-pink-100",
  "bg-orange-100",
  "bg-teal-100",
  "bg-indigo-100",
];

interface Props {
  sid: string;
  meta: SemesterMeta | null;
  teams: Team[];
  trainingClasses: TrainingClass[];
  sessions: Session[];
  applications: Application[];
}

export default function SettingsTab({ sid, meta, teams, trainingClasses, sessions, applications }: Props) {
  const { toast, uiConfirm } = useUI();
  const [storedDraft, setDraft] = useState(() => createSettingsDraft(sid, meta));
  // meta가 비동기로 도착하거나 sid가 바뀔 때만 렌더 중 파생으로 보정한다.
  // 사용자가 먼저 편집한 dirty draft는 syncSettingsDraft가 그대로 보존한다.
  const draft = syncSettingsDraft(storedDraft, sid, meta);
  if (draft !== storedDraft) setDraft(draft);
  const [teamName, setTeamName] = useState("");
  const [className, setClassName] = useState("");
  const [sessDate, setSessDate] = useState("");
  const [sessEndDate, setSessEndDate] = useState("");
  const [sessKind, setSessKind] = useState<SessionKind>("정규");
  const [sessCustomLabel, setSessCustomLabel] = useState("");
  // 기존 회차의 "직접 입력" 편집 — 한 번에 한 행만 연다
  const [labelDraft, setLabelDraft] = useState<{ sessionId: string; text: string } | null>(null);

  async function saveMeta() {
    try {
      await updateSemesterMeta(sid, {
        ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
        completionRule: { minRate: Math.min(100, Math.max(0, draft.minRatePct)) / 100 },
      });
      toast("설정이 저장되었습니다", "success");
    } catch (e) {
      toast(`저장 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleAddTeam() {
    if (!teamName.trim()) return;
    try {
      await addTeam(sid, teamName.trim(), PASTEL_COLORS[teams.length % PASTEL_COLORS.length], teams.length);
      setTeamName("");
    } catch (e) {
      toast(`팀 추가 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleAddTrainingClass() {
    if (!className.trim()) return;
    try {
      await addTrainingClass(
        sid,
        className.trim(),
        PASTEL_COLORS[(trainingClasses.length + 2) % PASTEL_COLORS.length],
        trainingClasses.length,
      );
      setClassName("");
    } catch (e) {
      toast(`훈련 반 추가 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleAddSession() {
    const rangeError = sessionDateRangeError(sessDate, sessEndDate || undefined);
    if (rangeError) {
      toast(rangeError, "warning");
      return;
    }
    if (needsCustomLabel(sessKind, sessCustomLabel)) {
      toast("직접 입력을 선택했으면 회차 이름을 적어주세요", "warning");
      return;
    }
    try {
      const value = sessionValueFor(sessKind, sessCustomLabel);
      const endDate = normalizedSessionEndDate(sessDate, sessEndDate || undefined);
      await addSession(sid, {
        date: sessDate,
        ...(endDate ? { endDate } : {}),
        type: value.type,
        ...(value.label ? { label: value.label } : {}),
      });
      setSessDate("");
      setSessEndDate("");
      setSessKind("정규");
      setSessCustomLabel("");
    } catch (e) {
      toast(`회차 추가 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleUpdateSessionDates(session: Session, date: string, endDate?: string) {
    const rangeError = sessionDateRangeError(date, endDate);
    if (rangeError) {
      toast(rangeError, "warning");
      return;
    }
    try {
      await updateSessionDates(sid, session.id, date, normalizedSessionEndDate(date, endDate));
    } catch (e) {
      toast(`회차 날짜 변경 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  return (
    <div className="grid gap-4">
      {/* 학기 메타 */}
      <section className="card card-body">
        <h3 className="font-semibold">학기 설정</h3>
        <div className="flex flex-col gap-2 items-start sm:flex-row sm:items-end">
          <label className="w-full flex-1 text-sm">
            <span className="text-xs text-slate-500">제목</span>
            <input
              value={draft.title}
              onChange={(e) => setDraft((current) => editSettingsDraft(current, { title: e.target.value }))}
              placeholder={meta?.title ?? ""}
              className="input mt-0.5"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-slate-500">수료 기준 (출석점수 %)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={draft.minRatePct}
              onChange={(e) => setDraft((current) => editSettingsDraft(current, { minRatePct: Number(e.target.value) }))}
              className="input mt-0.5 sm:w-28"
            />
          </label>
          <button onClick={() => void saveMeta()} className="btn-primary justify-center">저장</button>
        </div>
      </section>

      {/* 사역팀 · 훈련 반 — 같은 형태의 두 축을 좌우로 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-body min-w-0 overflow-hidden">
          <div>
            <h3 className="font-semibold">사역팀 관리</h3>
            <p className="mt-0.5 text-xs text-slate-400">배치·커리큘럼·출석이 이 목록을 따릅니다.</p>
          </div>
          <ul className="grid gap-1.5">
            {teams.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <span className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm ${t.color}`}>{t.name}</span>
                {/* 장소·담당 입력은 훈련 관리와 같은 고정 폭으로 맞춘다 — 팀 이름 길이에 따라
                    입력칸 폭이 제각각으로 늘어나던 문제. 폭은 감싼 div가 정한다(.input은 width:100%). */}
                <div className="ml-auto w-28 shrink-0 sm:w-32">
                  <input
                    aria-label={`${t.name} 모임 장소`}
                    defaultValue={t.room ?? ""}
                    placeholder="장소"
                    onBlur={(e) => {
                      const room = e.target.value.trim();
                      if (room !== (t.room ?? "")) void updateTeam(sid, t.id, { room });
                    }}
                    className="input px-2 py-1 text-xs"
                  />
                </div>
                <button
                  aria-label={`${t.name} 삭제`}
                  onClick={async () => {
                    const impact = teamRemovalImpact(applications, t.id);
                    if (await uiConfirm(
                      `'${t.name}' 팀을 삭제할까요?\n\n`
                      + `배치 ${impact.assigned}명·1지망 ${impact.firstChoice}명·2지망 ${impact.secondChoice}명의 참조가 함께 정리되고, `
                      + "배치 인원은 미배정으로 돌아갑니다.",
                    )) {
                      try {
                        await removeTeam(sid, t.id);
                        toast("팀을 삭제하고 연결된 배치·지망을 정리했습니다", "success");
                      } catch (e) {
                        toast(`팀 삭제 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
                      }
                    }
                  }}
                  className="shrink-0 whitespace-nowrap text-xs text-slate-300 hover:text-red-500"
                >
                  삭제
                </button>
              </li>
            ))}
            {teams.length === 0 && <li className="text-sm text-slate-400">아직 사역팀이 없습니다</li>}
          </ul>
          <div className="flex gap-2">
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAddTeam()}
              placeholder="팀 이름 (예: 예배팀)"
              aria-label="새 사역팀 이름"
              className="input min-w-0 flex-1 text-sm"
            />
            <button onClick={() => void handleAddTeam()} disabled={!teamName.trim()} className="btn-primary justify-center">
              팀 추가
            </button>
          </div>
        </section>

        <section className="card card-body min-w-0 overflow-hidden">
          <div>
            <h3 className="font-semibold">훈련 관리</h3>
            <p className="mt-0.5 text-xs text-slate-400">사역팀 신청의 전제입니다. 접수 화면에서 훈련 반을 고릅니다.</p>
          </div>
          <ul className="grid gap-1.5">
            {trainingClasses.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm ${c.color}`}>{c.name}</span>
                {/* 사역팀 관리와 같은 고정 폭 */}
                <div className="ml-auto w-28 shrink-0 sm:w-32">
                  <input
                    aria-label={`${c.name} 담당`}
                    defaultValue={c.teacher ?? ""}
                    placeholder="담당"
                    onBlur={(e) => {
                      const teacher = e.target.value.trim();
                      if (teacher !== (c.teacher ?? "")) void updateTrainingClass(sid, c.id, { teacher });
                    }}
                    className="input px-2 py-1 text-xs"
                  />
                </div>
                <button
                  aria-label={`${c.name} 삭제`}
                  onClick={async () => {
                    const impact = trainingClassRemovalImpact(applications, c.id);
                    if (await uiConfirm(
                      `'${c.name}' 훈련 반을 삭제할까요?\n\n`
                      + `배정된 ${impact.enrolled}명의 훈련 반이 비워집니다(신청 자체는 남습니다).`,
                    )) {
                      try {
                        await removeTrainingClass(sid, c.id);
                        toast("훈련 반을 삭제하고 배정을 정리했습니다", "success");
                      } catch (e) {
                        toast(`훈련 반 삭제 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
                      }
                    }
                  }}
                  className="shrink-0 whitespace-nowrap text-xs text-slate-300 hover:text-red-500"
                >
                  삭제
                </button>
              </li>
            ))}
            {trainingClasses.length === 0 && <li className="text-sm text-slate-400">아직 훈련 반이 없습니다</li>}
          </ul>
          <div className="flex gap-2">
            <input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAddTrainingClass()}
              placeholder="훈련 반 이름 (예: 새가족반)"
              aria-label="새 훈련 반 이름"
              className="input min-w-0 flex-1 text-sm"
            />
            <button onClick={() => void handleAddTrainingClass()} disabled={!className.trim()} className="btn-primary justify-center">
              반 추가
            </button>
          </div>
        </section>
      </div>

      {/* 회차 관리 */}
      <section className="card card-body">
        <h3 className="font-semibold">회차(모임 날짜) 관리</h3>
        <ul className="grid gap-1.5">
          {sessions.map((s, i) => {
            const { kind, customLabel } = sessionKindOf(s);
            const editingCustom = labelDraft?.sessionId === s.id;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-12 shrink-0 text-xs text-slate-400">{i + 1}회차</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="w-36 sm:w-40">
                    <input
                      type="date"
                      value={s.date}
                      onChange={(e) => void handleUpdateSessionDates(s, e.target.value, s.endDate)}
                      aria-label={`${i + 1}회차 시작일`}
                      className="input text-xs tabular-nums"
                    />
                  </div>
                  <span className="text-slate-400" aria-hidden="true">~</span>
                  <div className="w-36 sm:w-40">
                    <input
                      type="date"
                      value={s.endDate ?? ""}
                      min={s.date}
                      onChange={(e) => void handleUpdateSessionDates(s, s.date, e.target.value || undefined)}
                      aria-label={`${i + 1}회차 종료일 (선택)`}
                      className="input text-xs tabular-nums"
                    />
                  </div>
                </div>
                <select
                  aria-label={`${sessionDateLabel(s)} 유형`}
                  value={editingCustom ? "직접" : kind}
                  onChange={(e) => {
                    const nextKind = e.target.value as SessionKind;
                    if (nextKind === "직접") {
                      setLabelDraft({ sessionId: s.id, text: customLabel });
                      return;
                    }
                    setLabelDraft(null);
                    void updateSessionKind(sid, s.id, sessionValueFor(nextKind));
                  }}
                  className={`rounded-md border px-1.5 py-1 text-xs ${
                    s.type === "휴강" ? "border-yellow-200 bg-yellow-50" : "border-slate-200"
                  }`}
                >
                  {SESSION_KINDS.map((option) => (
                    <option key={option} value={option}>{SESSION_KIND_LABEL[option]}</option>
                  ))}
                </select>
                {editingCustom ? (
                  <input
                    autoFocus
                    aria-label={`${sessionDateLabel(s)} 회차 이름`}
                    value={labelDraft.text}
                    placeholder="회차 이름"
                    onChange={(e) => setLabelDraft({ sessionId: s.id, text: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setLabelDraft(null); }}
                    onBlur={() => {
                      const text = labelDraft.text.trim();
                      setLabelDraft(null);
                      if (!text) return; // 비우면 변경 없이 원래 유형 유지
                      void updateSessionKind(sid, s.id, sessionValueFor("직접", text));
                    }}
                    className="input w-40 px-2 py-1 text-xs"
                  />
                ) : (
                  s.label && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s.label}</span>
                )}
                <button
                  aria-label={`${sessionDateLabel(s)} 회차 삭제`}
                  onClick={async () => {
                    if (await uiConfirm(`${sessionDateLabel(s)} 회차를 삭제할까요? 해당 회차 출석 기록은 집계에서 빠집니다.`)) {
                      await removeSession(sid, s.id);
                    }
                  }}
                  className="ml-auto shrink-0 text-xs text-slate-300 hover:text-red-500"
                >
                  삭제
                </button>
              </li>
            );
          })}
          {sessions.length === 0 && <li className="text-sm text-slate-400">아직 회차가 없습니다</li>}
        </ul>
        {/* .input은 레이어 밖 규칙(width:100%)이라 유틸리티 w-*를 이긴다 → 폭은 감싼 div로 준다 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="sm:w-44">
            <span className="mb-1 block text-xs text-slate-500">시작일</span>
            <input
              type="date"
              value={sessDate}
              onChange={(e) => setSessDate(e.target.value)}
              aria-label="회차 시작일"
              className="input text-sm"
            />
          </label>
          <label className="sm:w-44">
            <span className="mb-1 block text-xs text-slate-500">종료일 (선택)</span>
            <input
              type="date"
              value={sessEndDate}
              min={sessDate || undefined}
              onChange={(e) => setSessEndDate(e.target.value)}
              aria-label="회차 종료일 (선택)"
              className="input text-sm"
            />
          </label>
          <label className="sm:w-52">
            <span className="mb-1 block text-xs text-slate-500">회차 유형</span>
            <select
              aria-label="회차 유형"
              value={sessKind}
              onChange={(e) => setSessKind(e.target.value as SessionKind)}
              className="input text-sm"
            >
              {SESSION_KINDS.map((option) => (
                <option key={option} value={option}>{SESSION_KIND_LABEL[option]}</option>
              ))}
            </select>
          </label>
          {sessKind === "직접" && (
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs text-slate-500">회차 이름</span>
              <input
                value={sessCustomLabel}
                onChange={(e) => setSessCustomLabel(e.target.value)}
                placeholder="예: 철야기도회"
                aria-label="회차 이름 직접 입력"
                className="input min-w-0 flex-1 text-sm"
              />
            </label>
          )}
          <button onClick={() => void handleAddSession()} disabled={!sessDate} className="btn-primary justify-center">
            회차 추가
          </button>
        </div>
        <p className="text-xs text-slate-400">1박 2일 일정은 시작일과 종료일을 함께 고릅니다. 출석 회차는 한 번만 집계되며, 만점에서 빠지는 유형은 휴강뿐입니다.</p>
      </section>
    </div>
  );
}
