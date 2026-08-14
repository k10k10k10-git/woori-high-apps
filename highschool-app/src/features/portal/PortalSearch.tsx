"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea, canManageRolesOf } from "./accessPolicy";
import { buildPeopleProfiles, groupPersonRecordsByYear, PERSON_KIND_LABEL, searchPeople, type PersonProfile, type PersonRecord } from "./peopleSearch";
import { subscribePeopleSearchData } from "./peopleSearchDb";

const CATEGORY_STYLE: Record<PersonRecord["category"], string> = {
  "학적·출석": "bg-blue-50 text-blue-700",
  "학기 중 사역": "bg-emerald-50 text-emerald-700",
  "새친구": "bg-amber-50 text-amber-700",
  "수련회": "bg-violet-50 text-violet-700",
};

export default function PortalSearch() {
  const { roles } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<PersonProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const includeSemester = canAccessArea("semester", roles);
  const includePrivate = canAccessArea("retreat-admin", roles);
  const includeAttendancePrivate = canManageRolesOf(roles);
  const loadKey = `${roles}:${includeSemester}:${includePrivate}:${includeAttendancePrivate}`;

  const beginOpen = useCallback(() => {
    setOpen(true);
    setLoading(true);
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return;
    return subscribePeopleSearchData(
      { includeSemester, includePrivate, includeAttendancePrivate },
      (data) => { setProfiles(buildPeopleProfiles(data)); setLoading(false); },
      (source, cause) => {
        console.error(`people search subscription failed: ${source}`, cause);
        setError("인물 데이터를 실시간으로 불러오지 못했습니다. 잠시 후 다시 열어 주세요.");
        setLoading(false);
      },
    );
  }, [includeAttendancePrivate, includePrivate, includeSemester, loadKey, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        beginOpen();
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        beginOpen();
      } else if (event.key === "Escape") {
        if (selectedId) setSelectedId(null);
        else setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginOpen, selectedId]);

  const results = useMemo(() => searchPeople(profiles, query), [profiles, query]);
  const selected = useMemo(() => profiles.find((profile) => profile.id === selectedId) ?? null, [profiles, selectedId]);

  function close() {
    setOpen(false);
    setQuery("");
    setSelectedId(null);
  }

  return (
    <>
      <button type="button" onClick={beginOpen} className="portal-search-trigger" aria-label="인물 통합검색 열기">
        <MagnifyingGlass aria-hidden="true" size={15} weight="regular" />
        <span className="portal-search-label">인물 통합검색</span>
        <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-on-dark-muted)] xl:inline">⌘K</kbd>
      </button>
      {open && (
        <div className="modal-backdrop fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/60 px-3 pt-[5vh] backdrop-blur-[2px] sm:px-5 sm:pt-[8vh]" onMouseDown={close}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="인물 통합검색"
            className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${selected ? "max-w-5xl" : "max-w-2xl"}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {selected ? (
              <PersonDetail profile={selected} onBack={() => setSelectedId(null)} onClose={close} />
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
                  <MagnifyingGlass aria-hidden="true" className="text-slate-400" size={20} weight="regular" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="학생·교사·스탭 이름을 입력하세요"
                    aria-label="인물 이름"
                    className="min-h-11 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
                  />
                  <button type="button" onClick={close} className="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100">ESC</button>
                </div>
                <div className="min-h-52 flex-1 overflow-y-auto p-2.5">
                  {loading ? <SearchState title="고등부 인물 기록을 모으고 있습니다…" description="학적·출석, 학기 사역, 새친구, 수련회 데이터를 연결합니다." />
                    : error ? <SearchState title={error} description="창을 닫았다가 다시 열어 재시도할 수 있습니다." />
                    : query.trim().length < 2 ? <SearchState title="인물 이름으로 검색하세요." description="학생·교사·스탭 이름을 두 글자 이상 입력하면 현재 DB 기록에서 찾습니다." />
                    : results.length > 0 ? results.map((profile) => (
                      <button key={profile.id} type="button" onClick={() => setSelectedId(profile.id)} className="group flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition hover:bg-slate-50 focus-visible:bg-slate-50">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-sm font-extrabold text-emerald-700">{profile.name.slice(0, 1)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <strong className="text-[15px] text-slate-900">{profile.name}</strong>
                            {profile.kinds.map((kind) => <span key={kind} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{PERSON_KIND_LABEL[kind]}</span>)}
                            {profile.ambiguous && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">동명이인 구분</span>}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {profile.latestClass ?? "학적 기록 없음"} · 관련 기록 {profile.records.length}건
                            {profile.years.length > 0 ? ` · ${profile.years.join(", ")}` : ""}
                          </span>
                        </span>
                        <span aria-hidden="true" className="mt-2 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600">→</span>
                      </button>
                    )) : <SearchState title="일치하는 인물이 없습니다." description="띄어쓰기 없이 이름 전체 또는 일부를 다시 입력해 보세요." />}
                </div>
                <footer className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] text-slate-500">
                  유형이 다르거나 같은 연도에 후보가 여럿이면 분리합니다. 학생은 이름·생년·부서·진급 흐름이 유일할 때만 연도별 기록을 묶습니다.
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function SearchState({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1.5 text-xs text-slate-400">{description}</p>
    </div>
  );
}

function PersonDetail({ profile, onBack, onClose }: { profile: PersonProfile; onBack: () => void; onClose: () => void }) {
  const yearGroups = useMemo(() => groupPersonRecordsByYear(profile.records), [profile.records]);
  const [selectedYear, setSelectedYear] = useState(() => yearGroups[0]?.year ?? "");
  const activeGroup = yearGroups.find((group) => group.year === selectedYear) ?? yearGroups[0];

  return (
    <>
      <header className="flex items-start gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
        <button type="button" onClick={onBack} className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="검색 결과로 돌아가기">←</button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">{profile.name}</h2>
            {profile.kinds.map((kind) => <span key={kind} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{PERSON_KIND_LABEL[kind]}</span>)}
            {profile.ambiguous && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">동명이인 후보</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">{profile.latestClass ?? "학적 기록 없음"} · 연결된 기록 {profile.records.length}건</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100">ESC</button>
      </header>
      <div className="flex-1 overflow-y-auto bg-slate-50/70 px-3 py-4 sm:px-6 sm:py-6">
        {profile.ambiguous && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
            같은 이름의 서로 다른 식별자가 있어 별도 인물로 나눴습니다. 학년·반과 연락처를 확인해 주세요.
          </div>
        )}
        {yearGroups.length > 0 && activeGroup ? (
          <div>
            <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
              <div className="flex min-w-max gap-1" role="tablist" aria-label="연도별 인물 기록">
                {yearGroups.map((group) => (
                  <button
                    key={group.year}
                    type="button"
                    role="tab"
                    aria-selected={group.year === activeGroup.year}
                    onClick={() => setSelectedYear(group.year)}
                    className={`rounded-lg px-5 py-2.5 text-sm font-extrabold transition ${group.year === activeGroup.year ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
                  >
                    {group.label}
                    <span className={`ml-1.5 text-[10px] ${group.year === activeGroup.year ? "text-slate-300" : "text-slate-400"}`}>{group.records.length}건</span>
                  </button>
                ))}
              </div>
            </div>
            <section role="tabpanel" aria-label={`${activeGroup.label} 기록`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
                <div>
                  <p className="text-[11px] font-bold text-emerald-700">연도별 통합 기록</p>
                  <h3 className="mt-0.5 text-lg font-extrabold text-slate-950">{activeGroup.label}</h3>
                </div>
                <p className="text-xs font-semibold text-slate-500">{activeGroup.records.length}건의 연결된 정보</p>
              </header>
              <div className="space-y-3 p-3 sm:p-4">
                {activeGroup.records.map((record) => <RecordCard key={record.id} record={record} />)}
              </div>
            </section>
          </div>
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-400">표시할 연도별 기록이 없습니다.</p>
        )}
      </div>
      <footer className="border-t border-slate-100 bg-white px-5 py-3 text-[11px] text-slate-500">
        표시 내용은 검색 창을 열 때 현재 DB를 조회해 묶은 결과이며, 이 화면에서 데이터는 수정되지 않습니다.
      </footer>
    </>
  );
}

function RecordCard({ record }: { record: PersonRecord }) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <span className={`mt-0.5 rounded-md px-2 py-1 text-[10px] font-extrabold ${CATEGORY_STYLE[record.category]}`}>{record.category}</span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm text-slate-900">{record.title}</strong>
          <span className="mt-0.5 block text-[11px] text-slate-500">{record.period}</span>
        </span>
        {record.private && <span className="text-[10px] font-semibold text-rose-500">민감정보 포함</span>}
      </header>
      {record.fields.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {record.fields.map((item, index) => (
            <div key={`${item.label}-${index}`} className={item.value.length > 34 ? "sm:col-span-2 lg:col-span-3" : ""}>
              <dt className="text-[10px] font-bold text-slate-400">{item.label}</dt>
              <dd className={`mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 ${item.sensitive ? "text-slate-700" : "text-slate-800"}`}>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="px-4 py-4 text-xs text-slate-400">상세 값이 없습니다.</p>}
    </article>
  );
}
