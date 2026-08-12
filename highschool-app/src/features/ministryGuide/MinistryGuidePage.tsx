"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import LandingPage from "@/features/landing/LandingPage";
import { canAccessArea } from "@/features/portal/accessPolicy";
import {
  buildAnnouncementTemplate,
  getMonthlyMinistry,
  MINISTRY_GUIDE_SECTIONS,
  MINISTRY_THEME,
  MONTHLY_MINISTRIES,
  RETREAT_FEEDFORWARD_QUESTIONS,
  type MinistryGuideSection,
} from "./ministryGuideContent";

const CATEGORIES = ["전체", "예배·목양", "훈련·리더십", "수련회", "행정·소통", "특별사역"] as const;

type Category = (typeof CATEGORIES)[number];

const CATEGORY_TONE: Record<MinistryGuideSection["category"], string> = {
  "예배·목양": "guide-tone-blue",
  "훈련·리더십": "guide-tone-green",
  수련회: "guide-tone-violet",
  "행정·소통": "guide-tone-amber",
  특별사역: "guide-tone-rose",
};

export default function MinistryGuidePage() {
  const { user, loading, roles, signIn } = useAuth();
  const [category, setCategory] = useState<Category>("전체");
  const [query, setQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");
  const [notice, setNotice] = useState({
    background: "",
    audience: "",
    schedule: "",
    method: "",
    deadline: "",
    closing: "",
  });

  const monthly = getMonthlyMinistry(selectedMonth);
  const noticePreview = buildAnnouncementTemplate(notice);
  const filteredSections = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    return MINISTRY_GUIDE_SECTIONS.filter((section) => {
      if (category !== "전체" && section.category !== category) return false;
      if (!keyword) return true;
      const haystack = [
        section.title,
        section.summary,
        section.sourceNote,
        ...section.principles,
        ...section.checklist,
      ].join(" ").toLocaleLowerCase("ko-KR");
      return haystack.includes(keyword);
    });
  }, [category, query]);

  async function copyNotice() {
    try {
      await navigator.clipboard.writeText(noticePreview);
      setCopyState("done");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
    }
  }

  if (loading) return <main className="min-h-screen grid place-items-center text-slate-500">불러오는 중…</main>;
  if (!user) return <LandingPage signIn={signIn} />;
  if (!canAccessArea("home", roles)) {
    return (
      <main className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-bold">접근 승인이 필요합니다</h1>
          <p className="mt-2 text-sm text-slate-500">승인된 교사·스탭만 사역 가이드를 볼 수 있습니다.</p>
          <Link href="/" className="btn-primary mt-5">홈으로</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="app-page ministry-guide-page">
      <main className="page-container pb-16">
        <section className="ministry-guide-hero">
          <div className="min-w-0">
            <p className="page-eyebrow">MINISTRY PLAYBOOK</p>
            <h1 className="page-title">사역 가이드</h1>
            <p className="page-description max-w-3xl">흩어진 사역 문서에서 반복되는 운영 원칙을 실제 현장에서 바로 확인할 수 있도록 정리했습니다.</p>
          </div>
          <div className="ministry-guide-theme">
            <span className="guide-status">{MINISTRY_THEME.status}</span>
            <strong>{MINISTRY_THEME.title}</strong>
            <p>{MINISTRY_THEME.verse}</p>
          </div>
        </section>

        <div className="guide-privacy-note" role="note">
          <span aria-hidden="true">🔒</span>
          <p><strong>운영 원칙만 담았습니다.</strong> 학생 실명·연락처·주소·가정 및 건강 특이사항은 이 가이드에 포함하지 않습니다. 미결 아이디어와 가안은 확정 규정으로 표시하지 않습니다.</p>
        </div>

        <section className="surface-panel guide-month-panel">
          <div className="guide-section-heading">
            <div>
              <p className="section-kicker">YEARLY RHYTHM</p>
              <h2 className="section-title">2026 월별 사역 흐름</h2>
              <p>월을 선택하면 이번 달에 함께 봐야 할 커리큘럼과 집중 사역을 확인할 수 있습니다.</p>
            </div>
            <span className="guide-status">사역계획 가안</span>
          </div>
          <div className="guide-month-tabs" role="tablist" aria-label="월 선택">
            {MONTHLY_MINISTRIES.map((item) => (
              <button
                key={item.month}
                type="button"
                role="tab"
                aria-selected={selectedMonth === item.month}
                onClick={() => setSelectedMonth(item.month)}
              >
                {item.month}월
              </button>
            ))}
          </div>
          <div className="guide-month-brief" role="tabpanel">
            <div className="guide-month-number"><span>{monthly.month}</span>월</div>
            <div>
              <span className="guide-field-label">커리큘럼</span>
              <h3>{monthly.curriculum}</h3>
            </div>
            <div>
              <span className="guide-field-label">집중 사역</span>
              <div className="guide-chip-list">
                {monthly.focus.map((focus) => <span key={focus}>{focus}</span>)}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-7">
          <div className="guide-section-heading">
            <div>
              <p className="section-kicker">FIELD GUIDES</p>
              <h2 className="section-title">운영 플레이북</h2>
              <p>해야 할 일뿐 아니라 왜 그렇게 운영하는지도 함께 확인하세요.</p>
            </div>
            <label className="guide-search">
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 결석, 수련회, 정산" aria-label="가이드 검색" />
            </label>
          </div>
          <div className="guide-category-tabs" aria-label="가이드 범주">
            {CATEGORIES.map((item) => (
              <button key={item} type="button" data-active={category === item ? "true" : undefined} onClick={() => setCategory(item)}>{item}</button>
            ))}
          </div>

          {filteredSections.length > 0 ? (
            <div className="guide-card-grid">
              {filteredSections.map((section) => <GuideCard key={section.id} section={section} />)}
            </div>
          ) : (
            <div className="surface-panel mt-4 p-10 text-center text-sm text-slate-500">검색 조건에 맞는 가이드가 없습니다.</div>
          )}
        </section>

        <section className="guide-tools-grid mt-8">
          <div className="surface-panel guide-tool-card">
            <div className="guide-section-heading">
              <div>
                <p className="section-kicker">ANNOUNCEMENT</p>
                <h2 className="section-title">공지 작성 도우미</h2>
                <p>정보를 넣으면 고등부 공지 5단 구조로 정리합니다. 입력 내용은 저장되지 않습니다.</p>
              </div>
            </div>
            <div className="guide-form-grid">
              <GuideInput label="배경 한 줄" value={notice.background} onChange={(value) => setNotice({ ...notice, background: value })} placeholder="예: 여름수련회 신청을 안내드립니다." wide />
              <GuideInput label="대상" value={notice.audience} onChange={(value) => setNotice({ ...notice, audience: value })} placeholder="고등부 학생·학부모" />
              <GuideInput label="일정·장소" value={notice.schedule} onChange={(value) => setNotice({ ...notice, schedule: value })} placeholder="7월 24~26일 · 수련회장" />
              <GuideInput label="신청·참여 방법" value={notice.method} onChange={(value) => setNotice({ ...notice, method: value })} placeholder="통합사이트에서 신청" />
              <GuideInput label="마감일" value={notice.deadline} onChange={(value) => setNotice({ ...notice, deadline: value })} placeholder="7월 10일 (D-7)" />
              <GuideInput label="마무리" value={notice.closing} onChange={(value) => setNotice({ ...notice, closing: value })} placeholder="기도로 함께 준비해주세요. 감사합니다." wide />
            </div>
            <div className="guide-notice-preview">
              <pre>{noticePreview}</pre>
              <button type="button" onClick={() => void copyNotice()} className="btn-primary">
                {copyState === "done" ? "복사 완료" : copyState === "failed" ? "복사 실패" : "공지문 복사"}
              </button>
            </div>
          </div>

          <div className="surface-panel guide-tool-card">
            <div className="guide-section-heading">
              <div>
                <p className="section-kicker">FEEDFORWARD</p>
                <h2 className="section-title">수련회 회고 질문</h2>
                <p>은혜를 먼저 발견하고, 문제를 다음 행동으로 연결하는 네 문항입니다.</p>
              </div>
            </div>
            <ol className="guide-question-list">
              {RETREAT_FEEDFORWARD_QUESTIONS.map((question, index) => (
                <li key={question}><span>{index + 1}</span><p>{question}</p></li>
              ))}
            </ol>
            <div className="guide-review-principles">
              <h3>다음 기획 전 함께 확인할 것</h3>
              <ul>
                <li>모든 학생이 실제로 참여할 수 있는가?</li>
                <li>GBS·기도 시간이 일정 지연에서 보호되는가?</li>
                <li>교사와 스탭의 역할이 한쪽에 치우치지 않았는가?</li>
                <li>불필요한 대기·이동을 줄이고 휴식을 확보했는가?</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function GuideCard({ section }: { section: MinistryGuideSection }) {
  return (
    <article className={`guide-card ${CATEGORY_TONE[section.category]}`}>
      <div className="guide-card-topline"><span>{section.category}</span><span>근거 · {section.sourceNote}</span></div>
      <h3>{section.title}</h3>
      <p className="guide-card-summary">{section.summary}</p>
      <div className="guide-card-block">
        <h4>운영 원칙</h4>
        <ul>{section.principles.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <div className="guide-card-block guide-card-checklist">
        <h4>체크리스트</h4>
        <ul>{section.checklist.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
      </div>
      {section.caution && <div className="guide-card-caution">개인정보 주의 · {section.caution}</div>}
    </article>
  );
}

function GuideInput({ label, value, onChange, placeholder, wide = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; wide?: boolean }) {
  return (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
