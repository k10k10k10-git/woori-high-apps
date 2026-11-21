"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, MagnifyingGlass, X } from "@phosphor-icons/react";
import OverlayShell from "@/components/OverlayShell";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea, searchScope } from "./accessPolicy";
import { buildPeopleProfiles, groupPersonRecordsByYear, PERSON_KIND_LABEL, searchPeople, type PersonProfile, type PersonRecord, type StudentRecordSource } from "./peopleSearch";
import { readCurrentStudentRoster, subscribePeopleSearchData, subscribeStudentAttendance } from "./peopleSearchDb";
import styles from "./portalSearch.module.css";

const EMPTY_PROFILES: PersonProfile[] = [];
const ROSTER_PREVIEW_MS = 60_000;

type RosterPreview = { expiresAt: number; profiles: PersonProfile[] };

const CATEGORY_STYLE: Record<PersonRecord["category"], string> = {
  "학적·출석": "bg-blue-50 text-blue-700",
  "학기 운영": "bg-emerald-50 text-emerald-700",
  "새친구": "bg-amber-50 text-amber-700",
  "수련회": "bg-violet-50 text-violet-700",
};

export default function PortalSearch() {
  const { user, roles, canSearchOfficialRoster } = useAuth();
  // 계정·권한이 달라지면 이전 계정의 검색 결과와 선택을 즉시 폐기한다.
  return <PortalSearchContent key={`${user?.uid ?? "anonymous"}:${roles.semester}:${roles.retreat}:${canSearchOfficialRoster}`} />;
}

