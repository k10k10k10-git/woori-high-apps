"use client";

import { useState } from "react";
import LoginButton from "@/components/LoginButton";
import {
  LANDING_FEATURES,
  PROBLEMS,
  SOLUTION_STEPS,
  START_STEPS,
  TARGETS,
} from "./landingContent";

function Brand() {
  return (
    <a href="#top" className="landing-brand" aria-label="고등부 통합사이트 처음으로">
      <span className="landing-brand-mark">W</span>
      <span><strong>WOORI HIGH</strong><small>고등부 통합사이트</small></span>
    </a>
  );
}
function LandingHeader({ signIn }: { signIn: () => Promise<void> }) {
  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <Brand />
        <nav className="landing-nav" aria-label="페이지 안내">
          <a href="#solution">운영 방식</a>
          <a href="#features">주요 기능</a>
          <a href="#for-whom">추천 대상</a>
        </nav>
        <div className="landing-header-login"><LoginButton signIn={signIn} /></div>
      </div>
    </header>
  );
}

function HeroDemo() {
  return (
    <div className="landing-demo" aria-label="고등부 통합사이트 예시 화면">
      <div className="landing-demo-topbar"><span /><span /><span /><b>오늘의 사역</b></div>
      <div className="landing-demo-body">
        <aside>
          <div className="landing-demo-logo">W</div>
          {["홈", "학기", "주일", "수련회", "현장"].map((item, index) => <i className={index === 0 ? "is-active" : ""} key={item}>{item}</i>)}
        </aside>
        <section>
          <p>안녕하세요, 선생님</p>
          <h3>오늘도 함께 준비해요.</h3>
          <div className="landing-demo-metrics">
            <article><small>오늘 일정</small><strong>3건</strong></article>
            <article><small>다음 수련회</small><strong>D-18</strong></article>
            <article><small>미완료 준비</small><strong>6건</strong></article>
          </div>
          <div className="landing-demo-grid">
            <article><span>학기 중 사역</span><strong>2026년 2학기 훈련·사역팀</strong><small>출석 · 수료 · 커리큘럼</small></article>
            <article><span>주일 사역</span><strong>행정·바나바</strong><small>새친구 · 등록 현황 · 행정 변동</small></article>
            <article><span>방학 중 사역</span><strong>2026년 여름수련회</strong><small>행정 · 이가드 현장 운영</small></article>
          </div>
        </section>
      </div>
    </div>
  );
}

