"use client";

// 설정 — 학기 메타(제목·기간·수료 기준), 팀 CRUD, 회차 CRUD.

import { useState } from "react";
import { useUI } from "@/context/UIContext";
import {
  addSession,
  addTeam,
  removeSession,
  removeTeam,
  updateSemesterMeta,
  updateSession,
  updateTeam,
} from "@/lib/db";
import { SemesterMeta, Session, SessionType, Team } from "@/lib/types";

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
  sessions: Session[];
}

export default function SettingsTab({ sid, meta, teams, sessions }: Props) {
  const { toast, uiConfirm } = useUI();
  const [title, setTitle] = useState(meta?.title ?? "");
  const [minRatePct, setMinRatePct] = useState(Math.round((meta?.completionRule?.minRate ?? 0.7) * 100));
  const [teamName, setTeamName] = useState("");
  const [sessDate, setSessDate] = useState("");
  const [sessLabel, setSessLabel] = useState("");
  const [sessType, setSessType] = useState<SessionType>("정규");

  async function saveMeta() {
    try {
      await updateSemesterMeta(sid, {
        ...(title.trim() ? { title: title.trim() } : {}),
        completionRule: { minRate: Math.min(100, Math.max(0, minRatePct)) / 100 },
      });
      toast("설정이 저장되었습니다", "success");
    } catch (e) {
      toast(`저장 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleAddTeam() {
    if (!teamName.trim()) return;
    try {
      const color = PASTEL_COLORS[teams.length % PASTEL_COLORS.length];
      await addTeam(sid, teamName.trim(), color, teams.length);
      setTeamName("");
    } catch (e) {
      toast(`팀 추가 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function handleAddSession() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessDate)) {
      toast("날짜는 YYYY-MM-DD 형식이어야 합니다", "warning");
      return;
    }
    try {
      await addSession(sid, { date: sessDate, type: sessType, ...(sessLabel.trim() ? { label: sessLabel.trim() } : {}) });
      setSessDate("");
      setSessLabel("");
      setSessType("정규");
    } catch (e) {
      toast(`회차 추가 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  return (
    <div className="grid gap-4">
      {/* 학기 메타 */}
      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold mb-3">학기 설정</h3>
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
          <label className="text-sm flex-1 w-full">
            <span className="text-xs text-gray-500">제목</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={meta?.title ?? ""}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mt-0.5"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-gray-500">수료 기준 (출석점수 %)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={minRatePct}
              onChange={(e) => setMinRatePct(Number(e.target.value))}
              className="w-full sm:w-28 border border-gray-300 rounded-lg px-3 py-2 mt-0.5"
            />
          </label>
          <button onClick={() => void saveMeta()} className="px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 text-sm font-medium">
            저장
          </button>
        </div>
      </section>

      {/* 팀 관리 */}
      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold mb-3">팀 관리</h3>
        <ul className="grid gap-1.5 mb-3">
          {teams.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <span className={`text-sm px-2.5 py-1 rounded-lg ${t.color}`}>{t.name}</span>
              {t.room && <span className="text-xs text-gray-400">{t.room}</span>}
              <input
                aria-label={`${t.name} 모임 장소`}
                defaultValue={t.room ?? ""}
                placeholder="장소"
                onBlur={(e) => {
                  const room = e.target.value.trim();
                  if (room !== (t.room ?? "")) void updateTeam(sid, t.id, { room });
                }}
                className="border border-gray-200 rounded-md px-2 py-1 text-xs w-24"
              />
              <button
                aria-label={`${t.name} 삭제`}
                onClick={async () => {
                  if (await uiConfirm(`'${t.name}' 팀을 삭제할까요? 배치·커리큘럼 표시가 사라집니다.`)) {
                    await removeTeam(sid, t.id);
                  }
                }}
                className="text-xs text-gray-300 hover:text-red-500 ml-auto"
              >
                삭제
              </button>
            </li>
          ))}
          {teams.length === 0 && <li className="text-sm text-gray-400">아직 팀이 없습니다</li>}
        </ul>
        <div className="flex gap-2">
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleAddTeam()}
            placeholder="팀 이름 (예: 예배팀)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={() => void handleAddTeam()}
            disabled={!teamName.trim()}
            className="px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 disabled:opacity-50 text-sm font-medium"
          >
            팀 추가
          </button>
        </div>
      </section>

      {/* 회차 관리 */}
      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="font-semibold mb-3">회차(모임 날짜) 관리</h3>
        <ul className="grid gap-1.5 mb-3">
          {sessions.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="text-xs text-gray-400 w-12">{i + 1}회차</span>
              <span className="tabular-nums">{s.date}</span>
              <select
                aria-label={`${s.date} 유형`}
                value={s.type}
                onChange={(e) => void updateSession(sid, s.id, { type: e.target.value as SessionType })}
                className={`text-xs border rounded-md px-1.5 py-1 ${
                  s.type === "휴강" ? "bg-yellow-50 border-yellow-200" : "border-gray-200"
                }`}
              >
                <option value="정규">정규</option>
                <option value="휴강">휴강</option>
                <option value="행사">행사</option>
              </select>
              {s.label && <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">{s.label}</span>}
              <button
                aria-label={`${s.date} 회차 삭제`}
                onClick={async () => {
                  if (await uiConfirm(`${s.date} 회차를 삭제할까요? 해당 회차 출석 기록은 집계에서 빠집니다.`)) {
                    await removeSession(sid, s.id);
                  }
                }}
                className="text-xs text-gray-300 hover:text-red-500 ml-auto"
              >
                삭제
              </button>
            </li>
          ))}
          {sessions.length === 0 && <li className="text-sm text-gray-400">아직 회차가 없습니다</li>}
        </ul>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="date"
            value={sessDate}
            onChange={(e) => setSessDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={sessLabel}
            onChange={(e) => setSessLabel(e.target.value)}
            placeholder="라벨 (예: 개강예배, 선택)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <select
            aria-label="회차 유형"
            value={sessType}
            onChange={(e) => setSessType(e.target.value as SessionType)}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
          >
            <option value="정규">정규</option>
            <option value="휴강">휴강</option>
            <option value="행사">행사</option>
          </select>
          <button
            onClick={() => void handleAddSession()}
            disabled={!sessDate}
            className="px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 disabled:opacity-50 text-sm font-medium"
          >
            회차 추가
          </button>
        </div>
      </section>
    </div>
  );
}
