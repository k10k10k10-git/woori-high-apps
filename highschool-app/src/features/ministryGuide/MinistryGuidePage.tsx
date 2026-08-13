"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import LandingPage from "@/features/landing/LandingPage";
import { canAccessArea, canEditArea, iguardScopeOf } from "@/features/portal/accessPolicy";
import { saveMinistryGuideSection, saveMonthlyMinistry, subscribeToMinistryGuideOverrides } from "./db";
import {
  MINISTRY_GUIDE_SECTIONS,
  MINISTRY_THEME,
  MONTHLY_MINISTRIES,
  type MinistryGuideSection,
  type MonthlyMinistry,
} from "./ministryGuideContent";
import { applyMinistryGuideOverrides } from "./ministryGuidePersistence";

const CATEGORIES = ["전체", "예배·목양", "훈련·리더십", "수련회", "행정·소통", "특별사역"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_TONE: Record<MinistryGuideSection["category"], string> = {
  "예배·목양": "guide-tone-blue",
  "훈련·리더십": "guide-tone-green",
  수련회: "guide-tone-violet",
  "행정·소통": "guide-tone-amber",
  특별사역: "guide-tone-rose",
};

const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);

export default function MinistryGuidePage() {
  const { user, loading, roles, signIn } = useAuth();
  const [category, setCategory] = useState<Category>("전체");
  const [query, setQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [monthlyItems, setMonthlyItems] = useState(MONTHLY_MINISTRIES);
  const [sections, setSections] = useState(MINISTRY_GUIDE_SECTIONS);
  const [monthDraft, setMonthDraft] = useState<MonthlyMinistry | null>(null);
  const [sectionDraft, setSectionDraft] = useState<MinistryGuideSection | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canEditGuide = canEditArea("retreat-admin", roles) || iguardScopeOf(roles) === "all";

  useEffect(() => {
    if (!user || !canAccessArea("home", roles)) return;
    return subscribeToMinistryGuideOverrides(
      (overrides) => {
        const merged = applyMinistryGuideOverrides(MONTHLY_MINISTRIES, MINISTRY_GUIDE_SECTIONS, overrides);
        setMonthlyItems(merged.monthly);
        setSections(merged.sections);
        setLoadError(null);
      },
      () => setLoadError("편집된 가이드 내용을 불러오지 못해 기본 내용을 표시합니다."),
    );
  }, [roles, user]);

  const monthly = monthlyItems.find((item) => item.month === selectedMonth) ?? monthlyItems[0];
  const filteredSections = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    return sections.filter((section) => {
      if (category !== "전체" && section.category !== category) return false;
      if (!keyword) return true;
      return [section.title, section.summary, section.sourceNote, ...section.principles, ...section.checklist]
        .join(" ").toLocaleLowerCase("ko-KR").includes(keyword);
    });
  }, [category, query, sections]);

  async function saveMonth() {
    if (!monthDraft?.curriculum.trim() || monthDraft.focus.length === 0) {
      setMessage("커리큘럼과 집중 사역을 한 항목 이상 입력해 주세요.");
      return;
    }
    setSavingKey(`month-${monthDraft.month}`);
    setMessage(null);
    try {
      await saveMonthlyMinistry({ ...monthDraft, curriculum: monthDraft.curriculum.trim() });
      setMonthDraft(null);
      setMessage(`${monthDraft.month}월 사역 흐름을 저장했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "월별 사역 흐름을 저장하지 못했습니다.");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveSection() {
    if (!sectionDraft?.title.trim() || !sectionDraft.summary.trim() || sectionDraft.principles.length === 0 || sectionDraft.checklist.length === 0) {
      setMessage("제목·설명·운영 원칙·체크리스트를 모두 입력해 주세요.");
      return;
    }
    setSavingKey(`section-${sectionDraft.id}`);
    setMessage(null);
    try {
      await saveMinistryGuideSection({
        ...sectionDraft,
        title: sectionDraft.title.trim(),
        summary: sectionDraft.summary.trim(),
        sourceNote: sectionDraft.sourceNote.trim(),
        ...(sectionDraft.caution?.trim() ? { caution: sectionDraft.caution.trim() } : { caution: undefined }),
      });
      setSectionDraft(null);
      setMessage("부서 운영 가이드 라인을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "부서 운영 가이드 라인을 저장하지 못했습니다.");
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) return <main className="min-h-screen grid place-items-center text-slate-500">불러오는 중…</main>;
  if (!user) return <LandingPage signIn={signIn} />;
  if (!canAccessArea("home", roles)) {
    return (
      <main className="min-h-screen grid place-items-center px-6 text-center"><div>
        <h1 className="text-xl font-bold">접근 승인이 필요합니다</h1>
        <p className="mt-2 text-sm text-slate-500">승인된 교사·스탭만 사역 가이드를 볼 수 있습니다.</p>
        <Link href="/" className="btn-primary mt-5">홈으로</Link>
      </div></main>
    );
  }

  return (
    <div className="app-page ministry-guide-page">
      <main className="page-container pb-16">
        <section className="ministry-guide-hero">
          <div className="min-w-0">
            <p className="page-eyebrow">MINISTRY GUIDE</p>
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
          <p><strong>운영 원칙만 담습니다.</strong> 학생 실명·연락처·주소·가정 및 건강 특이사항은 이 가이드에 입력하지 마세요.</p>
        </div>
        {(loadError || message) && <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${loadError ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`} role="status">{loadError || message}</div>}

        <section className="surface-panel guide-month-panel">
          <div className="guide-section-heading">
            <div>
              <p className="section-kicker">YEARLY RHYTHM</p>
              <h2 className="section-title">2026 월별 사역 흐름</h2>
              <p>월을 선택하면 커리큘럼과 집중 사역을 확인하고 권한 있는 담당자는 내용을 수정할 수 있습니다.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="guide-status">사역계획 가안</span>
              {canEditGuide && !monthDraft && <button type="button" className="btn-secondary btn-sm" onClick={() => { setMonthDraft({ ...monthly, focus: [...monthly.focus] }); setMessage(null); }}>이 달 수정</button>}
            </div>
          </div>
          <div className="guide-month-tabs" role="tablist" aria-label="월 선택">
            {monthlyItems.map((item) => (
              <button key={item.month} type="button" role="tab" aria-selected={selectedMonth === item.month}
                onClick={() => { setSelectedMonth(item.month); setMonthDraft(null); }}>{item.month}월</button>
            ))}
          </div>
          {monthDraft ? (
            <div className="guide-edit-panel" aria-label={`${monthDraft.month}월 사역 흐름 수정`}>
              <label><span>커리큘럼</span><input className="form-control" maxLength={180} value={monthDraft.curriculum} onChange={(event) => setMonthDraft({ ...monthDraft, curriculum: event.target.value })} /></label>
              <label><span>집중 사역 · 한 줄에 하나씩</span><textarea className="form-control min-h-28" maxLength={380} value={monthDraft.focus.join("\n")} onChange={(event) => setMonthDraft({ ...monthDraft, focus: lines(event.target.value) })} /></label>
              <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setMonthDraft(null)}>취소</button><button type="button" className="btn-primary" disabled={savingKey !== null} onClick={() => void saveMonth()}>{savingKey ? "저장 중…" : "저장"}</button></div>
            </div>
          ) : (
            <div className="guide-month-brief" role="tabpanel">
              <div className="guide-month-number"><span>{monthly.month}</span>월</div>
              <div><span className="guide-field-label">커리큘럼</span><h3>{monthly.curriculum}</h3></div>
              <div><span className="guide-field-label">집중 사역</span><div className="guide-chip-list">{monthly.focus.map((focus) => <span key={focus}>{focus}</span>)}</div></div>
            </div>
          )}
        </section>

        <section className="mt-7">
          <div className="guide-section-heading">
            <div><p className="section-kicker">DEPARTMENT GUIDELINES</p><h2 className="section-title">부서 운영 가이드 라인</h2><p>해야 할 일뿐 아니라 왜 그렇게 운영하는지도 함께 확인하고 수정할 수 있습니다.</p></div>
            <label className="guide-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 결석, 수련회, 정산" aria-label="가이드 검색" /></label>
          </div>
          <div className="guide-category-tabs" aria-label="가이드 범주">
            {CATEGORIES.map((item) => <button key={item} type="button" data-active={category === item ? "true" : undefined} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
          {filteredSections.length > 0 ? (
            <div className="guide-card-grid">
              {filteredSections.map((section) => sectionDraft?.id === section.id
                ? <GuideEditor key={section.id} section={sectionDraft} saving={savingKey !== null} onChange={setSectionDraft} onCancel={() => setSectionDraft(null)} onSave={() => void saveSection()} />
                : <GuideCard key={section.id} section={section} canEdit={canEditGuide} onEdit={() => { setSectionDraft({ ...section, principles: [...section.principles], checklist: [...section.checklist] }); setMessage(null); }} />)}
            </div>
          ) : <div className="surface-panel mt-4 p-10 text-center text-sm text-slate-500">검색 조건에 맞는 가이드가 없습니다.</div>}
        </section>
      </main>
    </div>
  );
}

