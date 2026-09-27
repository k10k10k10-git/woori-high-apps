"use client";

import Image from "next/image";
import { useState } from "react";
import LoginButton from "@/components/LoginButton";
import ThemeToggle from "@/components/ThemeToggle";
import {
  LANDING_FEATURES,
  PROBLEMS,
  SOLUTION_STEPS,
  START_STEPS,
  ROLE_STARTS,
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
          <a href="#for-whom">역할별 시작</a>
        </nav>
        <div className="landing-header-actions">
          <ThemeToggle showLabel />
          <div className="landing-header-login"><LoginButton signIn={signIn} /></div>
        </div>
      </div>
    </header>
  );
}

function HeroMedia() {
  return (
    <figure className="landing-hero-media media-outline">
      <Image
        src="/landing-ministry-team.jpg"
        alt="사역 일정과 명단을 함께 확인하는 고등부 사역자들"
        fill
        priority
        sizes="(max-width: 900px) 92vw, 48vw"
      />
      <figcaption>
        <span>함께 확인한 기록이</span>
        <strong>다음 담당자에게 이어집니다.</strong>
      </figcaption>
    </figure>
  );
}

function FeatureSection() {
  const [activeId, setActiveId] = useState<(typeof LANDING_FEATURES)[number]["id"]>("home");
  const active = LANDING_FEATURES.find((item) => item.id === activeId) ?? LANDING_FEATURES[0];

  return (
    <section className="landing-section landing-features" id="features" aria-labelledby="features-title">
      <div className="landing-section-heading">
        <h2 id="features-title">맡은 사역에서 필요한 화면을 찾으세요</h2>
        <p>학기와 팀, 수련회에서 할 수 있는 일을 확인할 수 있습니다.</p>
      </div>
      <div className="landing-feature-tabs" role="tablist" aria-label="주요 기능">
        {LANDING_FEATURES.map((item) => (
          <button key={item.id} role="tab" aria-selected={item.id === active.id} onClick={() => setActiveId(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className="landing-feature-panel">
        <div className="landing-feature-copy">
          <p>{active.eyebrow}</p>
          <h3>{active.title}</h3>
          <span>{active.body}</span>
          <ul>{active.metrics.map((metric) => <li key={metric}>{metric}</li>)}</ul>
        </div>
        <div className="landing-feature-flow" aria-label={`${active.label} 업무 흐름`}>
          <p>연결되는 업무</p>
          <ol>
            {active.rows.map((row, index) => (
              <li key={row}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{row}</strong>
              </li>
            ))}
          </ol>
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
              <h1>이번 주 사역,<br /><em>맡은 일부터 확인하세요.</em></h1>
              <p className="landing-hero-description">일정과 명단 변경을 한곳에서 확인하고 다음 담당자와 이어갑니다.</p>
              <div className="landing-hero-actions">
                <LoginButton signIn={signIn} />
                <a href="#features" className="landing-secondary-button">기능 둘러보기 <span>↓</span></a>
              </div>
            </div>
            <HeroMedia />
          </div>
        </section>

        <aside className="landing-proof" aria-label="안전한 사역 운영 원칙">
          <span>승인된 팀원만 접근</span>
          <span>역할별 권한 분리</span>
          <span>실제 사역 흐름 기반</span>
        </aside>

        <section className="landing-section landing-problems" id="problem" aria-labelledby="problem-title">
          <div className="landing-section-heading">
            <h2 id="problem-title">사역은 사람을 향하는데,<br />준비는 정보 사이에서 길을 잃습니다.</h2>
          </div>
          <div className="landing-problem-list">
            {PROBLEMS.map((item) => <article key={item.number}><span>{item.number}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}
          </div>
        </section>

        <section className="landing-story" id="affinity">
          <div><p className="landing-kicker">OUR STORY</p><h2>우리도 같은 불편에서 시작했습니다.</h2></div>
          <blockquote>“누가 최신 명단을 가지고 있지?”<br />“이 학생은 오늘 버스를 타는 게 맞나?”<br />“내가 지금 어디로 가야 하지?”</blockquote>
          <p>현장에서 반복된 질문을 줄이기 위해 만들었습니다. 더 많은 기능보다 한 번 정리한 정보가 다음 사람에게 정확히 이어지는 경험을 먼저 설계했습니다.</p>
        </section>

        <section className="landing-section" id="solution" aria-labelledby="solution-title">
          <div className="landing-section-heading">
            <h2 id="solution-title">정보를 모으는 것이 아니라<br />사역의 흐름을 연결합니다.</h2>
          </div>
          <ol className="landing-solution-list">{SOLUTION_STEPS.map((item) => <li key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></li>)}</ol>
        </section>

        <FeatureSection />

        <section className="landing-section landing-target" id="for-whom" aria-labelledby="target-title">
          <div className="landing-section-heading"><h2 id="target-title">고등부에서 맡은 일을 이렇게 시작합니다.</h2></div>
          <div className="landing-target-grid">{ROLE_STARTS.map(({ role, action }) => <article key={role}><span aria-hidden="true">✓</span><p><strong className="block text-[var(--color-text-primary)]">{role}</strong>{action}</p></article>)}</div>
        </section>

        <section className="landing-action" id="action">
          <div className="landing-action-copy"><p className="landing-kicker">WOORI HIGH</p><h2>이번 주 사역은<br />여기서 시작하세요.</h2><p>내 담당 업무를 확인하고, 필요한 기록을 다음 사람에게 이어주세요.</p><LoginButton signIn={signIn} /></div>
          <ol>{START_STEPS.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>
        </section>
      </main>
      <footer className="landing-footer"><Brand /><p>한 영혼을 위한 사역이 될 수 있도록.</p><small>© {new Date().getFullYear()} Woori High Ministry</small></footer>
    </div>
  );
}