function FeatureSection() {
  const [activeId, setActiveId] = useState<(typeof LANDING_FEATURES)[number]["id"]>("home");
  const active = LANDING_FEATURES.find((item) => item.id === activeId) ?? LANDING_FEATURES[0];
  return (
    <section className="landing-section landing-features" id="features" aria-labelledby="features-title">
      <div className="landing-section-heading">
        <p className="landing-kicker">OFFER</p>
        <h2 id="features-title">사역의 처음과 끝을 잇는 하나의 도구</h2>
        <p>각각의 기능을 모아 둔 것이 아니라, 같은 명단과 권한으로 다음 업무가 자연스럽게 이어집니다.</p>
      </div>
      <div className="landing-feature-tabs" role="tablist" aria-label="주요 기능">
        {LANDING_FEATURES.map((item) => (
          <button key={item.id} role="tab" aria-selected={item.id === active.id} onClick={() => setActiveId(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className="landing-feature-panel">
        <div className="landing-feature-copy">
          <p>{active.eyebrow}</p><h3>{active.title}</h3><span>{active.body}</span>
          <ul>{active.metrics.map((metric) => <li key={metric}>{metric}</li>)}</ul>
        </div>
        <div className="landing-feature-demo">
          <div className="landing-feature-demo-head"><span>{active.label}</span><small>안전한 예시 화면</small></div>
          {active.rows.map((row, index) => <article key={row}><i>{index + 1}</i><strong>{row}</strong><span>{index === 0 ? "준비됨" : "확인 필요"}</span></article>)}
          <div className="landing-feature-progress"><span style={{ width: active.id === "field" ? "84%" : "72%" }} /></div>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage({ signIn }: { signIn: () => Promise<void> }) {
  return (
    <div className="landing-page" id="top">
      <LandingHeader signIn={signIn} />
      <main>
        <section className="landing-hero">
          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <p className="landing-kicker">ONE FLOW, ONE MINISTRY</p>
              <h1>출석부부터 수련회 현장까지,<br /><em>고등부 사역을 하나의 흐름으로.</em></h1>
              <p className="landing-hero-description">명단을 여러 번 옮기지 않아도, 준비한 정보가 필요한 사람에게 필요한 순간 이어지는 고등부 전용 사역 플랫폼입니다.</p>
              <div className="landing-hero-actions">
                <LoginButton signIn={signIn} />
                <a href="#features" className="landing-secondary-button">기능 둘러보기 <span>↓</span></a>
              </div>
              <div className="landing-trust"><span>✓ 승인된 팀원만 접근</span><span>✓ 역할별 권한 분리</span><span>✓ 실제 사역 흐름 기반</span></div>
            </div>
            <HeroDemo />
          </div>
        </section>

        <section className="landing-section" id="problem" aria-labelledby="problem-title">
          <div className="landing-section-heading">
            <p className="landing-kicker">PROBLEM</p>
            <h2 id="problem-title">사역은 사람을 향하는데,<br />준비는 정보 사이에서 길을 잃습니다.</h2>
          </div>
          <div className="landing-problem-grid">{PROBLEMS.map((item) => <article key={item.number}><span>{item.number}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
        </section>

        <section className="landing-story" id="affinity">
          <div><p className="landing-kicker">AFFINITY</p><h2>우리도 같은 불편에서 시작했습니다.</h2></div>
          <blockquote>“누가 최신 명단을 가지고 있지?”<br />“이 학생은 오늘 버스를 타는 게 맞나?”<br />“내가 지금 어디로 가야 하지?”</blockquote>
          <p>고등부 통합사이트는 현장에서 반복된 이 질문들을 줄이기 위해 만들어졌습니다. 더 많은 기능보다, 한 번 정리한 정보가 다음 사람에게 정확히 이어지는 경험을 먼저 설계했습니다.</p>
        </section>

        <section className="landing-section" id="solution" aria-labelledby="solution-title">
          <div className="landing-section-heading">
            <p className="landing-kicker">SOLUTION</p>
            <h2 id="solution-title">정보를 모으는 것이 아니라<br />사역의 흐름을 연결합니다.</h2>
          </div>
          <ol className="landing-solution-list">{SOLUTION_STEPS.map((item) => <li key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></li>)}</ol>
        </section>

        <FeatureSection />

        <section className="landing-section landing-target" id="for-whom" aria-labelledby="target-title">
          <div className="landing-section-heading">
            <p className="landing-kicker">NARROW</p><h2 id="target-title">이런 고등부라면 더 잘 맞습니다.</h2>
          </div>
          <div className="landing-target-grid">{TARGETS.map((target) => <article key={target}><span>✓</span><p>{target}</p></article>)}</div>
        </section>

        <section className="landing-action" id="action">
          <div className="landing-action-copy"><p className="landing-kicker">ACTION</p><h2>다음 사역은<br />하나의 기준에서 시작하세요.</h2><p>처음부터 모든 기능을 바꿀 필요는 없습니다. 한 팀, 한 학기, 한 번의 수련회부터 시작하면 됩니다.</p><LoginButton signIn={signIn} /></div>
          <ol>{START_STEPS.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>
        </section>
      </main>
      <footer className="landing-footer"><Brand /><p>사람을 위한 준비가 정보 정리에 묻히지 않도록.</p><small>© {new Date().getFullYear()} Woori High Ministry</small></footer>
    </div>
  );
}
