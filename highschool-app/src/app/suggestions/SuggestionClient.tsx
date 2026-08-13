"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea, describeRoles } from "@/features/portal/accessPolicy";
import { prepareSiteRequestAttachment } from "@/features/suggestions/attachment";
import { createSiteRequest } from "@/features/suggestions/db";
import { canSendSiteRequest } from "@/features/suggestions/siteRequest";

type Draft = {
  category: string;
  kind: string;
  title: string;
  description: string;
  page: string;
  urgency: string;
  reproduction: string;
  expected: string;
  anonymous: boolean;
};

const INITIAL: Draft = {
  category: "통합 홈",
  kind: "사이트 건의사항",
  title: "",
  description: "",
  page: "",
  urgency: "보통",
  reproduction: "",
  expected: "",
  anonymous: false,
};

export default function SuggestionClient() {
  const { user, loading, roles, memberName, signIn } = useAuth();
  const [draft, setDraft] = useState(INITIAL);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [sending, setSending] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const report = useMemo(() => {
    const reporter = draft.anonymous ? "익명" : (memberName || user?.displayName || user?.email || "이름 미확인");
    return [
      `[고등부 통합사이트 ${draft.kind}]`,
      `제목: ${draft.title.trim() || "(미입력)"}`,
      `분류: ${draft.category}`,
      `중요도: ${draft.urgency}`,
      `작성자: ${reporter}`,
      `권한: ${describeRoles(roles)}`,
      `화면/주소: ${draft.page.trim() || "(미입력)"}`,
      "",
      "현상·제안 내용",
      draft.description.trim() || "(미입력)",
      "",
      "재현 방법",
      draft.reproduction.trim() || "(해당 없음)",
      "",
      "원하는 결과",
      draft.expected.trim() || "(미입력)",
      "",
      `첨부 파일: ${attachment?.name ?? "없음"}`,
      `작성 시간: ${new Date().toLocaleString("ko-KR")}`,
    ].join("\n");
  }, [attachment?.name, draft, memberName, roles, user]);

  if (loading) return <main className="min-h-screen grid place-items-center text-slate-500">불러오는 중…</main>;
  if (!user) {
    return <main className="min-h-screen grid place-items-center px-6 text-center"><div><h1 className="text-xl font-bold">로그인이 필요합니다</h1><button onClick={() => void signIn()} className="btn-primary mt-5">Google로 로그인</button></div></main>;
  }
  if (!canAccessArea("home", roles)) {
    return <main className="min-h-screen grid place-items-center px-6 text-center"><div><h1 className="text-xl font-bold">접근 승인이 필요합니다</h1><Link href="/" className="btn-secondary mt-5">홈으로</Link></div></main>;
  }

  const canPrepare = canSendSiteRequest(draft);

  async function sendReport() {
    if (!user || sending) return;
    setSending(true);
    setMessage(attachment ? "첨부 이미지를 최적화하고 있습니다…" : "요청을 전송하고 있습니다…");
    setMessageType("success");
    try {
      const preparedAttachment = attachment ? await prepareSiteRequestAttachment(attachment) : undefined;
      const requestId = await createSiteRequest({
        ownerUid: user.uid,
        kind: draft.kind,
        category: draft.category,
        title: draft.title.trim(),
        description: draft.description.trim(),
        page: draft.page.trim(),
        urgency: draft.urgency,
        reproduction: draft.reproduction.trim(),
        expected: draft.expected.trim(),
        anonymous: draft.anonymous,
        reporterName: draft.anonymous ? "익명" : (memberName || user.displayName || "이름 미확인"),
        roleLabel: describeRoles(roles),
        createdAt: Date.now(),
        ...(preparedAttachment ? { attachment: preparedAttachment } : {}),
      });
      setDraft(INITIAL);
      setAttachment(null);
      setFileInputKey((value) => value + 1);
      setMessage(`요청을 전송했습니다. 접수번호 ${requestId.slice(-6)}`);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "요청을 전송하지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  return (
    <div className="app-page">
      <main className="page-container max-w-6xl">
        <section className="page-hero mb-7">
          <p className="page-eyebrow">PRODUCT FEEDBACK</p>
          <h1 className="page-title">사이트 건의사항</h1>
          <p className="page-description">오류 상황과 원하는 결과를 한 번에 정리해 개발 담당자에게 전달합니다.</p>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="surface-panel p-5 sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="제안 유형"><select value={draft.kind} onChange={(event) => update("kind", event.target.value)} className="form-control"><option>사이트 건의사항</option><option>오류 제보</option><option>사용법 문의</option><option>디자인 제안</option></select></Field>
              <Field label="화면 분류"><select value={draft.category} onChange={(event) => update("category", event.target.value)} className="form-control"><option>통합 홈</option><option>학기 중 사역</option><option>주일 사역</option><option>수련회 행정</option><option>수련회 이가드</option><option>팀원·권한</option><option>기타</option></select></Field>
              <Field label="제목" wide><input value={draft.title} onChange={(event) => update("title", event.target.value)} className="form-control" placeholder="예: 인원체크에서 취소 학생이 보여요" /></Field>
              <Field label="현상·제안 내용" wide><textarea value={draft.description} onChange={(event) => update("description", event.target.value)} className="form-control min-h-32" placeholder="무엇이 불편했고 어떤 상황에서 발생했는지 적어 주세요." /></Field>
              <Field label="페이지 이름 또는 주소"><input value={draft.page} onChange={(event) => update("page", event.target.value)} className="form-control" placeholder="예: 수련회 › 인원체크" /></Field>
              <Field label="중요도"><select value={draft.urgency} onChange={(event) => update("urgency", event.target.value)} className="form-control"><option>낮음</option><option>보통</option><option>높음</option><option>긴급 · 사역 진행 불가</option></select></Field>
              <Field label="재현 방법" wide><textarea value={draft.reproduction} onChange={(event) => update("reproduction", event.target.value)} className="form-control min-h-24" placeholder="1. 어느 메뉴를 누르고  2. 무엇을 입력하면…" /></Field>
              <Field label="원하는 결과" wide><textarea value={draft.expected} onChange={(event) => update("expected", event.target.value)} className="form-control min-h-24" placeholder="정상적이라면 어떻게 보여야 하는지 적어 주세요." /></Field>
              <Field label="스크린샷 첨부" wide><input key={fileInputKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setAttachment(event.target.files?.[0] ?? null); setMessage(""); }} className="form-control file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold" /><p className="mt-1.5 text-[11px] text-slate-500">JPG·PNG·WEBP, 원본 12MB 이하. 전송할 때 최대 1600px·1.2MB로 안전하게 줄여 요청에 함께 보관합니다.</p></Field>
            </div>
            <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-4 text-sm text-slate-700"><input type="checkbox" checked={draft.anonymous} onChange={(event) => update("anonymous", event.target.checked)} className="h-4 w-4" />작성자 이름을 익명으로 표시</label>
          </section>

          <aside className="surface-panel self-start p-5 sm:p-6 xl:sticky xl:top-24">
            <p className="section-kicker">PREVIEW</p>
            <h2 className="mt-1 text-lg font-bold">전송할 내용</h2>
            <pre className="mt-4 max-h-[480px] whitespace-pre-wrap overflow-y-auto rounded-xl bg-slate-950 p-4 text-[11px] leading-5 text-slate-200">{report}</pre>
            <button type="button" disabled={!canPrepare || sending} onClick={() => void sendReport()} className="btn-primary mt-4 w-full justify-center disabled:opacity-40">{sending ? "전송 중…" : "전송"}</button>
            {message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs ${messageType === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>}
            <p className="mt-4 text-[11px] leading-5 text-slate-500">전송한 내용은 통합관리자 마이페이지의 요청사항에 쌓입니다. 해결되면 다음 로그인 때 알림을 받습니다.</p>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}
