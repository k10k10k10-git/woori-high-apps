"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { Retreat, Participant, UnmatchedPayment } from "@/lib/types";
import { parseClassKey } from "@/lib/classKey";
import { normalizeName } from "@/lib/studentMatcher";
import { resolvePaymentColorKey } from "@/lib/paymentColorKey";
type BuTab = "1부" | "2부";
import {
  subscribeToParticipants, subscribeToClassesByYear, subscribeToCellColors,
  subscribeToUnmatchedPayments,
  addUnmatchedPayment, resolveUnmatchedPayment,
  unresolveUnmatchedPayment, deleteUnmatchedPayment, updateUnmatchedPayment,
} from "@/lib/db";
import { useUI } from "@/context/UIContext";

export default function UnmatchedPaymentsTab({ retreat }: { retreat: Retreat }) {
  // 연락처 열은 CSS로 숨기지 않고 렌더를 가른다 — hidden은 DOM에 값이 남는다.
  const isDesktop = useIsDesktop();
  const { toast, uiConfirm } = useUI();
  const [payments, setPayments]         = useState<UnmatchedPayment[]>([]);
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [cellColors, setCellColors_]    = useState<Record<string, string>>({});
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState<string | null>(null);

  // 추가 폼
  const [payerName, setPayerName] = useState("");
  const [note, setNote]           = useState("");
  const [adding, setAdding]       = useState(false);

  // 입금 대조 탭
  const [unpaidBu, setUnpaidBu] = useState<BuTab>("1부");

  // 학생 연결 UI
  const [linkingId, setLinkingId]       = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [markPaid, setMarkPaid]         = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  // 미해결 항목 수정 UI
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editPayerName, setEditPayerName] = useState("");
  const [editNote, setEditNote]         = useState("");
  const [savingEdit, setSavingEdit]     = useState(false);

  // 이름 → cellColor 키 맵 (이름변형 → "${buNum}_${studentId}")
  const [nameToColorKey, setNameToColorKey] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    // 클래스 DB 로드 (이름 맵 구성용)
    setLoadError(null);
    const unsubClasses = subscribeToClassesByYear(retreat.year, (classesRaw) => {
      // 이름 변형 → cellColor키 맵 구성
      // ClassRosterTab과 동일한 키 형식: "${buNum}_${studentId}"
      const map = new Map<string, string>();
      // studentMatcher.stripSuffix와 다름(영문 꼬리 전부 제거) — 통합하지 말 것
      const strip = (n: string) => n.replace(/[A-Za-z]+$/, "").trim();

      Object.entries(classesRaw).forEach(([classKey, cd]) => {
        const parsed = parseClassKey(classKey);
        if (!parsed) return;
        const { buNum } = parsed;
        Object.entries(cd.students || {}).forEach(([sid, s]) => {
          const colorKey = `${buNum}_${sid}`;
          const name = s.name;
          [name, normalizeName(name), strip(name), normalizeName(strip(name))].forEach(v => {
            if (v) map.set(`${buNum}_${v}`, colorKey);
          });
        });
      });
      setNameToColorKey(map);
    }, (error) => setLoadError(error.message));

    const unsubParticipants = subscribeToParticipants(retreat.id, setParticipants,
      e => setLoadError(prev => prev ?? `구독 실패 - ${e.message}`));
    const unsubColors   = subscribeToCellColors(retreat.id, setCellColors_,
      e => setLoadError(prev => prev ?? `구독 실패 - ${e.message}`));
    const unsubPayments = subscribeToUnmatchedPayments(retreat.id, list => {
      setPayments(list);
      setLoading(false);
    }, e => { setLoadError(prev => prev ?? `구독 실패 - ${e.message}`); setLoading(false); });
    return () => { unsubClasses(); unsubParticipants(); unsubColors(); unsubPayments(); };
  }, [retreat.id, retreat.year]);

  // 연결 패널 열릴 때 포커스
  useEffect(() => {
    if (linkingId) setTimeout(() => searchRef.current?.focus(), 50);
  }, [linkingId]);

  // 검색 결과
  const searchResults = useMemo(() => {
    const q = studentSearch.trim();
    if (!q) return [];
    return Object.entries(participants)
      .filter(([, p]) => p.name.includes(q))
      .map(([key, p]) => ({ key, ...p }))
      .sort((a, b) => a.grade - b.grade || a.class - b.class || a.name.localeCompare(b.name, "ko"));
  }, [participants, studentSearch]);

  async function handleAdd() {
    if (!payerName.trim() || adding) return;
    setAdding(true);
    try {
      await addUnmatchedPayment(retreat.id, {
        payerName: payerName.trim(),
        note: note.trim() || undefined,
        createdAt: Date.now(),
      });
      setPayerName("");
      setNote("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "미확인 입금 항목을 추가하지 못했습니다.", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleLink(payment: UnmatchedPayment, pKey: string, p: Participant & { key: string }) {
    try {
      await resolveUnmatchedPayment(retreat.id, payment.id, {
        resolvedStudentKey:   pKey,
        resolvedStudentName:  p.name,
        resolvedStudentGrade: p.grade,
        resolvedStudentClass: p.class,
        resolvedStudentId:    p.studentId ?? undefined,
      }, markPaid ? p.studentId ?? undefined : undefined);
      if (markPaid && p.studentId) {
        setCellColors_(prev => ({ ...prev, [p.studentId!]: "blue" }));
      }
      setLinkingId(null);
      setStudentSearch("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "입금 항목을 학생과 연결하지 못했습니다.", "error");
    }
  }

  async function handleUnresolve(payment: UnmatchedPayment) {
    try {
      // 연결 시 markPaid로 세팅했던 cellColors(입금완료 파란색)도 함께 지워서
      // 반별 명단 화면에 해제된 상태가 정확히 반영되게 한다.
      await unresolveUnmatchedPayment(retreat.id, payment.id, payment.resolvedStudentId);
      if (payment.resolvedStudentId) {
        setCellColors_(prev => {
          const next = { ...prev };
          delete next[payment.resolvedStudentId!];
          return next;
        });
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "입금 연결을 해제하지 못했습니다.", "error");
    }
  }

  function startEdit(payment: UnmatchedPayment) {
    setEditingId(payment.id);
    setEditPayerName(payment.payerName);
    setEditNote(payment.note ?? "");
    setLinkingId(null);
  }

  async function handleSaveEdit(payment: UnmatchedPayment) {
    if (!editPayerName.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateUnmatchedPayment(retreat.id, payment.id, {
        payerName: editPayerName.trim(),
        note: editNote.trim() || undefined,
      });
      setEditingId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "입금 항목을 수정하지 못했습니다.", "error");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(payment: UnmatchedPayment) {
    if (!await uiConfirm(`"${payment.payerName}" 항목을 삭제하시겠습니까?`)) return;
    try {
      await deleteUnmatchedPayment(retreat.id, payment.id);
      if (linkingId === payment.id) setLinkingId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "입금 항목을 삭제하지 못했습니다.", "error");
    }
  }

  // ── 미납자 목록 계산 ──
  const unpaidByBu = useMemo(() => {
    const seen = new Set<string>();
    const result: { pKey: string; p: Participant; buNum: number; status: "none" | "orange" | "blue" | "red" }[] = [];

    Object.entries(participants).forEach(([pKey, p]) => {
      const buNum = p.bu?.includes("1") ? 1 : p.bu?.includes("2") ? 2 : 0;
      if (!buNum) return;

      // 중복 제거
      const dedupKey = p.studentId ? `${buNum}_${p.studentId}` : `name:${p.name}:${buNum}`;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);

      const colorKey = resolvePaymentColorKey(p.name, p.studentId, buNum, nameToColorKey);

      const color = colorKey ? cellColors[colorKey] : undefined;

      // 모든 색상 포함 — 미처리(none)는 상단, 나머지는 하단 완료 섹션에 표시
      const status = color === "blue" ? "blue" : color === "orange" ? "orange" : color === "red" ? "red" : "none";
      result.push({ pKey, p, buNum, status });
    });

    result.sort((a, b) =>
      (a.p.grade ?? 0) - (b.p.grade ?? 0) ||
      (a.p.class ?? 0) - (b.p.class ?? 0) ||
      a.p.name.localeCompare(b.p.name, "ko")
    );

    const makeGroup = (bn: number) => ({
      unpaid:    result.filter(r => r.buNum === bn && r.status === "none"),
      completed: result.filter(r => r.buNum === bn && r.status !== "none"),
    });
    return { "1부": makeGroup(1), "2부": makeGroup(2) };
  }, [participants, cellColors, nameToColorKey]);

  const unresolved = payments.filter(p => !p.resolvedStudentName);
  const resolved   = payments.filter(p =>  p.resolvedStudentName);

  if (loading) return <div className="text-center text-slate-400 py-10">로딩 중...</div>;

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-stretch xl:items-start">
      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 w-full">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      {/* ══ 왼쪽: 입금 대조 ══ */}
      <div className="flex-1 min-w-0">
      <div className="mb-8">
        <h2 className="text-base font-bold text-slate-700 mb-3">입금 대조</h2>

        {/* 요약 카드 */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <div className="card p-2 sm:p-3 text-center">
            <div className="text-lg sm:text-2xl font-bold text-red-500">{unpaidByBu["1부"].unpaid.length}</div>
            <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">1부 미납</div>
          </div>
          <div className="card p-2 sm:p-3 text-center">
            <div className="text-lg sm:text-2xl font-bold text-red-500">{unpaidByBu["2부"].unpaid.length}</div>
            <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">2부 미납</div>
          </div>
          <div className="card p-2 sm:p-3 text-center">
            <div className="text-lg sm:text-2xl font-bold text-slate-600">
              {unpaidByBu["1부"].unpaid.length + unpaidByBu["2부"].unpaid.length}
            </div>
            <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1">합계</div>
          </div>
        </div>

        {/* 부 토글 */}
        <div className="flex gap-2 mb-3">
          {(["1부", "2부"] as const).map(b => (
            <button
              key={b}
              onClick={() => setUnpaidBu(b)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                unpaidBu === b
                  ? "bg-slate-700 text-white border-slate-700"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {b} ({unpaidByBu[b].unpaid.length}명)
            </button>
          ))}
        </div>

        {/* 목록 */}
        {unpaidByBu[unpaidBu].unpaid.length === 0 && unpaidByBu[unpaidBu].completed.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">
            <div className="text-3xl mb-2">🎉</div>
            <p className="font-medium">{unpaidBu} 신청자가 없습니다.</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500 w-6 sm:w-8">#</th>
                  <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500">이름</th>
                  <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500">학년/반</th>
                  {isDesktop && <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500">연락처</th>}
                  <th className="px-2 sm:px-3 py-2 text-left text-[10px] sm:text-xs font-semibold text-slate-500">상태</th>
                </tr>
              </thead>
              <tbody>
                {/* 미납 행 */}
                {unpaidByBu[unpaidBu].unpaid.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-slate-400 text-xs">
                      🎉 미납자가 없습니다!
                    </td>
                  </tr>
                ) : (
                  unpaidByBu[unpaidBu].unpaid.map(({ pKey, p }, i) => (
                    <tr key={pKey} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-2 sm:px-3 py-2 text-slate-300 text-xs">{i + 1}</td>
                      <td className="px-2 sm:px-3 py-2 font-semibold text-slate-800">{p.name}</td>
                      <td className="px-2 sm:px-3 py-2 text-slate-500 text-xs">
                        {p.grade ? `${p.grade}학년` : ""}{p.class ? ` ${p.class}반` : ""}
                        {!p.grade && !p.class ? "-" : ""}
                      </td>
                      {isDesktop && <td className="px-2 sm:px-3 py-2 text-slate-500 text-xs">{p.phone || "-"}</td>}
                      <td className="px-2 sm:px-3 py-2">
                        <span className="text-[10px] sm:text-xs bg-slate-100 text-slate-500 px-1.5 sm:px-2 py-0.5 rounded-full border border-slate-200">
                          미처리
                        </span>
                      </td>
                    </tr>
                  ))
                )}

                {/* 완료처리 구분선 */}
                {unpaidByBu[unpaidBu].completed.length > 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold text-slate-400 bg-slate-50 border-t-2 border-dashed border-slate-200">
                      완료 처리 ({unpaidByBu[unpaidBu].completed.length}명)
                    </td>
                  </tr>
                )}

                {/* 완료 행 */}
                {unpaidByBu[unpaidBu].completed.map(({ pKey, p, status }) => (
                  <tr key={pKey} className="border-b border-slate-100 last:border-0 bg-slate-50/60">
                    <td className="px-2 sm:px-3 py-2 text-slate-300 text-xs">✓</td>
                    <td className="px-2 sm:px-3 py-2 font-medium text-slate-400">{p.name}</td>
                    <td className="px-2 sm:px-3 py-2 text-slate-400 text-xs">
                      {p.grade ? `${p.grade}학년` : ""}{p.class ? ` ${p.class}반` : ""}
                      {!p.grade && !p.class ? "-" : ""}
                    </td>
                    {isDesktop && <td className="px-2 sm:px-3 py-2 text-slate-400 text-xs">{p.phone || "-"}</td>}
                    <td className="px-2 sm:px-3 py-2">
                      {status === "blue" ? (
                        <span className="text-[10px] sm:text-xs bg-blue-100 text-blue-600 px-1.5 sm:px-2 py-0.5 rounded-full border border-blue-200">
                          입금완료
                        </span>
                      ) : status === "orange" ? (
                        <span className="text-[10px] sm:text-xs bg-orange-100 text-orange-600 px-1.5 sm:px-2 py-0.5 rounded-full border border-orange-200">
                          부분참
                        </span>
                      ) : (
                        <span className="text-[10px] sm:text-xs bg-red-100 text-red-600 px-1.5 sm:px-2 py-0.5 rounded-full border border-red-200">
                          신청취소
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>{/* end 왼쪽 */}

      {/* ══ 오른쪽: 입금 미매칭 ══ */}
      <div className="w-full xl:w-[400px] xl:flex-shrink-0">
      <h2 className="text-base font-bold text-slate-700 mb-4">입금 미매칭</h2>

      {/* ── 헤더 통계 ── */}
      <div className="card px-4 py-3 mb-5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">미매칭</span>
          <span className="font-bold text-amber-500">{unresolved.length}건</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">매칭완료</span>
          <span className="font-bold text-green-500">{resolved.length}건</span>
        </div>
      </div>

      {/* ── 추가 폼 ── */}
      <div className="card p-3 sm:p-4 mb-6">
        <h3 className="font-semibold text-slate-700 mb-3 text-sm sm:text-base">미매칭 입금 등록</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="input flex-1"
            placeholder="입금자 성함 (학부모 이름) *"
            value={payerName}
            onChange={e => setPayerName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <input
            className="input flex-1"
            placeholder="메모 (입금액, 참고사항 등)"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !payerName.trim()}
            className="btn-primary whitespace-nowrap justify-center"
          >
            {adding ? "추가 중..." : "＋ 추가"}
          </button>
        </div>
      </div>

      {/* ── 미해결 목록 ── */}
      {unresolved.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-bold text-slate-500 mb-2 flex items-center gap-2">
            미해결
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 border border-amber-200">
              {unresolved.length}건
            </span>
          </h3>
          <div className="space-y-2">
            {unresolved.map(payment => (
              <div key={payment.id} className="card overflow-hidden">
                {/* 항목 행 */}
                {editingId === payment.id ? (
                  <div className="px-3 sm:px-4 py-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        className="input flex-1"
                        placeholder="입금자 성함"
                        value={editPayerName}
                        onChange={e => setEditPayerName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSaveEdit(payment)}
                      />
                      <input
                        className="input flex-1"
                        placeholder="메모 (입금액, 참고사항 등)"
                        value={editNote}
                        onChange={e => setEditNote(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSaveEdit(payment)}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleSaveEdit(payment)}
                        disabled={savingEdit || !editPayerName.trim()}
                        className="btn-primary btn-sm text-xs"
                      >
                        {savingEdit ? "저장 중..." : "저장"}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="btn-secondary btn-sm text-xs"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="flex items-start sm:items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-xs sm:text-sm flex-shrink-0 mt-0.5 sm:mt-0">
                    ?
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm">{payment.payerName}</div>
                    {payment.note && (
                      <div className="text-xs text-slate-400 mt-0.5">{payment.note}</div>
                    )}
                    <div className="text-xs text-slate-300 mt-0.5">
                      {new Date(payment.createdAt).toLocaleDateString("ko-KR")} 등록
                    </div>
                    <div className="flex items-center gap-2 mt-2 sm:hidden flex-wrap">
                      <button
                        onClick={() => {
                          setLinkingId(linkingId === payment.id ? null : payment.id);
                          setStudentSearch("");
                        }}
                        className="btn-primary btn-sm text-xs"
                      >
                        학생 연결
                      </button>
                      <button
                        onClick={() => startEdit(payment)}
                        className="btn-secondary btn-sm text-xs"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(payment)}
                        className="btn-danger btn-sm text-xs"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        setLinkingId(linkingId === payment.id ? null : payment.id);
                        setStudentSearch("");
                      }}
                      className="btn-primary btn-sm"
                    >
                      학생 연결
                    </button>
                    <button
                      onClick={() => startEdit(payment)}
                      className="btn-secondary btn-sm"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(payment)}
                      className="btn-danger btn-sm"
                    >
                      삭제
                    </button>
                  </div>
                </div>
                )}

                {/* 학생 검색 패널 */}
                {linkingId === payment.id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-3 sm:px-4 py-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                      <input
                        ref={searchRef}
                        className="input flex-1"
                        placeholder="학생 이름으로 검색..."
                        value={studentSearch}
                        onChange={e => setStudentSearch(e.target.value)}
                      />
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap cursor-pointer">
                        <input
                          type="checkbox"
                          checked={markPaid}
                          onChange={e => setMarkPaid(e.target.checked)}
                          className="rounded"
                        />
                        연결 시 입금완료 표시
                      </label>
                    </div>

                    {studentSearch.trim() && searchResults.length === 0 && (
                      <p className="text-xs text-slate-400 py-2">검색 결과 없음</p>
                    )}

                    {searchResults.length > 0 && (
                      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden max-h-48 overflow-y-auto">
                        {searchResults.map(p => {
                          const sid = p.studentId;
                          const currentColor = sid ? cellColors[sid] : undefined;
                          const isPaid = currentColor === "blue";
                          return (
                            <button
                              key={p.key}
                              onClick={() => handleLink(payment, p.key, p)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-semibold text-slate-800 text-sm">{p.name}</span>
                                <span className="text-xs text-slate-400 ml-2">
                                  {p.grade}학년 {p.class}반 · {p.bu}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {isPaid && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                                    입금완료
                                  </span>
                                )}
                                {!p.studentId && (
                                  <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded border border-yellow-200">
                                    미매칭
                                  </span>
                                )}
                                <span className="text-xs text-slate-400">연결 →</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {!studentSearch.trim() && (
                      <p className="text-xs text-slate-400">
                        학생 이름을 입력하면 신청자 명단에서 검색합니다.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {unresolved.length === 0 && payments.length > 0 && (
        <div className="card p-6 text-center mb-6">
          <div className="text-2xl mb-1">✅</div>
          <p className="text-slate-500 text-sm">미해결 미매칭 건이 없습니다!</p>
        </div>
      )}

      {payments.length === 0 && (
        <div className="card p-10 text-center text-slate-400">
          <div className="text-4xl mb-3">💳</div>
          <p className="font-medium">미매칭 입금 건이 없습니다</p>
          <p className="text-sm mt-1">학부모 성함으로 입금된 건이 있으면 위 양식으로 등록하세요.</p>
        </div>
      )}

      {/* ── 매칭 완료 목록 ── */}
      {resolved.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-500 mb-2 flex items-center gap-2">
            매칭 완료
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 border border-green-200">
              {resolved.length}건
            </span>
          </h3>
          <div className="space-y-2">
            {resolved.map(payment => {
              const sid = payment.resolvedStudentId;
              const isPaid = sid ? cellColors[sid] === "blue" : false;
              return (
                <div key={payment.id} className="card px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-sm flex-shrink-0">
                    ✓
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-700">{payment.payerName}</span>
                      <span className="text-slate-400 text-sm">→</span>
                      <span className="font-bold text-slate-800">{payment.resolvedStudentName}</span>
                      <span className="text-xs text-slate-400">
                        {payment.resolvedStudentGrade}학년 {payment.resolvedStudentClass}반
                      </span>
                      {isPaid && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                          입금완료
                        </span>
                      )}
                    </div>
                    {payment.note && (
                      <div className="text-xs text-slate-400 mt-0.5">{payment.note}</div>
                    )}
                    {payment.resolvedAt && (
                      <div className="text-xs text-slate-300 mt-0.5">
                        {new Date(payment.resolvedAt).toLocaleDateString("ko-KR")} 연결
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleUnresolve(payment)}
                      className="btn-secondary btn-sm text-xs"
                    >
                      연결 해제
                    </button>
                    <button
                      onClick={() => handleDelete(payment)}
                      className="btn-danger btn-sm text-xs"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>{/* end 오른쪽 */}
    </div>
  );
}
