"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import { ArrowsClockwise, CloudArrowDown, Database, ShieldCheck } from "@phosphor-icons/react";
import { Retreat, Participant, Student, SyncDuplicateGroup } from "@/lib/types";
import { fetchSheetParticipants } from "@/lib/sheetsParser";
import { getRetreatStudentsByYear, subscribeToRetreatStudentsByYear, saveParticipants, getParticipants, getParticipantsWithContacts, subscribeToParticipants, subscribeToParticipantsWithContacts, backupParticipants, subscribeToCellColors, saveSyncDuplicates, getSyncDuplicates, updateParticipant, applyRematch, getParticipantsBackups, restoreParticipantsBackup } from "@/lib/db";
import { findStudent, normalizeName, stripSuffix } from "@/lib/studentMatcher";
import { LATE_REGISTRANT_COLORS } from "@/lib/constants";
import { buildRematchPlan, buildSheetSyncPlan, type ParticipantBulkPlan } from "@/lib/participantSyncPreview";
import WorkspaceSkeleton from "@/components/WorkspaceSkeleton";
import RetreatParticipantMobileList from "./RetreatParticipantMobileList";
import { useIsDesktop } from "@/lib/useIsDesktop";
import DuplicateApplicationsSection from "./DuplicateApplicationsSection";
import BackupRestoreButton from "./BackupRestoreButton";
import ParticipantSyncDialog from "./ParticipantSyncDialog";

interface Props {
  retreat: Retreat;
}

/** raw(시트 전체 열, 민감정보 포함 가능)를 제거 — 공용 participants 경로에 저장하기 전 항상 거쳐야 함 */
function stripRaw(p: Participant): Omit<Participant, "raw"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- raw는 의도적으로 버림
  const { raw: _raw, ...rest } = p;
  return rest;
}