function PortalSearchContent() {
  const { roles, canSearchOfficialRoster } = useAuth();
  // 인물검색은 전체 학생·출석·교사 원장 읽기 권한이 필요하다. 팀별 권한은
  // 서버에서 범위를 제한하는 검색을 갖추기 전까지 여기서 열지 않는다.
  const canSearch = canSearchOfficialRoster;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fullProfiles, setFullProfiles] = useState<PersonProfile[]>([]);
  const [rosterProfiles, setRosterProfiles] = useState<PersonProfile[] | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const recentRoster = useRef<RosterPreview | null>(null);

  const includeSemester = canAccessArea("semester", roles);
  const includePrivate = canAccessArea("retreat-admin", roles);
  // 역할 관리 권한과 인물검색 범위는 별개다. 교역자는 팀원을 배정하지 않아도
  // 기존처럼 출석부 연락처를 포함한 통합검색을 사용할 수 있다.
  const includeAttendancePrivate = searchScope(roles) === "write";
  const beginOpen = useCallback(() => {
    if (open) return;
    setFullProfiles([]);
    const cached = recentRoster.current;
    setRosterProfiles(cached && cached.expiresAt > Date.now() ? cached.profiles : null);
    setOpen(true);
    setLoading(true);
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open || !canSearch) return;
    let active = true;
    let entireRosterReady = false;
    if (!recentRoster.current || recentRoster.current.expiresAt <= Date.now()) {
      void readCurrentStudentRoster().then((data) => {
        if (!active || entireRosterReady) return;
        const profiles = buildPeopleProfiles(data);
        const preview = profiles.map((profile) => ({
          ...profile,
          records: profile.records.map((record) => ({ ...record, fields: [] })),
        }));
        recentRoster.current = { expiresAt: Date.now() + ROSTER_PREVIEW_MS, profiles: preview };
        setRosterProfiles(profiles);
      }).catch(() => { /* 현재 연도 조회가 실패해도 전체 검색은 이어 간다. */ });
    }
    const unsubscribe = subscribePeopleSearchData(
      { includeSemester, includePrivate, includeAttendancePrivate },
      (data) => {
        if (!active) return;
        entireRosterReady = true;
        setFullProfiles(buildPeopleProfiles(data));
        setLoading(false);
        setError("");
      },
      (source, cause) => {
        if (!active) return;
        if (source === "classes") {
          entireRosterReady = true;
          recentRoster.current = null;
          setRosterProfiles(null);
        }
        console.error(`people search subscription failed: ${source}`, cause);
        setError("인물 기록을 불러오지 못했습니다.");
        setLoading(false);
      },
      (data) => {
        if (!active) return;
        entireRosterReady = true;
        setRosterProfiles(buildPeopleProfiles(data));
      },
    );
    return () => { active = false; unsubscribe(); };
  }, [canSearch, includeAttendancePrivate, includePrivate, includeSemester, open, retry]);

  useEffect(() => {
    if (!open || selectedRecordId) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, selectedRecordId]);

  useEffect(() => {
    if (!canSearch) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        beginOpen();
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        beginOpen();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginOpen, canSearch]);

  const partial = loading || Boolean(error);
  const profiles = partial ? rosterProfiles ?? EMPTY_PROFILES : fullProfiles;
  const rosterReady = rosterProfiles !== null;
  const results = useMemo(() => searchPeople(profiles, query), [profiles, query]);
  const selected = useMemo(() => selectedRecordId ? profiles.find((profile) => profile.records.some((record) => record.id === selectedRecordId)) ?? null : null, [profiles, selectedRecordId]);

  function retryLoad() {
    recentRoster.current = null;
    setError("");
    setLoading(true);
    setFullProfiles([]);
    setRosterProfiles(null);
    setRetry((value) => value + 1);
  }

  const retryButton = <button type="button" className="btn-secondary" onClick={retryLoad}>다시 불러오기</button>;

  function close() {
    setFullProfiles([]);
    setRosterProfiles(null);
    setOpen(false);
    setQuery("");
    setSelectedRecordId(null);
  }

  if (!canSearch) return null;

  return (
    <>
      <button type="button" onClick={beginOpen} className="portal-search-trigger" aria-label="인물 통합검색 열기">
        <MagnifyingGlass aria-hidden="true" size={15} weight="regular" />
        <span className="portal-search-label">인물 통합검색</span>
        <kbd className="hidden rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-text-muted)] xl:inline">⌘K</kbd>
      </button>
      {open && (
        <OverlayShell
          label="인물 통합검색"
          onClose={selected ? () => setSelectedRecordId(null) : close}
          variant="fullscreen-mobile"
          panelClassName={`portal-search-dialog ${styles.dialog} ${selected ? styles.detailDialog : ""}`}
        >
            {selected ? (
              <PersonDetail
                profile={selected}
                onBack={() => setSelectedRecordId(null)}
                onClose={close}
                pending={partial ? (
                  <div role="status" className="mb-3 flex flex-wrap items-center gap-2 px-2 text-xs text-slate-600">
                    {error || "학기·수련회 등 관련 기록을 불러오는 중…"}
                    {error && retryButton}
                  </div>
                ) : undefined}
              />
            ) : (
              <>
                <header className={styles.searchHeader}>
                  <div className={styles.headingRow}><h2>인물 검색</h2><button type="button" onClick={close} className={styles.closeButton} aria-label="인물 검색 닫기"><X aria-hidden="true" size={20} /></button></div>
                  <div className={styles.searchField}>
                  <MagnifyingGlass aria-hidden="true" size={22} weight="regular" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="학생·교사·스탭 이름 검색"
                    aria-label="인물 이름"
                    autoComplete="off"
                    className={styles.searchInput}
                  />
                  {query && <button type="button" className={styles.clearButton} onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="검색어 지우기"><X aria-hidden="true" size={17} /></button>}
                  </div>
                </header>
                <div className={styles.results} aria-busy={loading && (!rosterReady || (query.trim().length >= 2 && results.length === 0))}>
                  {rosterReady && results.length > 0 && partial && (
                    <div className="px-3 py-2 text-xs text-slate-600" role="status">
                      {error ? <>학생 명단 결과를 표시하고 있습니다. {retryButton}</> : "학생 명단 결과 · 전체 기록을 불러오는 중…"}
                    </div>
                  )}
                  {error && results.length === 0 ? <SearchState title={error} description="연결 상태를 확인한 뒤 다시 불러와 주세요.">{retryButton}</SearchState>
                    : loading && (!rosterReady || (query.trim().length >= 2 && results.length === 0)) ? <SearchState title="고등부 인물 기록을 모으고 있습니다…" description="학적·출석, 학기 사역, 새친구, 수련회 데이터를 연결합니다." />
                    : query.trim().length < 2 ? <SearchState title="찾고 싶은 사람의 이름을 입력하세요" description="두 글자 이상 입력하면 학생·교사·스탭의 기록을 찾습니다." />
                    : results.length > 0 ? results.map((profile) => (
                      <button key={profile.id} type="button" onClick={() => setSelectedRecordId(profile.records[0].id)} className={`${styles.resultRow} group`}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-sm font-extrabold text-emerald-700">{profile.name.slice(0, 1)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <strong className="text-[15px] text-slate-900">{profile.name}</strong>
                            {profile.kinds.map((kind) => <span key={kind} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{PERSON_KIND_LABEL[kind]}</span>)}
                            {!partial && profile.ambiguous && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">동일인 확인 필요</span>}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {profile.latestClass ?? "학적 기록 없음"}
                            {!partial && ` · 관련 기록 ${profile.records.length}건${profile.years.length ? ` · ${profile.years.join(", ")}` : ""}`}
                          </span>
                        </span>
                        <ArrowRight aria-hidden="true" className="mt-2 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" size={17} weight="bold" />
                      </button>
                    )) : <SearchState title="일치하는 인물이 없습니다." description="띄어쓰기 없이 이름 전체 또는 일부를 다시 입력해 보세요." />}
                </div>
                <footer className={styles.footer}>
                  <span>이름을 선택하면 연도별 기록을 볼 수 있어요.</span>
                  <details><summary>기록 연결 기준</summary><p>학생 기록은 확인된 동일인 정보나 이름·생년월일·부서·진급 이력을 기준으로 연결합니다. 연결 근거가 부족하면 같은 사람의 기록도 따로 표시될 수 있습니다.</p></details>
                </footer>
              </>
            )}
        </OverlayShell>
      )}
    </>
  );
}