function GuideCard({ section, canEdit, onEdit }: { section: MinistryGuideSection; canEdit: boolean; onEdit: () => void }) {
  return (
    <article className={`guide-card ${CATEGORY_TONE[section.category]}`}>
      <div className="guide-card-topline"><span>{section.category}</span><span>근거 · {section.sourceNote}</span></div>
      <div className="flex items-start justify-between gap-3"><h3>{section.title}</h3>{canEdit && <button type="button" className="btn-secondary btn-sm mt-4 shrink-0" onClick={onEdit}>수정</button>}</div>
      <p className="guide-card-summary">{section.summary}</p>
      <div className="guide-card-block"><h4>운영 원칙</h4><ul>{section.principles.map((item) => <li key={item}>{item}</li>)}</ul></div>
      <div className="guide-card-block guide-card-checklist"><h4>체크리스트</h4><ul>{section.checklist.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul></div>
      {section.caution && <div className="guide-card-caution">개인정보 주의 · {section.caution}</div>}
    </article>
  );
}

function GuideEditor({ section, saving, onChange, onCancel, onSave }: { section: MinistryGuideSection; saving: boolean; onChange: (value: MinistryGuideSection) => void; onCancel: () => void; onSave: () => void }) {
  return (
    <article className={`guide-card guide-card-editor ${CATEGORY_TONE[section.category]}`}>
      <div className="guide-card-topline"><span>{section.category}</span><span>부서 운영 가이드 수정</span></div>
      <div className="guide-editor-fields">
        <label><span>제목</span><input className="form-control" maxLength={60} value={section.title} onChange={(event) => onChange({ ...section, title: event.target.value })} /></label>
        <label><span>요약</span><textarea className="form-control min-h-20" maxLength={150} value={section.summary} onChange={(event) => onChange({ ...section, summary: event.target.value })} /></label>
        <label><span>근거 문서</span><input className="form-control" maxLength={100} value={section.sourceNote} onChange={(event) => onChange({ ...section, sourceNote: event.target.value })} /></label>
        <label><span>운영 원칙 · 한 줄에 하나씩</span><textarea className="form-control min-h-36" maxLength={380} value={section.principles.join("\n")} onChange={(event) => onChange({ ...section, principles: lines(event.target.value) })} /></label>
        <label><span>체크리스트 · 한 줄에 하나씩</span><textarea className="form-control min-h-28" maxLength={300} value={section.checklist.join("\n")} onChange={(event) => onChange({ ...section, checklist: lines(event.target.value) })} /></label>
        <label><span>개인정보 주의 문구 · 선택</span><textarea className="form-control min-h-20" maxLength={120} value={section.caution ?? ""} onChange={(event) => onChange({ ...section, caution: event.target.value })} /></label>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onCancel}>취소</button><button type="button" className="btn-primary" disabled={saving} onClick={onSave}>{saving ? "저장 중…" : "저장"}</button></div>
    </article>
  );
}