export default function ParticipantsTab({ retreat }: Props) {
  // 데스크톱 표에는 연락처가 들어 있어 CSS로 숨기지 않고 렌더를 가른다.
  const isDesktop = useIsDesktop();
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [students, setStudents] = useState<Record<string, Student>>({});
  const [cellColors, setCellColorsState] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState<string>("전체");
  const [gradeFilter, setGradeFilter] = useState<string>("전체");
  const [sortBy, setSortBy] = useState<"name" | "registeredAt">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<SyncDuplicateGroup[]>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [bulkPlan, setBulkPlan] = useState<ParticipantBulkPlan | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pData, sData, savedDups] = await Promise.all([
        isDesktop ? getParticipantsWithContacts(retreat.id) : getParticipants(retreat.id),
        getRetreatStudentsByYear(retreat.id, retreat.year),
        // 중복 후보는 retreatsPrivate에 있어 조회 전용 역할(스탭팀장·이가드팀)에게는 닫혀 있다.
        // 보조 정보라 실패해도 명단 자체는 보여야 한다 — 여기서 삼키고 빈 목록으로 진행한다.
        getSyncDuplicates(retreat.id).catch(() => []),
      ]);
      setParticipants(pData);
      setStudents(sData);
      // participantKey가 없는 옛 형식 중복 데이터(이번 기능 추가 이전 동기화분)는
      // 현재 유지된 항목을 participants에서 역으로 찾아 보정 — 재동기화 없이도 바로 선택 가능하게.
      const resolvedDups = savedDups.map(d => {
        if (d.participantKey) return d;
        const targetEntry = d.entries[d.resolvedIndex ?? 0];
        if (!targetEntry) return d;
        const ms = findStudent(targetEntry, sData);
        const foundKey = Object.entries(pData).find(([, p]) => {
          if (ms?.id && p.studentId) return p.studentId === ms.id;
          return p.name === targetEntry.name && p.bu === targetEntry.bu
            && p.grade === targetEntry.grade && p.class === targetEntry.class;
        })?.[0];
        return foundKey ? { ...d, participantKey: foundKey } : d;
      });
      setDuplicates(resolvedDups);
    } catch (e) {
      setError(e instanceof Error ? e.message : "참가자 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [isDesktop, retreat.id, retreat.year]);

  useEffect(() => {
    void loadData();
    const subscribeParticipants = isDesktop ? subscribeToParticipantsWithContacts : subscribeToParticipants;
    const unsubParticipants = subscribeParticipants(retreat.id, setParticipants,
      e => setError(prev => prev || `참가자 구독 실패: ${e.message}`));
    const unsubStudents = subscribeToRetreatStudentsByYear(retreat.id, retreat.year, setStudents,
      e => setError(prev => prev || `출석부 학생 구독 실패: ${e.message}`));
    const unsubColors = subscribeToCellColors(retreat.id, setCellColorsState,
      e => setError(prev => prev || `구독 실패: ${e.message}`));
    return () => { unsubParticipants(); unsubStudents(); unsubColors(); };
  }, [isDesktop, loadData, retreat.id, retreat.year]);

  async function prepareSheetSync() {
    if (!retreat.sheetId) {
      setError("먼저 우측 상단의 시트 설정에서 응답 시트를 연결해 주세요.");
      return;
    }
    setSyncing(true);
    setError("");
    try {
      const [source, existing] = await Promise.all([
        fetchSheetParticipants(retreat.sheetId, retreat.sheetGid),
        getParticipantsWithContacts(retreat.id),
      ]);
      setBulkPlan(buildSheetSyncPlan(source, students, existing));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "동기화 계획을 만들지 못했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  /** 중복 신청 중 다른 항목을 "유지"로 선택 — 기본은 최초 신청(index 0)이지만 관리자가 바꿀 수 있다. */
  async function chooseDuplicateEntry(dupIndex: number, entryIndex: number) {
    const dup = duplicates[dupIndex];
    if (!dup || !dup.participantKey) return;
    const chosen = dup.entries[entryIndex];
    if (!chosen) return;
    const ms = findStudent(chosen, students);
    // 다른 신청 항목을 선택해도 관리자가 건강 특이사항 탭에서 수정한 extra는 유지
    const prevExtra = participants[dup.participantKey]?.extra;
    const updated: Participant = {
      ...stripRaw(chosen),
      studentId: ms?.id ?? null,
      phone: chosen.phone || ms?.phone || null,
      pPhone: ms?.pPhone ?? null,
      ...(prevExtra ? { extra: prevExtra } : {}),
    };
    try {
      await updateParticipant(retreat.id, dup.participantKey, updated);
      setParticipants(prev => ({ ...prev, [dup.participantKey!]: updated }));
      const nextDuplicates = duplicates.map((d, i) => i === dupIndex ? { ...d, resolvedIndex: entryIndex } : d);
      setDuplicates(nextDuplicates);
      await saveSyncDuplicates(retreat.id, nextDuplicates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "선택을 반영하지 못했습니다.");
    }
  }

  async function prepareRematch() {
    setSyncing(true);
    setError("");
    try {
      const freshStudents = await getRetreatStudentsByYear(retreat.id, retreat.year);
      setBulkPlan(buildRematchPlan(participants, freshStudents));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "재매칭 계획을 만들지 못했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  async function applyBulkPlan() {
    if (!bulkPlan) return;
    setSyncing(true);
    setError("");
    try {
      // 적용 직전 공개 명단과 비공개 연락처를 같은 시점으로 백업한다.
      await backupParticipants(retreat.id);
      if (bulkPlan.kind === "sheet") {
        await saveSyncDuplicates(retreat.id, bulkPlan.duplicates);
        await saveParticipants(retreat.id, bulkPlan.participants);
        setDuplicates(bulkPlan.duplicates);
        setParticipants(bulkPlan.participants);
        setError(`✅ 시트 동기화 완료: ${bulkPlan.summary.nextCount}명 · 미매칭 ${bulkPlan.summary.unmatchedCount}명`);
      } else {
        await applyRematch(retreat.id, bulkPlan.updates);
        setParticipants((previous) => {
          const next = { ...previous };
          Object.entries(bulkPlan.updates).forEach(([key, update]) => {
            if (next[key]) next[key] = { ...next[key], ...update };
          });
          return next;
        });
        setStudents(bulkPlan.students);
        setError(`✅ 재매칭 완료: ${bulkPlan.summary.matchedCount}/${bulkPlan.summary.nextCount}명 · 변경 ${bulkPlan.summary.changedCount}명`);
      }
      setBulkPlan(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "명단 반영 중 오류가 발생했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  const list = useMemo(() => {
    let arr = Object.entries(participants).map(([k, v]) => ({ key: k, ...v }));
    if (buFilter !== "전체") arr = arr.filter(p => p.bu === buFilter);
    if (gradeFilter !== "전체") arr = arr.filter(p => String(p.grade) === gradeFilter);
    if (search) arr = arr.filter(p => p.name.includes(search));
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "registeredAt") {
      const parseKoDate = (s: string): number => {
        // "2026. 6. 21 오전 9:24:18" or "2026. 6. 20 오후 10:55:55"
        const m = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\s*(오전|오후)\s*(\d{1,2}):(\d{2}):?(\d{2})?/);
        if (!m) return 0;
        let h = parseInt(m[5]);
        if (m[4] === "오후" && h < 12) h += 12;
        if (m[4] === "오전" && h === 12) h = 0;
        return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), h, parseInt(m[6]), parseInt(m[7] || "0")).getTime();
      };
      return arr.sort((a, b) => dir * (parseKoDate(a.registeredAt || "") - parseKoDate(b.registeredAt || "")));
    }
    return arr.sort((a, b) => dir * a.name.localeCompare(b.name, "ko"));
  }, [participants, search, buFilter, gradeFilter, sortBy, sortDir]);

  // 신청 정보 vs 출석부 DB 불일치 탐지
  const mismatches = useMemo(() => {
    const allStudents = Object.values(students);
    return Object.entries(participants).flatMap(([key, p]) => {
      if (!p.studentId) return [];
      const s = students[p.studentId];
      if (!s) return [];
      const pBuNum = p.bu?.includes("1") ? 1 : p.bu?.includes("2") ? 2 : 0;
      const diff: string[] = [];
      if (pBuNum && s.buNum && pBuNum !== s.buNum) diff.push("부서");
      if (p.grade && s.grade && p.grade !== s.grade) diff.push("학년");
      if (p.class && s.class && p.class !== s.class) diff.push("반");
      if (diff.length === 0) return [];
      // 동명이인: 접미사(A/B 등) 제거 후 같은 이름을 가진 모든 DB 학생 목록
      const pNameNorm = stripSuffix(normalizeName(p.name.trim()));
      const allMatches = allStudents.filter(st => stripSuffix(normalizeName(st.name)) === pNameNorm);
      return [{
        key,
        name: p.name,
        form: { bu: p.bu, grade: p.grade, class: p.class },
        dbMatched: { bu: s.buNum === 1 ? "1부" : "2부", grade: s.grade, class: s.class },
        dbAll: allMatches.map(st => ({ bu: st.buNum === 1 ? "1부" : "2부", grade: st.grade, class: st.class })),
        diff,
      }];
    }).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [participants, students]);

  const mismatchKeys = useMemo(() => new Set(mismatches.map(m => m.key)), [mismatches]);

  // 색칠된 DB 학생 인덱스 (정규화 이름 → 색칠 정보) — 수동 매칭 판정용
  const coloredStudents = useMemo(() => {
    const map = new Map<string, { color: string; bu: string; grade: number; cls: number }[]>();
    const normName = (n: string) => stripSuffix(normalizeName(n));
    Object.entries(cellColors).forEach(([sid, color]) => {
      const s = students[sid];
      if (!s) return;
      const k = normName(s.name);
      const arr = map.get(k) ?? [];
      arr.push({ color, bu: s.buNum === 1 ? "1부" : "2부", grade: s.grade, cls: s.class });
      map.set(k, arr);
    });
    return map;
  }, [cellColors, students]);

  // 자동 매칭 불가 참가자 전체 — studentId가 없는 모든 인원, 사유 분류
  // 행정팀이 신청자 명단 탭에서 수기로 색칠했으면(이름 일치) "수동 매칭 성공"으로 판정
  const ambiguousParticipants = useMemo(() => {
    const allStudents = Object.values(students);
    const normName = (n: string) => stripSuffix(normalizeName(n));
    return Object.entries(participants).flatMap(([key, p]) => {
      if (p.studentId) return [];
      const pNorm = normName(p.name.trim());
      const matches = allStudents.filter(s => normName(s.name) === pNorm);
      const reason = matches.length === 0 ? "DB 미등록"
                   : matches.length >= 2  ? "동명이인"
                   : "정보 불일치"; // 1명이지만 학년/반 달라서 매칭 안 됨
      // 수동 매칭: 색칠된 동명 학생 찾기 (부서 일치 우선, 없으면 첫 후보)
      const colored = coloredStudents.get(pNorm) ?? [];
      const pBu = p.bu?.includes("1") ? "1부" : p.bu?.includes("2") ? "2부" : "";
      const resolvedColor = colored.find(c => c.bu === pBu) ?? colored[0] ?? null;
      return [{
        key,
        name: p.name,
        form: { bu: p.bu, grade: p.grade, class: p.class },
        dbAll: matches.map(s => ({ bu: s.buNum === 1 ? "1부" : "2부", grade: s.grade, class: s.class })),
        reason,
        resolvedColor,
      }];
    }).sort((a, b) => {
      // 미해결(수동 매칭 안 됨) 먼저, 그 안에서 이름순
      const ra = a.resolvedColor ? 1 : 0, rb = b.resolvedColor ? 1 : 0;
      return ra - rb || a.name.localeCompare(b.name, "ko");
    });
  }, [participants, students, coloredStudents]);

  const ambiguousKeys = useMemo(() => new Set(ambiguousParticipants.map(a => a.key)), [ambiguousParticipants]);
  const unresolvedAmbiguous = useMemo(() => ambiguousParticipants.filter(a => !a.resolvedColor).length, [ambiguousParticipants]);
  const manualMatchedCount = ambiguousParticipants.length - unresolvedAmbiguous;

  // 후기 신청자: 셀 색칠되었으나 구글폼 미신청인 학생 (blue/orange만 — red는 취소이므로 제외)
  // 단, 폼 신청은 했으나 자동매칭 실패 → 수동 색칠로 매칭된 인원은 후기 신청자가 아니므로 제외
  const lateRegistrants = useMemo(() => {
    const participantStudentIds = new Set(Object.values(participants).map(p => p.studentId).filter(Boolean));
    const normName = (n: string) => stripSuffix(normalizeName(n));
    const unmatchedFormNames = new Set(
      Object.values(participants).filter(p => !p.studentId).map(p => normName(p.name.trim()))
    );
    return Object.entries(cellColors)
      .filter(([sid, color]) => LATE_REGISTRANT_COLORS.has(color) && !participantStudentIds.has(sid) && students[sid]
        && !unmatchedFormNames.has(normName(students[sid].name)))
      .map(([sid, color]) => {
        const s = students[sid];
        return {
          sid,
          name: s.name,
          bu: s.buNum === 1 ? "1부" : "2부",
          grade: s.grade,
          cls: s.class,
          phone: s.phone,
          color,
        };
      })
      .sort((a, b) => a.bu.localeCompare(b.bu) || a.grade - b.grade || a.cls - b.cls || a.name.localeCompare(b.name, "ko"));
  }, [cellColors, participants, students]);

  const [showMismatch, setShowMismatch] = useState(true);

  const allParts = Object.values(participants);
  const matched = allParts.filter(p => p.studentId).length;
  // 수동 매칭(색칠)된 인원도 매칭 성공으로 합산
  const total = matched + manualMatchedCount;
  const bu1 = allParts.filter(p => p.bu?.includes("1") && p.studentId).length;
  const bu2 = allParts.filter(p => p.bu?.includes("2") && p.studentId).length;
  // 미매칭 = 자동·수동 모두 안 된 인원
  const unmatched = unresolvedAmbiguous;

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 mb-6">
        {[
          { label: "전체", value: total, color: "tag-blue" },
          { label: "1부", value: bu1, color: "tag-green" },
          { label: "2부", value: bu2, color: "tag-purple" },
          { label: "수동", value: manualMatchedCount, color: manualMatchedCount > 0 ? "tag-green" : "tag-gray" },
          { label: "미매칭", value: unmatched, color: unmatched === 0 ? "tag-green" : "tag-yellow" },
        ].map(s => (
          <div key={s.label} className="card p-2.5 sm:p-4 text-center">
            <div className="text-lg sm:text-2xl font-bold text-slate-800">{s.value}</div>
            <div className={`tag ${s.color} mt-1`}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 검색과 필터는 항상 노출하고, 저빈도·고위험 명단 도구는 점진적으로 연다. */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 gap-2">
          <input className="input flex-1" style={{minWidth: 120}} placeholder="이름 검색..." value={search}
            onChange={e => setSearch(e.target.value)} />
          <select className="input" style={{width: 80}} value={buFilter} onChange={e => setBuFilter(e.target.value)}>
            <option>전체</option>
            <option>1부</option>
            <option>2부</option>
          </select>
          <select className="input" style={{width: 90}} value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}>
            <option>전체</option>
            <option value="1">1학년</option>
            <option value="2">2학년</option>
            <option value="3">3학년</option>
          </select>
        </div>
      </div>

      <details className="mb-4 rounded-xl border border-slate-200 bg-white">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-700">
          <span className="flex items-center gap-2"><Database aria-hidden="true" size={18} weight="duotone" />명단 관리 도구</span>
          <span className="text-xs font-normal text-slate-400">동기화·재매칭·복구</span>
        </summary>
        <div className="border-t border-slate-200 p-3 sm:p-4">
          <p className="mb-3 text-xs leading-5 text-slate-500">
            <strong className="font-semibold text-slate-600">구글시트 동기화</strong>는 신청 응답 시트를 다시 읽어 이 명단을 최신 상태로 맞춥니다.{" "}
            <strong className="font-semibold text-slate-600">DB 재매칭</strong>은 지금 명단을 학생 출석부와 다시 대조해, 이름이나 반이 바뀌어 끊어진 연결을 이어 붙입니다.{" "}
            둘 다 바뀔 인원을 먼저 보여주고, 승인하면 백업한 뒤 반영합니다.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button onClick={prepareRematch} disabled={syncing || Object.keys(participants).length === 0} className="btn-secondary justify-center text-xs sm:text-sm">
              <ArrowsClockwise className={syncing ? "animate-spin" : ""} aria-hidden="true" size={17} />
              {syncing ? "계획 계산 중…" : "DB 재매칭 검토"}
            </button>
            <button onClick={prepareSheetSync} disabled={syncing} className="btn-primary justify-center text-xs sm:text-sm">
              <CloudArrowDown aria-hidden="true" size={17} weight="duotone" />
              {syncing ? "계획 계산 중…" : "구글시트 동기화 검토"}
            </button>
            <div className="sm:ml-auto">
              <BackupRestoreButton
                label="참가자 명단"
                disabled={syncing}
                loadBackups={() => getParticipantsBackups(retreat.id)}
                restore={(key) => restoreParticipantsBackup(retreat.id, key)}
              />
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
            <ShieldCheck className="mt-0.5 shrink-0" aria-hidden="true" size={16} weight="duotone" />
            <span>최근 5개 백업을 보관하며 공개 명단과 비공개 연락처를 같은 시점으로 복구합니다.</span>
          </div>
        </div>
      </details>

      {error && (
        <div className={`rounded-lg p-3 text-sm mb-4 whitespace-pre-line ${error.startsWith("✅") ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {error.startsWith("✅") ? "" : "⚠ "}{error}
          {error.includes("웹에 게시") && (
            <div className="mt-2 text-xs">
              Google Sheets → 파일 → 공유 → 웹에 게시 → CSV 형식으로 게시하세요.
            </div>
          )}
        </div>
      )}

      <DuplicateApplicationsSection
        duplicates={duplicates}
        expanded={showDuplicates}
        isDesktop={isDesktop}
        onToggle={() => setShowDuplicates(value => !value)}
        onChoose={chooseDuplicateEntry}
      />

      {bulkPlan && (
        <ParticipantSyncDialog
          plan={bulkPlan}
          applying={syncing}
          onCancel={() => { if (!syncing) setBulkPlan(null); }}
          onApply={() => void applyBulkPlan()}
        />
      )}

      {/* 불일치 / 미매칭 / 수동매칭 — 항상 표시 */}
      <div className="mb-4 border border-orange-200 rounded-lg overflow-x-auto">
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-orange-50 text-left"
          onClick={() => setShowMismatch(v => !v)}
        >
          <span className="text-sm font-semibold text-orange-700">
            ⚠ 신청 정보와 출석부 DB 불일치 {mismatches.length}명
            · 자동 매칭 불가 {unresolvedAmbiguous}명
            {manualMatchedCount > 0 && <span className="ml-1 text-green-600">· ✓ 수동 매칭 {manualMatchedCount}명</span>}
            {mismatches.length === 0 && unresolvedAmbiguous === 0 && manualMatchedCount === 0 && (
              <span className="ml-2 font-normal text-green-500 text-xs">이상 없음 ✓</span>
            )}
            {(mismatches.length > 0 || unresolvedAmbiguous > 0) && (
              <span className="ml-2 font-normal text-orange-500 text-xs">부서·학년·반 오기재 가능성</span>
            )}
          </span>
          <span className="text-orange-400 text-xs">{showMismatch ? "▲ 접기" : "▼ 펼치기"}</span>
        </button>
          {showMismatch && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-orange-50 border-t border-orange-100">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-orange-600">이름</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-orange-600">신청서 기재</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-orange-600">출석부 DB (실제)</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-orange-600">불일치 항목</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-50 bg-white">
                {mismatches.map(m => (
                  <tr key={m.key} className="hover:bg-orange-50/40">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{m.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {m.form.bu} {m.form.grade}학년 {m.form.class}반
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-1">
                        {m.dbAll.map((d, i) => {
                          const isMatched = d.bu === m.dbMatched.bu && d.grade === m.dbMatched.grade && d.class === m.dbMatched.class;
                          return (
                            <span key={i} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 w-fit">
                              {isMatched ? "✓ " : ""}{d.bu} {d.grade}학년 {d.class}반
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {m.diff.map(d => (
                          <span key={d} className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-semibold">
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {/* 자동 매칭 불가 전체 */}
          {showMismatch && ambiguousParticipants.length > 0 && (
            <table className="w-full text-sm border-t-2 border-orange-100">
              <thead>
                <tr className="bg-yellow-50">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-700" colSpan={4}>
                    🔀 자동 매칭 불가 {unresolvedAmbiguous}명: 수동 확인 필요
                    {manualMatchedCount > 0 && (
                      <span className="ml-2 text-green-600">· ✓ 수동 매칭 완료 {manualMatchedCount}명</span>
                    )}
                  </th>
                </tr>
                <tr className="bg-yellow-50 border-t border-yellow-100">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-700">이름</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-700">신청서 기재</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-700">출석부 DB 후보</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-yellow-700">사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-yellow-50 bg-white">
                {ambiguousParticipants.map(a => {
                  const resolved = !!a.resolvedColor;
                  const reasonColor = a.reason === "DB 미등록"
                    ? "bg-slate-100 text-slate-600 border-slate-200"
                    : a.reason === "동명이인"
                    ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                    : "bg-orange-100 text-orange-700 border-orange-200";
                  return (
                    <tr key={a.key} className={resolved ? "bg-green-50/60 hover:bg-green-50" : "hover:bg-yellow-50/40"}>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{a.name}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {a.form.bu} {a.form.grade}학년 {a.form.class}반
                      </td>
                      <td className="px-4 py-2.5">
                        {resolved ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300 w-fit">
                            ✓ {a.resolvedColor!.bu} {a.resolvedColor!.grade}학년 {a.resolvedColor!.cls}반 색칠됨
                          </span>
                        ) : a.dbAll.length === 0 ? (
                          <span className="text-xs text-slate-400">없음</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {a.dbAll.map((d, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 w-fit">
                                {d.bu} {d.grade}학년 {d.class}반
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {resolved ? (
                          <span className="text-xs px-2 py-0.5 rounded-full border font-semibold bg-green-100 text-green-700 border-green-200">
                            ✓ 수동 매칭
                          </span>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${reasonColor}`}>
                            {a.reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </div>

      {/* 후기 신청자 */}
      {lateRegistrants.length > 0 && (
        <div className="mb-4 border border-teal-200 rounded-lg overflow-x-auto">
          <div className="px-4 py-3 bg-teal-50 flex items-center gap-2">
            <span className="text-sm font-semibold text-teal-700">
              📋 후기 신청자 {lateRegistrants.length}명
            </span>
            <span className="text-xs text-teal-500">반별 명단 탭 색칠로 처리된 인원</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-teal-50 border-t border-teal-100">
                <th className="px-4 py-2 text-left text-xs font-semibold text-teal-700">#</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-teal-700">이름</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-teal-700">부서</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-teal-700">학년/반</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-teal-700">연락처</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-teal-700">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal-50 bg-white">
              {lateRegistrants.map((lr, i) => (
                <tr key={lr.sid} className="hover:bg-teal-50/40">
                  <td className="px-4 py-2.5 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{lr.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`tag ${lr.bu === "1부" ? "tag-green" : "tag-purple"}`}>{lr.bu}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {lr.grade}학년 {lr.cls}반
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{lr.phone || "없음"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${
                      lr.color === "blue"   ? "bg-blue-100 text-blue-700 border-blue-200"
                    : lr.color === "orange" ? "bg-orange-100 text-orange-700 border-orange-200"
                    : lr.color === "green"  ? "bg-green-100 text-green-700 border-green-200"
                    :                        "bg-purple-100 text-purple-700 border-purple-200"
                    }`}>
                      {lr.color === "blue" ? "입금완료" : lr.color === "orange" ? "부분참" : "신청자"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Table */}
      <div className="card retreat-roster-table overflow-x-auto">
        {loading ? (
          <WorkspaceSkeleton label="참가자 명단을 불러오는 중입니다." rows={6} />
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <div className="text-3xl mb-2">📋</div>
            <p>참가자가 없습니다.</p>
            <p className="text-sm mt-1">구글시트 동기화를 눌러 데이터를 불러오세요.</p>
          </div>
        ) : (
          <>
          {/* CSS로 숨기지 않고 렌더 자체를 가른다. 데스크톱 표에는 본인·보호자 연락처가
              들어 있어, display:none으로만 감추면 휴대폰 DOM에 그대로 남는다. */}
          {!isDesktop && <RetreatParticipantMobileList key={`${search}|${buFilter}|${gradeFilter}|${sortBy}|${sortDir}`} list={list} mismatchKeys={mismatchKeys} ambiguousKeys={ambiguousKeys} />}
          {isDesktop && (
          <table className="retreat-roster-desktop w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/80 text-[11px] font-semibold tracking-wide text-slate-500">
                <th colSpan={5} className="px-4 py-2 text-left">신청자 정보</th>
                <th colSpan={2} className="border-l-2 border-slate-200 bg-blue-50/70 px-4 py-2 text-left text-blue-700">연락처</th>
                <th className="border-l-2 border-slate-200 px-4 py-2 text-left">접수 정보</th>
              </tr>
              <tr className="table-header">
                <th className="sticky left-0 z-20 w-[42px] bg-slate-50 px-2 sm:px-4 py-2 text-left whitespace-nowrap">#</th>
                <th className="sticky left-[42px] z-20 min-w-[112px] bg-slate-50 px-2 sm:px-4 py-2 text-left whitespace-nowrap cursor-pointer select-none hover:text-blue-600"
                  onClick={() => { if (sortBy === "name") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy("name"); setSortDir("asc"); } }}>
                  이름 {sortBy === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="px-2 sm:px-4 py-2 text-left whitespace-nowrap">성별</th>
                <th className="px-2 sm:px-4 py-2 text-left whitespace-nowrap">부</th>
                <th className="px-2 sm:px-4 py-2 text-left whitespace-nowrap">학년/반</th>
                <th className="border-l-2 border-slate-200 bg-blue-50/40 px-2 sm:px-4 py-2 text-left whitespace-nowrap">학생 연락처</th>
                <th className="bg-blue-50/40 px-2 sm:px-4 py-2 text-left whitespace-nowrap">보호자 연락처</th>
                <th className="border-l-2 border-slate-200 px-2 sm:px-4 py-2 text-left whitespace-nowrap cursor-pointer select-none hover:text-blue-600"
                  onClick={() => { if (sortBy === "registeredAt") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy("registeredAt"); setSortDir("desc"); } }}>
                  신청일시 {sortBy === "registeredAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((p, i) => (
                <tr key={p.key} className={
                  mismatchKeys.has(p.key) ? "bg-orange-50 hover:bg-orange-100/60" :
                  ambiguousKeys.has(p.key) ? "bg-yellow-50 hover:bg-yellow-100/60" :
                  "hover:bg-slate-50"
                }>
                  <td className="sticky left-0 z-10 bg-inherit px-2 sm:px-4 py-2 text-slate-500 whitespace-nowrap">{i + 1}</td>
                  <td className="sticky left-[42px] z-10 bg-inherit px-2 sm:px-4 py-2 font-medium text-slate-800 whitespace-nowrap">
                    {mismatchKeys.has(p.key) && <span className="mr-1 text-orange-400">⚠</span>}
                    {ambiguousKeys.has(p.key) && <span className="mr-1 text-yellow-500">🔀</span>}
                    {p.name}
                  </td>
                  <td className="px-2 sm:px-4 py-2 whitespace-nowrap">
                    <span className={`tag ${p.gender === "여" ? "tag-red" : "tag-blue"}`}>{p.gender}</span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 whitespace-nowrap">
                    <span className={`tag ${p.bu?.includes("1") ? "tag-green" : "tag-purple"}`}>{p.bu}</span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-slate-600 whitespace-nowrap">
                    {p.grade > 0 ? `${p.grade}학년 ${p.class > 0 ? p.class + "반" : ""}` : "없음"}
                  </td>
                  <td className="border-l-2 border-slate-100 bg-blue-50/20 px-2 sm:px-4 py-2 text-slate-600 whitespace-nowrap">
                    {p.phone || "없음"}
                  </td>
                  <td className="bg-blue-50/20 px-2 sm:px-4 py-2 text-slate-600 whitespace-nowrap">
                    {p.pPhone || "없음"}
                  </td>
                  <td className="border-l-2 border-slate-100 px-2 sm:px-4 py-2 text-slate-500 whitespace-nowrap">{p.registeredAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
          </>
        )}
      </div>
    </div>
  );
}
