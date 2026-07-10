"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { getSemesters, createSemester } from "@/lib/db";
import { Semester } from "@/lib/types";

export default function HomePage() {
  const { user, loading, accessLevel, signIn, signOut } = useAuth();
  const { toast } = useUI();
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
    if (user && accessLevel !== "none") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accessLevel]);

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
    return <main className="min-h-screen flex items-center justify-center text-gray-500">불러오는 중…</main>;
  }

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold">학기 사역 허브</h1>
        <p className="text-sm text-gray-500">분당우리교회 고등부 · 훈련·사역팀 관리</p>
        <button
          onClick={() => void signIn()}
          className="px-5 py-2.5 rounded-lg bg-blue-100 hover:bg-blue-200 font-medium"
        >
          Google로 로그인
        </button>
      </main>
    );
  }

  if (accessLevel === "none") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">접근 권한이 없습니다</h1>
        <p className="text-sm text-gray-500">
          행정팀 멤버(retreatAdmins) 계정만 사용할 수 있습니다.
          <br />
          수련회 행정 사이트에서 멤버 승인을 받아주세요.
        </p>
        <button onClick={() => void signOut()} className="text-sm text-gray-400 underline">
          로그아웃
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">학기 사역 허브</h1>
          <p className="text-sm text-gray-500">접수 → 배치 → 출석 → 수료 → 아카이브</p>
        </div>
        <button onClick={() => void signOut()} className="text-sm text-gray-400 hover:text-gray-600">
          로그아웃
        </button>
      </header>

      {loadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ 로드 오류: {loadError}
        </div>
      )}

      <section className="grid gap-3 mb-8">
        {listLoading && <p className="text-sm text-gray-400">목록 불러오는 중…</p>}
        {!listLoading && semesters.length === 0 && !loadError && (
          <p className="text-sm text-gray-400">아직 학기가 없습니다. 아래에서 첫 학기를 만들어보세요.</p>
        )}
        {semesters.map((s) => (
          <Link
            key={s.id}
            href={`/semester/${s.id}`}
            className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
          >
            <div className="font-semibold">{s.meta.title}</div>
            <div className="text-xs text-gray-400 mt-1">{s.id}</div>
          </Link>
        ))}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-semibold mb-3">새 학기 만들기</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="학기 ID (예: 2026-1)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="제목 (비우면 자동)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={creating || !newId.trim()}
            className="px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 disabled:opacity-50 text-sm font-medium"
          >
            {creating ? "생성 중…" : "생성"}
          </button>
        </div>
      </section>
    </main>
  );
}
