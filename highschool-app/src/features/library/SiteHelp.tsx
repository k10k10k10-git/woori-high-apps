"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";
import { SITE_HELP, searchSiteHelp } from "./siteHelpContent";
import styles from "./SiteHelp.module.css";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const currentHash = () => window.location.hash;
const helpAnchor = (id: string) => id === "permission" ? "access" : id === "error" ? "connection" : id;

export default function SiteHelp() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const hash = useSyncExternalStore(subscribeHash, currentHash, () => "");
  const results = useMemo(() => searchSiteHelp(query, category), [query, category]);
  const categories = ["전체", ...new Set(SITE_HELP.map((item) => item.category))];
  return <main className={`team-first-page ${styles.page}`}>
    <header className="team-first-page-header"><div><h1>사이트 사용법</h1><p>처음 시작하는 방법부터 출결 입력과 접속 문제까지, 필요한 업무로 안내합니다.</p></div><div className={styles.navigation}><button type="button" onClick={() => { if (window.history.length > 1) router.back(); else router.push("/teams"); }}>이전 화면으로</button><Link className={styles.link} href="/library">자료로 돌아가기</Link></div></header>
    <section className={styles.start} aria-labelledby="site-help-start">
      <h2 id="site-help-start">처음이라면 이 순서로 시작하세요</h2>
      <ol><li><strong>담당 팀 열기</strong><span>팀 전체 현황에서 현재 학기와 모임을 확인합니다.</span></li><li><strong>진행할 업무 선택</strong><span>이번 모임 입력과 학기 명단·누적 기록을 구분합니다.</span></li><li><strong>기록·처리 결과 확인</strong><span>필요한 기록을 확인하고, 입력했다면 저장 완료 안내를 확인합니다.</span></li></ol>
      <Link className={styles.link} href="/teams">팀 전체 현황으로 <ArrowRight size={16} aria-hidden="true" /></Link>
    </section>
    <div className={styles.filters}>
      <label htmlFor="site-help-search">사용법 검색<div className={styles.search}><MagnifyingGlass size={18} aria-hidden="true" /><input id="site-help-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 출결 저장, 담당 조, 접근 권한" /></div></label>
      <label htmlFor="site-help-category">업무 종류<select id="site-help-category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
    </div>
    <p className={styles.count} role="status">{results.length}개의 안내</p>
    <section className={styles.answers} aria-label="업무별 사용 안내">
      {results.map((item) => <details key={item.id} id={helpAnchor(item.id)} open={query.trim() || hash === `#${helpAnchor(item.id)}` ? true : undefined}><summary>{item.title}</summary><div><p>{item.answer}</p><Link className={styles.link} href={item.href}>{item.link} <ArrowRight size={16} aria-hidden="true" /></Link></div></details>)}
      {results.length === 0 && <div className={styles.empty}><p>검색 결과가 없습니다. 검색어를 줄이거나 업무 종류를 바꿔 보세요.</p><button type="button" onClick={() => { setQuery(""); setCategory("전체"); }}>검색 초기화</button><Link className={styles.link} href="/help/feedback">찾는 사용법 문의하기</Link></div>}
    </section>
    <footer className={styles.support}><strong>안내대로 해도 해결되지 않나요?</strong><p>로그인 이메일·화면 주소·발생 시간을 알려 주시면 담당자가 연결 상태를 확인하는 데 도움이 됩니다.</p><Link className={styles.link} href="/help/feedback">사용법 문의·문제 제보 <ArrowRight size={16} aria-hidden="true" /></Link></footer>
  </main>;
}
