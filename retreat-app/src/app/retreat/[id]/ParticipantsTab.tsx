"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import { Retreat, Participant, Student, SyncDuplicateGroup } from "@/lib/types";
import { fetchSheetParticipants } from "@/lib/sheetsParser";
import { getStudentsByYear, saveParticipants, getParticipants, backupParticipants, subscribeToCellColors, saveSyncDuplicates, getSyncDuplicates, updateParticipant } from "@/lib/db";
import { findStudent, normalizeName, stripSuffix } from "@/lib/studentMatcher";
import { LATE_REGISTRANT_COLORS } from "@/lib/constants";

interface Props {
  retreat: Retreat;
}

/** raw(시트 전체 열, 민감정보 포함 가능)를 제거 — 공용 participants 경로에 저장하기 전 항상 거쳐야 함 */
function stripRaw(p: Participant): Omit<Participant, "raw"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- raw는 의도적으로 버림
  const { raw: _raw, ...rest } = p;
  return rest;
}

/** raw를 {h,v} 쌍 배열로 정규화 — 배열(현행) 외에 구버전 Record 형태가 저장돼 있어도 안전하게 처리.
 *  값이 빈 열도 유지한다(예: "기타 사항" — 안 적은 사람이 많아도 열은 항상 표시). */
function rawPairsOf(raw: unknown): { h: string; v: string }[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return (raw as { h?: string; v?: string }[])
      .filter(p => p?.h)
      .map(p => ({ h: p.h!, v: p.v ?? "" }));
  }
  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, string>)
      .filter(([h]) => h)
      .map(([h, v]) => ({ h, v: String(v ?? "") }));
  }
  return [];
}

