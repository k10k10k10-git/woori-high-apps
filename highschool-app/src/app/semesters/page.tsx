"use client";

// 학기 목록 — 통합 셸·브랜드 토큰을 수련회 행정·이가드 화면과 공유한다.
// 사이트 제목·계정·로그아웃은 전역 헤더가 담당한다(중복 제목 줄을 두지 않는다).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { canDestroySemester, canEditArea } from "@/features/portal/accessPolicy";
import { subscribeSemesters, createSemester, removeSemester } from "@/features/semester/db";
import { Semester } from "@/features/semester/types";
import LoginButton from "@/components/LoginButton";
import { activeTeamKeys, canAccessOperationsCenter, ownTeamKey } from "@/features/teams/teamModel";

export default function SemestersPage() {
  const router = useRouter();
  const { user, loading, roles, teamMemberships, signIn, signOut } = useAuth();
  const { toast } = useUI();
  const allowed = canAccessOperationsCenter(roles, teamMemberships);
  const canEdit = allowed && canEditArea("semester", roles);
  const ownTeam = ownTeamKey(roles, teamMemberships);
  const assignedTeams = activeTeamKeys(teamMemberships);
  // 학기 삭제·아카이브는 되돌릴 수 없다 — 통합관리자·교역자만.
  const canDestroy = canDestroySemester(roles);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  // 삭제는 되돌릴 수 없다 — 학기 ID를 직접 입력해야 실행된다
  const [deleteTarget, setDeleteTarget] = useState<Semester | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (loading || !user || allowed || assignedTeams.length === 0) return;
    router.replace(ownTeam ? `/teams/${ownTeam}` : "/teams");
  }, [allowed, assignedTeams.length, loading, ownTeam, router, user]);

  useEffect(() => {
    if (!user || !allowed) return;
    setListLoading(true);
    setLoadError(null);
    return subscribeSemesters(
      (list) => { setSemesters(list); setListLoading(false); },
      (error) => { setLoadError(error.message); setListLoading(false); },
    );
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
    } catch (e) {
      toast(`생성 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleteInput.trim() !== deleteTarget.id) return;
    setDeleting(true);
    try {
      await removeSemester(deleteTarget.id);
      toast(`${deleteTarget.id} 학기를 삭제했습니다`, "success");
      setDeleteTarget(null);
      setDeleteInput("");
    } catch (e) {
      toast(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-slate-500">불러오는 중…</main>;
  }

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold">학기 운영</h1>
        <p className="text-sm text-slate-500">분당우리교회 고등부 · 훈련·사역팀 관리</p>
        <LoginButton signIn={signIn} />
      </main>
    );
  }

  if (!allowed) {
    if (assignedTeams.length > 0) return <main className="team-first-state" role="status">담당 팀 화면으로 이동하고 있습니다…</main>;
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
    <div className="semester-scope app-page">
      <main className="page-container max-w-5xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-900">훈련·사역팀</h1>
            <p className="mt-1 text-sm text-slate-500">훈련과 사역팀의 신청부터 수료까지 한 흐름으로 관리합니다.</p>
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

        <section className="mb-7 grid gap-4 sm:grid-cols-2">
          {listLoading && <p className="text-sm text-slate-400">목록 불러오는 중…</p>}
          {!listLoading && semesters.length === 0 && !loadError && (
            <p className="text-sm text-slate-400">
              {canEdit ? "아직 학기가 없습니다. 아래에서 첫 학기를 만들어보세요." : "등록된 학기가 없습니다."}
            </p>
          )}
          {semesters.map((s) => (
            <div key={s.id} className="card card-body relative" data-hover>
              <Link href={`/operations/semesters/${encodeURIComponent(s.id)}/overview`} className="flex flex-col gap-2">
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
              {canDestroy && (
                <button
                  onClick={() => { setDeleteTarget(s); setDeleteInput(""); }}
                  className="self-end text-xs text-slate-500 transition-colors hover:text-red-500"
                >
                  학기 삭제
                </button>
              )}
            </div>
          ))}
        </section>

        {canEdit && (
          <section className="card card-body">
            <h2 className="font-semibold text-slate-800">새 학기 만들기</h2>
            <div className="flex flex-col items-end gap-2 sm:flex-row">
              <label className="w-full flex-1 text-xs font-semibold text-slate-500">
                학기 ID
                <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="예: 2026-1" className="input mt-1 w-full" />
              </label>
              <label className="w-full flex-1 text-xs font-semibold text-slate-500">
                학기 제목
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="비우면 자동 입력" className="input mt-1 w-full" />
              </label>
              <button onClick={() => void handleCreate()} disabled={creating || !newId.trim()} className="btn-primary justify-center">
                {creating ? "생성 중…" : "생성"}
              </button>
            </div>
          </section>
        )}
        {deleteTarget && (
          <div
            className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
            onClick={() => setDeleteTarget(null)}
            onKeyDown={(e) => e.key === "Escape" && setDeleteTarget(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="학기 삭제 확인"
              className="modal-card card w-full max-w-md p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-slate-900">학기를 삭제할까요?</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                <strong>{deleteTarget.meta.title}</strong>({deleteTarget.id})의 신청·배치·출석·수료·커리큘럼·아카이브와
                연락처 등 비공개 정보가 <strong className="text-red-600">모두 삭제</strong>됩니다. 되돌릴 수 없습니다.
              </p>
              <label className="mt-4 block text-sm">
                <span className="text-xs text-slate-500">확인을 위해 학기 ID <strong>{deleteTarget.id}</strong>를 입력하세요</span>
                <input
                  autoFocus
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder={deleteTarget.id}
                  aria-label="삭제 확인용 학기 ID"
                  className="input mt-1"
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary">취소</button>
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleting || deleteInput.trim() !== deleteTarget.id}
                  className="btn-danger"
                >
                  {deleting ? "삭제 중…" : "영구 삭제"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
