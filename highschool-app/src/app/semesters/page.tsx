"use client";

// 학기 목록 — 셸·컴포넌트 클래스는 수련회 행정 화면과 동일하고 색만 초록(.semester-scope).
// 사이트 제목·계정·로그아웃은 전역 헤더가 담당한다(중복 제목 줄을 두지 않는다).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { canAccessPortalArea, canEditPortalArea } from "@/features/portal/accessPolicy";
import { getSemesters, createSemester } from "@/features/semester/db";
import { Semester } from "@/features/semester/types";
import LoginButton from "@/components/LoginButton";

export default function SemestersPage() {
  const { user, loading, role, signIn, signOut } = useAuth();
  const { toast } = useUI();
  const allowed = canAccessPortalArea("semester", role);
  const canEdit = canEditPortalArea("semester", role);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setListLoading(true);
    setLoadError(null);
    try {
      setSemesters(await getSemesters());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (user && allowed) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, allowed]);

  async function handleCreate() {
    const id = newId.trim();
    if (!/^\d{4}-[12]$/.test(id)) {
      toast("학기 ID는 '2026-1' 형식이어야 합니다", "warning");
      return;
    }
    if (semesters.some((s) => s.id === id)) {
      toast("이미 존재하는 학기입니다", "warning");
      return;
    }
    setCreating(true);
    try {
      await createSemester(id, newTitle.trim() || `${id.replace("-", "년 ")}학기 훈련·사역팀`);
      setNewId("");
      setNewTitle("");
      toast("학기가 생성되었습니다", "success");
      await load();
    } catch (e) {
      toast(`생성 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-slate-500">불러오는 중…</main>;
  }

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold">학기 중 사역</h1>
        <p className="text-sm text-slate-500">분당우리교회 고등부 · 훈련·사역팀 관리</p>
        <LoginButton signIn={signIn} />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
        <p className="text-sm text-slate-500">
          이가드팀 계정은 현장 운영 화면만 사용할 수 있습니다.
          <br />
          통합관리자에게 역할 배정을 요청해주세요.
        </p>
        <button onClick={() => void signOut()} className="text-sm text-slate-400 underline">
          로그아웃
        </button>
      </main>
    );
  }

  return (
    <div className="semester-scope">
      <main className="max-w-5xl mx-auto px-4 py-5 sm:py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-800">학기 중 사역</h1>
            <p className="mt-0.5 text-sm text-slate-500">접수 → 배치 → 출석 → 수료 → 아카이브</p>
          </div>
          {!canEdit && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">조회 전용</span>
          )}
        </div>

        {loadError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ⚠ 로드 오류: {loadError}
          </div>
        )}

        <section className="mb-6 grid gap-3 sm:grid-cols-2">
          {listLoading && <p className="text-sm text-slate-400">목록 불러오는 중…</p>}
          {!listLoading && semesters.length === 0 && !loadError && (
            <p className="text-sm text-slate-400">
              {canEdit ? "아직 학기가 없습니다. 아래에서 첫 학기를 만들어보세요." : "등록된 학기가 없습니다."}
            </p>
          )}
          {semesters.map((s) => (
            <Link key={s.id} href={`/semester/${s.id}`} className="card card-body" data-hover="">
              <div className="flex items-center justify-between">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ background: "var(--color-badge-bg)", color: "var(--color-primary)", border: "1px solid var(--color-badge-border)" }}
                >
                  {s.id}
                </span>
                <span className="text-slate-300">→</span>
              </div>
              <div className="font-semibold text-slate-800">{s.meta.title}</div>
              {s.meta.startDate && s.meta.endDate && (
                <div className="text-xs text-slate-400">{s.meta.startDate} ~ {s.meta.endDate}</div>
              )}
            </Link>
          ))}
        </section>

        {canEdit && (
          <section className="card card-body">
            <h2 className="font-semibold text-slate-800">새 학기 만들기</h2>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="학기 ID (예: 2026-1)"
                aria-label="학기 ID"
                className="input flex-1"
              />
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="제목 (비우면 자동)"
                aria-label="학기 제목"
                className="input flex-1"
              />
              <button onClick={() => void handleCreate()} disabled={creating || !newId.trim()} className="btn-primary justify-center">
                {creating ? "생성 중…" : "생성"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