export default function ParticipantsTab({ retreat }: Props) {
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
  const [showDuplicates, setShowDuplicates] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [pData, sData, savedDups] = await Promise.all([
        getParticipants(retreat.id),
        getStudentsByYear(retreat.year),
        getSyncDuplicates(retreat.id),
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
  }, [retreat.id, retreat.year]);

  useEffect(() => {
    void loadData();
    const unsubColors = subscribeToCellColors(retreat.id, setCellColorsState);
    return () => unsubColors();
  }, [loadData, retreat.id]);

  async function syncFromSheet() {
    if (!retreat.sheetId) {
      setError("먼저 시트 설정을 해주세요. (우측 상단 ⚙ 아이콘)");
      return;
    }
    setSyncing(true);
    setError("");
    try {
      // 덮어쓰기 전 현재 상태 백업 (입금완료 표시 등 매칭이 어긋났을 때 복구용)
      await backupParticipants(retreat.id);
      const list = await fetchSheetParticipants(retreat.sheetId, retreat.sheetGid);

      // 학생 DB 매칭 + 중복 제거 (동일 studentId는 최초 신청만 유지, 미매칭은 name+bu+grade 기준)
      const seenStudentIds = new Set<string>();
      const dupEntries = new Map<string, { name: string; bu: string; entries: Participant[] }>();
      const deduped: { p: Participant; ms: Student | undefined; dedupKey: string }[] = [];
      list.forEach(p => {
        const ms = findStudent(p, students);
        const dedupKey = ms?.id ?? `name:${p.name.trim()}:${p.bu ?? ""}:${p.grade}`;
        if (seenStudentIds.has(dedupKey)) {
          const prev = dupEntries.get(dedupKey);
          if (prev) prev.entries.push(p);
          else dupEntries.set(dedupKey, { name: p.name, bu: p.bu, entries: [p] });
          return;
        }
        seenStudentIds.add(dedupKey);
        deduped.push({ p, ms, dedupKey });
      });
      // 첫 번째 신청도 entries에 포함
      dupEntries.forEach((v, k) => {
        const first = deduped.find(d => d.dedupKey === k);
        if (first) v.entries.unshift(first.p);
      });

      const sorted = [...deduped].sort((a, b) => a.p.name.localeCompare(b.p.name, "ko"));
      const matched: Record<string, Participant> = {};
      const dedupKeyToParticipantKey = new Map<string, string>();
      sorted.forEach(({ p, ms, dedupKey }, idx) => {
        const key = `p_${idx}`;
        // raw(시트 전체 열, 민감정보 포함 가능)는 공용 participants 경로에 절대 저장하지 않는다 — stripRaw로 제외.
        matched[key] = {
          ...stripRaw(p),
          studentId: ms?.id ?? null,
          phone: p.phone || ms?.phone || null,
          pPhone: ms?.pPhone ?? null,
        };
        dedupKeyToParticipantKey.set(dedupKey, key);
      });

      // 각 중복 그룹이 어느 participants 키에 저장됐는지 연결해둬야, 관리자가 다른 신청을 선택했을 때
      // 정확히 그 키만 갱신할 수 있다(전체 participants 재저장 없이).
      const dupList: SyncDuplicateGroup[] = [...dupEntries.entries()].map(([k, v]) => ({
        ...v,
        resolvedIndex: 0,
        participantKey: dedupKeyToParticipantKey.get(k),
      }));
      setDuplicates(dupList);
      await saveSyncDuplicates(retreat.id, dupList);

      await saveParticipants(retreat.id, matched);
      setParticipants(matched);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
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
    const updated: Participant = {
      ...stripRaw(chosen),
      studentId: ms?.id ?? null,
      phone: chosen.phone || ms?.phone || null,
      pPhone: ms?.pPhone ?? null,
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

  async function rematch() {
    setSyncing(true);
    setError("");
    try {
      // 덮어쓰기 전 현재 상태 백업
      await backupParticipants(retreat.id);
      const freshStudents = await getStudentsByYear(retreat.year);
      const rematched: Record<string, Participant> = {};
      let matchedCount = 0;
      const debugMissed: string[] = [];


      const seenIds = new Set<string>();
      Object.entries(participants).forEach(([key, p]) => {
        const found = findStudent(p, freshStudents);
        // 중복 제거: 같은 studentId는 최초 항목만 유지, 미매칭은 name+bu+grade 기준
        if (found?.id) {
          if (seenIds.has(found.id)) return;
          seenIds.add(found.id);
        } else {
          const nameKey = `name:${p.name.trim()}:${p.bu ?? ""}:${p.grade}`;
          if (seenIds.has(nameKey)) return;
          seenIds.add(nameKey);
        }
        if (found) matchedCount++;
        else debugMissed.push(`${p.name}(${p.grade}학년${p.class}반)`);
        rematched[key] = {
          ...p,
          studentId: found?.id ?? null,
          phone: found?.phone ?? p.phone ?? null,
          pPhone: found?.pPhone ?? p.pPhone ?? null,
        };
      });

      // 기존 키를 그대로 유지 — 이름순 재정렬은 화면 표시(list useMemo)에서만 하면 되고,
      // 여기서 키를 새로 매기면 중복 신청 "유지" 선택이 참조하는 participantKey가 어긋나
      // 다른 사람 데이터를 가리키게 되는 버그가 생긴다.
      await saveParticipants(retreat.id, rematched);
      setParticipants(rematched);
      setStudents(freshStudents);

      const total = Object.keys(participants).length;
      const missedSample = debugMissed.slice(0, 5).join(", ");
      setError(`✅ 재매칭 완료: ${matchedCount}/${total}명\n미매칭 예시: ${missedSample || "없음"}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "재매칭 중 오류가 발생했습니다.");
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

      {/* Controls */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-3 mb-4">
        <div className="flex gap-2">
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

        <div className="flex gap-2 sm:ml-auto">
          <button onClick={rematch} disabled={syncing || Object.keys(participants).length === 0} className="btn-secondary flex-1 sm:flex-none justify-center text-xs sm:text-sm">
            {syncing ? "⟳ 처리 중..." : "↺ DB 재매칭"}
          </button>
          <button onClick={syncFromSheet} disabled={syncing} className="btn-primary flex-1 sm:flex-none justify-center text-xs sm:text-sm">
            {syncing ? "⟳ 동기화 중..." : "↻ 구글시트 동기화"}
          </button>
        </div>
      </div>

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

      {/* 중복 신청 — 항상 표시 */}
      <div className="mb-4 border border-purple-200 rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 text-left"
          onClick={() => setShowDuplicates(v => !v)}
        >
          <span className="text-sm font-semibold text-purple-700">
            🔁 중복 신청 {duplicates.length}명
            {duplicates.length === 0
              ? <span className="ml-2 font-normal text-green-500 text-xs">— 중복 없음 ✓</span>
              : <span className="ml-2 font-normal text-purple-500 text-xs">— 기본은 최초 신청 유지, 필요 시 아래에서 다른 신청 선택 가능</span>}
          </span>
          <span className="text-purple-400 text-xs">{showDuplicates ? "▲ 접기" : "▼ 펼치기"}</span>
        </button>
        {showDuplicates && duplicates.map((d, i) => (
          <div key={i} className="border-t border-purple-100">
            <div className="px-4 py-2 bg-purple-50/50">
              <span className="text-sm font-bold text-purple-800">{d.name}</span>
              <span className="text-xs text-purple-500 ml-2">{d.bu} · {d.entries.length}회 신청</span>
            </div>
            {(() => {
              const resolvedIndex = d.resolvedIndex ?? 0;
              // 그룹 내 모든 신청의 시트 열 헤더 합집합 — 첫 등장 순서 유지 (같은 시트라 대부분 동일)
              const rawHeaders: string[] = [];
              d.entries.forEach(e => rawPairsOf(e.raw).forEach(({ h }) => { if (!rawHeaders.includes(h)) rawHeaders.push(h); }));
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-purple-50/30">
                        <th className="px-4 py-1.5 text-center text-purple-600 font-medium">유지</th>
                        <th className="px-4 py-1.5 text-left text-purple-600 font-medium">#</th>
                        <th className="px-4 py-1.5 text-left text-purple-600 font-medium whitespace-nowrap">신청일시</th>
                        <th className="px-4 py-1.5 text-left text-purple-600 font-medium">성별</th>
                        <th className="px-4 py-1.5 text-left text-purple-600 font-medium">부</th>
                        <th className="px-4 py-1.5 text-left text-purple-600 font-medium whitespace-nowrap">학년/반</th>
                        <th className="px-4 py-1.5 text-left text-purple-600 font-medium whitespace-nowrap">상태</th>
                        {rawHeaders.map(h => (
                          <th key={h} className="px-4 py-1.5 text-left text-purple-600 font-medium max-w-[220px] truncate" title={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50">
                      {d.entries.map((e, j) => {
                        // 구글폼이 1부/2부 등으로 분기되면 같은 질문 텍스트("몇 학년 인가요?" 등)의 열이
                        // 시트에 중복으로 존재할 수 있다 — 응답자가 실제로 답한 분기의 값이 먼저 나와도
                        // 뒤에 나오는 미응답 분기의 빈 값에 덮여 "—"로 보이는 문제가 있었다.
                        // 값이 있는 쪽을 우선하도록(빈 값이 이미 채워진 값을 덮지 않도록) 처리.
                        const pairs = new Map<string, string>();
                        rawPairsOf(e.raw).forEach(({ h, v }) => {
                          if (!pairs.has(h) || (!pairs.get(h) && v)) pairs.set(h, v);
                        });
                        return (
                          <tr key={j} className={j === resolvedIndex ? "bg-green-50/40" : "bg-white"}>
                            <td className="px-4 py-2 text-center">
                              <input
                                type="radio"
                                name={`dup-${i}`}
                                checked={j === resolvedIndex}
                                disabled={!d.participantKey}
                                onChange={() => chooseDuplicateEntry(i, j)}
                                aria-label={`${d.name}의 ${j + 1}번째 신청을 유지`}
                              />
                            </td>
                            <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{j + 1}{j === resolvedIndex && <span className="ml-1 text-green-600 font-semibold">유지</span>}</td>
                            <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap">{e.registeredAt || "—"}</td>
                            <td className="px-4 py-2 text-slate-500">{e.gender || "—"}</td>
                            <td className="px-4 py-2 whitespace-nowrap"><span className={`tag ${e.bu?.includes("1") ? "tag-green" : "tag-purple"}`}>{e.bu}</span></td>
                            <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{e.grade > 0 ? `${e.grade}학년 ${e.class > 0 ? e.class + "반" : ""}` : "—"}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{j !== resolvedIndex && <span className="text-red-400 font-medium">제거됨</span>}</td>
                            {rawHeaders.map(h => {
                              const v = pairs.get(h) || "";
                              return (
                                <td key={h} className="px-4 py-2 text-slate-500 whitespace-nowrap max-w-[220px] truncate" title={v}>{v || "—"}</td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        ))}
      </div>

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
              <span className="ml-2 font-normal text-green-500 text-xs">— 이상 없음 ✓</span>
            )}
            {(mismatches.length > 0 || unresolvedAmbiguous > 0) && (
              <span className="ml-2 font-normal text-orange-500 text-xs">— 부서·학년·반 오기재 가능성</span>
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
                    🔀 자동 매칭 불가 {unresolvedAmbiguous}명 — 수동 확인 필요
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
                          <span className="text-xs text-slate-400">—</span>
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
            <span className="text-xs text-teal-500">— 신청자 취합탭 색칠로 처리된 인원</span>
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
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{lr.phone || "—"}</td>
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
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-400">로딩 중...</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <div className="text-3xl mb-2">📋</div>
            <p>참가자가 없습니다.</p>
            <p className="text-sm mt-1">구글시트 동기화를 눌러 데이터를 불러오세요.</p>
          </div>
        ) : (
          <table className="w-full text-xs sm:text-sm" style={{ minWidth: 580 }}>
            <thead>
              <tr className="table-header">
                <th className="px-2 sm:px-4 py-2 text-left whitespace-nowrap">#</th>
                <th className="px-2 sm:px-4 py-2 text-left whitespace-nowrap cursor-pointer select-none hover:text-blue-600"
                  onClick={() => { if (sortBy === "name") setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy("name"); setSortDir("asc"); } }}>
                  이름 {sortBy === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
                <th className="px-2 sm:px-4 py-2 text-left whitespace-nowrap">성별</th>
                <th className="px-2 sm:px-4 py-2 text-left whitespace-nowrap">부</th>
                <th className="px-2 sm:px-4 py-2 text-left whitespace-nowrap">학년/반</th>
                <th className="px-2 sm:px-4 py-2 text-left whitespace-nowrap">연락처</th>
                <th className="px-2 sm:px-4 py-2 text-left whitespace-nowrap cursor-pointer select-none hover:text-blue-600"
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
                  <td className="px-2 sm:px-4 py-2 text-slate-400 whitespace-nowrap">{i + 1}</td>
                  <td className="px-2 sm:px-4 py-2 font-medium text-slate-800 whitespace-nowrap">
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
                    {p.grade > 0 ? `${p.grade}학년 ${p.class > 0 ? p.class + "반" : ""}` : "—"}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-slate-500 whitespace-nowrap">
                    {p.phone || "—"}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-slate-400 whitespace-nowrap">{p.registeredAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
