import Link from "next/link";
import { ArrowRight, Books, ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";

export default function LibraryHome() {
  return <main className="team-first-page"><header className="team-first-page-header"><div><p className="section-kicker">LIBRARY</p><h1>자료</h1><p>사역 가이드와 팀·학기·행사에 남긴 자료를 필요한 맥락에서 찾습니다.</p></div></header><section className="operations-grid"><Link href="/library/guide" className="operations-card"><Books size={21} aria-hidden="true" /><div><h2>사역 가이드</h2><p>연간 흐름과 운영 기준을 확인합니다.</p></div><ArrowRight size={16} aria-hidden="true" /></Link><Link href="/teams" className="operations-card"><ClockCounterClockwise size={21} aria-hidden="true" /><div><h2>팀·학기 자료</h2><p>팀을 선택한 뒤 해당 학기의 자료·기록을 엽니다.</p></div><ArrowRight size={16} aria-hidden="true" /></Link><Link href="/events" className="operations-card"><ClockCounterClockwise size={21} aria-hidden="true" /><div><h2>행사 자료</h2><p>수련회를 선택해 행정·프로그램·현장 기록을 봅니다.</p></div><ArrowRight size={16} aria-hidden="true" /></Link></section></main>;
}