function SearchState({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className={styles.emptyState} role="status">
      <p>{title}</p>
      <span>{description}</span>
      {children}
    </div>
  );
}

function PersonDetail({ profile, onBack, onClose, pending }: { profile: PersonProfile; onBack: () => void; onClose: () => void; pending?: React.ReactNode }) {
  const yearGroups = useMemo(() => groupPersonRecordsByYear(profile.records), [profile.records]);
  const [selectedYear, setSelectedYear] = useState(() => yearGroups[0]?.year ?? "");
  const activeGroup = yearGroups.find((group) => group.year === selectedYear) ?? yearGroups[0];

  return (
    <>
      <header className={`${styles.detailHeader} flex items-start gap-3`}>
        <button type="button" onClick={onBack} className="compact-icon-control mt-0.5 shrink-0 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="검색 결과로 돌아가기"><ArrowLeft aria-hidden="true" size={17} weight="bold" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">{profile.name}</h2>
            {profile.kinds.map((kind) => <span key={kind} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{PERSON_KIND_LABEL[kind]}</span>)}
            {!pending && profile.ambiguous && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">동일인 확인 필요</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">{profile.latestClass ?? "학적 기록 없음"}{!pending && ` · 연결된 기록 ${profile.records.length}건`}</p>
        </div>
        <button type="button" onClick={onClose} className={styles.closeButton} aria-label="인물 검색 닫기"><X aria-hidden="true" size={20} /></button>
      </header>
      <div className="flex-1 overflow-y-auto bg-slate-50/70 px-3 py-4 sm:px-6 sm:py-6">
        {pending}
        {!pending && profile.ambiguous && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
            같은 이름의 기록이 여러 묶음으로 표시됩니다. 학년·반과 연락처를 대조해 동일인 여부를 확인해 주세요.
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
      ) : !record.studentSource && <p className="px-4 py-4 text-xs text-slate-400">상세 값이 없습니다.</p>}
      {record.studentSource && !record.fields.some((item) => item.label === "주일 출석") && (
        <StudentAttendance key={record.id} source={record.studentSource} />
      )}
    </article>
  );
}

function StudentAttendance({ source }: { source: StudentRecordSource }) {
  const { year, classKey, studentId } = source;
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => subscribeStudentAttendance(
    { year, classKey, studentId },
    (result) => { setSummary(result); setError(false); },
    () => { setSummary(null); setError(true); },
  ), [classKey, retry, studentId, year]);

  return (
    <dl className="border-t border-slate-100 px-4 py-3">
      <dt className="text-[10px] font-bold text-slate-400">주일 출석</dt>
      <dd className="mt-0.5 text-xs text-slate-800" aria-live="polite">
        {error ? <button type="button" className="underline" onClick={() => { setError(false); setRetry((attempt) => attempt + 1); }}>출석 다시 불러오기</button>
          : summary ?? "불러오는 중…"}
      </dd>
    </dl>
  );
}
