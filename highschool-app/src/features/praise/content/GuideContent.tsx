import { DownloadSimple } from "@phosphor-icons/react";
import { PRAISE_RESOURCES, praiseResourceSize } from "./manifest";
import { createFirstMeetingGuide, NANUM_MARBLE_ROUNDS, NANUM_MARBLE_RULES } from "./templates";
import type { PraiseMeetingGuide } from "./types";
import styles from "./GuideContent.module.css";

function GuideList({ items }: { items: readonly string[] }) {
  if (items.length === 0) return <p className={styles.empty}>등록된 안내가 없습니다.</p>;
  return <ul className={styles.list}>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

export function PraiseResourceLibrary() {
  return (
    <section className={styles.resources} aria-label="나눔마블 자료실">
      <header className={styles.header}>
        <h3>나눔마블 자료실</h3>
        <p>인쇄해서 함께 사용하는 나눔 자료입니다. PPTX와 안내문의 시간표·인원은 운영 예시이므로 회차에 맞게 조정해 주세요.</p>
      </header>
      <div className={styles.resourceList}>
        {PRAISE_RESOURCES.map((resource) => (
          <div className={styles.resourceRow} key={resource.id}>
            <div className={styles.resourceInfo}>
              <h4>{resource.title}</h4>
              <p>{resource.description}</p>
              <span className={styles.fileMeta}>{resource.format} · {praiseResourceSize(resource.bytes)}</span>
            </div>
            <a className={styles.download} href={resource.href} download aria-label={`${resource.title} 다운로드`}>
              <DownloadSimple size={17} aria-hidden="true" />
              다운로드
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

export function NanumMarbleGuide() {
  return (
    <section className={styles.section} aria-label="나눔마블 진행 규칙">
      <h4>나눔마블 진행 규칙</h4>
      <GuideList items={NANUM_MARBLE_RULES} />
      <details className={styles.disclosure}>
        <summary>라운드별 그룹 나누기 질문</summary>
        <div className={styles.detailsBody}>
          {NANUM_MARBLE_ROUNDS.map((round, index) => (
            <section className={styles.round} key={round.id} aria-label={`${index + 1}라운드 그룹 질문`}>
              <h5>{index + 1}라운드 · {round.title}</h5>
              <p>{round.question}</p>
              <GuideList items={round.choices} />
            </section>
          ))}
          <p className={styles.note}>선택을 존중하고, 두 가지 선택 사이에서 고민하는 학생의 자원 이동으로 그룹 인원과 새로운 만남을 조정합니다.</p>
        </div>
      </details>
    </section>
  );
}

/** 저장·인증·구독을 하지 않는 읽기 전용 안내. 편집과 회차 저장은 상위 화면이 담당한다. */
export function GuideContent({
  guide = createFirstMeetingGuide(),
  showResources = true,
}: {
  guide?: PraiseMeetingGuide;
  showResources?: boolean;
}) {
  return (
    <div className={styles.guide}>
      <header className={styles.header}>
        <h3>{guide.title || "첫 모임 가이드"}</h3>
        <p>{guide.description}</p>
      </header>
      <dl className={styles.facts}>
        <div><dt>운영 시간</dt><dd>{guide.durationMinutes}분</dd></div>
        <div><dt>나눔 장소</dt><dd>{guide.location.trim() || "회차에서 장소를 정해 주세요."}</dd></div>
        <div><dt>면접 장소</dt><dd>{guide.interviewLocation.trim() || "회차에서 장소를 정해 주세요."}</dd></div>
      </dl>
      <section className={styles.section} aria-label="시작 전 준비">
        <h4>시작 전 준비</h4>
        <GuideList items={guide.preparation} />
      </section>
      <section className={styles.section} aria-label="역할별 진행">
        <h4>역할별 진행</h4>
        {guide.roles.length === 0 && <p className={styles.empty}>등록된 역할이 없습니다.</p>}
        <div className={styles.roleList}>
          {guide.roles.map((role) => (
            <div className={styles.role} key={role.id}>
              <h5>{role.title}</h5>
              <GuideList items={role.responsibilities} />
            </div>
          ))}
        </div>
      </section>
      <section className={styles.section} aria-label="진행 순서">
        <h4>진행 순서</h4>
        {guide.steps.length === 0 && <p className={styles.empty}>등록된 순서가 없습니다.</p>}
        <ol className={styles.stepList}>
          {guide.steps.map((step, index) => (
            <li className={styles.step} key={step.id}>
              <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
              <div>
                <div className={styles.stepHeading}><h5>{step.title}</h5><span>{step.durationMinutes}분</span></div>
                <GuideList items={step.instructions} />
              </div>
            </li>
          ))}
        </ol>
      </section>
      <NanumMarbleGuide />
      <details className={styles.disclosure}>
        <summary>면접 진행 참고</summary>
        <div className={styles.detailsBody}><GuideList items={guide.interviewGuidelines} /></div>
      </details>
      <details className={styles.disclosure}>
        <summary>현장 상황에 맞게 조정하기</summary>
        <div className={styles.detailsBody}><GuideList items={guide.fallbacks} /></div>
      </details>
      {showResources && <PraiseResourceLibrary />}
    </div>
  );
}

export default GuideContent;
