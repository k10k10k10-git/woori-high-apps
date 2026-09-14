import { canAccessArea, ownSundayTeam, retreatEntryHref, type MinistryRoles } from './accessPolicy';
import { SUNDAY_MINISTRY_TEAMS } from './featureCatalog';
import type { HomeAction } from './homeActions';
import type { SundayTeamKey } from './featureCatalog';

type Entry = { href: string; title: string; description: string; steps: string[] };
/** 담당 업무를 우선하고, 현장 바로가기는 실제 진행 기간에만 추천한다. */
export function buildHomeEntry({ roles, actions, semesterId, retreat, fieldActive, assignedTeamKeys, operationsAllowed }: {
  roles: MinistryRoles; actions: HomeAction[]; semesterId?: string;
  retreat?: { id: string; name: string }; fieldActive: boolean; assignedTeamKeys?: readonly SundayTeamKey[];
  operationsAllowed?: boolean;
}): Entry | null {
  const canUseOperations = operationsAllowed ?? canAccessArea('semester', roles);
  if (fieldActive && retreat && canAccessArea('retreat-field', roles)) return {
    href: `/events/${encodeURIComponent(retreat.id)}/field?view=cue`, title: '오늘의 현장 담당 확인',
    description: retreat.name, steps: ['진행 중인 일정 확인', '개인 큐카드 열기', '담당 구역과 실행 항목 확인'],
  };
  const team = ownSundayTeam(roles, assignedTeamKeys);
  if (team) {
    const label = SUNDAY_MINISTRY_TEAMS.find(item => item.key === team)!.label;
    return { href: `/teams/${team}`, title: `${label} 업무 시작`, description: '배정된 팀의 현재 학기와 상시 업무를 한곳에서 엽니다.',
      steps: team === 'praise' ? ['운영 기간·회차 확인', '모임 출결과 주일 스탭 참석 기록', '조편성·등단표를 저장하고 확정'] : ['팀의 진행 상황 확인', '담당 업무 처리', '변경 결과 확인'] };
  }
  const scheduled = actions.find(item => item.href && item.urgency === 'today' &&
    (item.kind === 'semester' ? canUseOperations : item.kind === 'retreat' || item.kind === 'field' ? canAccessArea('retreat-admin', roles) || canAccessArea('retreat-field', roles) : false));
  if (scheduled?.href) return { href: scheduled.href, title: scheduled.title, description: '오늘 진행하는 사역입니다.', steps: ['날짜와 대상 확인', '담당 업무 처리', '처리 결과 확인'] };
  if (canUseOperations) return { href: semesterId ? `/operations/semesters/${encodeURIComponent(semesterId)}/overview` : '/operations/semesters', title: '학기 운영 시작', description: '신청·배치·출석·커리큘럼을 관리합니다.', steps: ['운영할 학기 확인', '신청·배치 명단 확인', '회차별 출석과 진행 기록'] };
  if (canAccessArea('retreat-admin', roles) || canAccessArea('retreat-field', roles)) return {
    href: retreat ? retreatEntryHref(retreat.id, roles) : '/events',
    title: '수련회 업무 확인', description: retreat?.name ?? '담당 수련회를 선택해 주세요.', steps: ['수련회와 기간 확인', '담당 영역 열기', '준비·현장 기록 확인'],
  };
  return null;
}
