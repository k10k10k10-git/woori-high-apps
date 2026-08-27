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
        <span>한 번 정리한 정보가</span>
        <strong>다음 사역까지 이어집니다.</strong>
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
        <h2 id="features-title">사역의 처음과 끝을 잇는 하나의 도구</h2>
        <p>각 기능이 같은 명단과 권한 위에서 다음 사역으로 이어집니다.</p>
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
              <h1>출석부부터 수련회 현장까지,<br /><em>고등부 사역을 하나의 흐름으로.</em></h1>
              <p className="landing-hero-description">한 번 정리한 명단이 준비와 현장까지 안전하게 이어집니다.</p>
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
          <div className="landing-section-heading"><h2 id="target-title">이런 부서라면 더 잘 맞습니다.</h2></div>
          <div className="landing-target-grid">{TARGETS.map((target) => <article key={target}><span aria-hidden="true">✓</span><p>{target}</p></article>)}</div>
        </section>

        <section className="landing-action" id="action">
          <div className="landing-action-copy"><p className="landing-kicker">START SMALL</p><h2>다음 사역은<br />하나의 기준에서 시작하세요.</h2><p>한 팀, 한 학기, 한 번의 수련회부터 시작하면 됩니다.</p><LoginButton signIn={signIn} /></div>
          <ol>{START_STEPS.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol>
        </section>
      </main>
      <footer className="landing-footer"><Brand /><p>한 영혼을 위한 사역이 될 수 있도록.</p><small>© {new Date().getFullYear()} Woori High Ministry</small></footer>
    </div>
  );
}
