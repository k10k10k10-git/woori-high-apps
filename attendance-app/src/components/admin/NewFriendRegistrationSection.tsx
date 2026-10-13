import { useRef, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { auth } from '@/lib/firebase/client';
import { canUseAdminWorkspace } from '@/lib/adminNavigation';
import { isDemoAccount } from '@/lib/demo';
import NewFriendRemarkEditor, { useFriendRemarks } from './NewFriendRemarkEditor';
import AdminStatusBadge from './AdminStatusBadge';
import AdminIcon from './AdminIcon';
import { adminStatusTone } from '@/utils/adminStatus';
import { deriveNewFriendRosterProgress, deriveNewFriendStage, type NewFriendStage, type PublicReportFriend } from '@/lib/pastoralFriendProgress';

type Props = {
  year: number;
  friends: PublicReportFriend[];
  status: 'loading' | 'ready' | 'error';
  part: string;
  grade: string;
  search: string;
  onSearchChange: (value: string) => void;
  activeStage: NewFriendStage | null;
  onStageChange: (stage: NewFriendStage | null) => void;
  onRetry: () => void;
};

const SUMMARY_STAGES = ['1주차', '2주차', '등록 결정', '반배정', '출석부 반영', '완료', '보류', '종료'] as const;

function classLabel(key?: string) {
  if (!key) return '미배정';
  const match = key.match(/^(\d+)-(\d+)-(\d+)$/);
  return match ? `${match[1]}부 ${match[2]}학년 ${match[3]}반` : key;
}

function matchesSearch(friend: PublicReportFriend, terms: string[]) {
  const normalize = (value?: string) => (value ?? '').normalize('NFKC').replace(/[\s()-]/g, '').toLocaleLowerCase('ko');
  const values = [friend.name, friend.school, friend.owner, `${friend.part}부`, `${friend.grade}학년`,
    friend.decision, classLabel(friend.assignedClassKey), deriveNewFriendRosterProgress(friend),
    friend.registeredDate, friend.week1Date, friend.week2Date].map(normalize);
  return terms.every(term => values.some(value => value.includes(term)));
}

function rosterLabel(friend: PublicReportFriend) {
  if (friend.rosterSync) return '반영 완료';
  if (friend.giftDate) return '연결 확인 필요';
  if (friend.decision === '등록' && friend.week1Date && friend.week2Date && friend.assignedClassKey) return '관리자 확인 대기';
  return '준비 필요';
}

export default function NewFriendRegistrationSection({ year, friends, status, part, grade, search, onSearchChange, activeStage, onStageChange, onRetry }: Props) {
  const { state, getState } = useApp();
  const user = auth.currentUser;
  const revision = state.dataRevision;
  const allowed = canUseAdminWorkspace(state.userRole, isDemoAccount(user?.email));
  const { loads, retry } = useFriendRemarks(allowed && user && status === 'ready' ? friends.map(friend => friend.key) : []);
  const [editing, setEditing] = useState<{ key: string; opened: string | null } | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const selected = friends.find(friend => friend.key === editing?.key);
  const isCurrent = () => auth.currentUser === user && getState().curYear === year && getState().dataRevision === revision
    && canUseAdminWorkspace(getState().userRole, isDemoAccount(auth.currentUser?.email));
  function remark(friend: PublicReportFriend) {
    const load = loads[friend.key];
    return <div className="pr-remark-preview"><p>{load?.status === 'ready' ? load.value || '비고 없음' : load?.status === 'error' ? '비고 조회 실패' : '비고 불러오는 중…'}</p>{load?.status === 'error' ? <button type="button" onClick={retry}>비고 다시 불러오기</button> : <button type="button" disabled={!allowed || load?.status !== 'ready' || Boolean(editing && selected)} aria-label={`${friend.name} 비고 수정`} onClick={event => { editButton.current = event.currentTarget; setEditing({ key: friend.key, opened: load?.value ?? null }); }}>비고 수정</button>}</div>;
  }
  const terms = search.trim().split(/\s+/).filter(Boolean).map(value => value.normalize('NFKC').replace(/[\s()-]/g, '').toLocaleLowerCase('ko'));
  const filtered = friends.filter(friend => (!part || friend.part === part) && (!grade || friend.grade === grade) && matchesSearch(friend, terms))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.name.localeCompare(b.name, 'ko'));
  const counts = Object.fromEntries(SUMMARY_STAGES.map(stage => [stage, filtered.filter(friend => deriveNewFriendStage(friend) === stage).length]));
  const visible = activeStage ? filtered.filter(friend => deriveNewFriendStage(friend) === activeStage) : filtered;

  return <section className="pr-registration" aria-labelledby="pr-registration-title">
    <div className="pr-section-heading"><div><h2 id="pr-registration-title">새친구 등록현황 <span>{status === 'ready' ? `${visible.length}명` : '확인 중'}</span></h2><p className="pr-note">고등부 통합사이트의 조회 연도({year}년) 1·2학기와 주일 사역 진행 현황입니다. 등록 기록이 바뀌면 이 화면에도 자동 반영됩니다.</p></div><label className="pr-registration-search">새친구 검색<input type="search" value={search} onChange={e => onSearchChange(e.target.value)} placeholder="이름·학교·바나바 담당" /></label></div>
    {status === 'error' && <div className="ao-error" role="alert"><span>새친구 등록 정보를 불러오지 못해 명단과 집계를 표시하지 않습니다.</span><button type="button" onClick={onRetry}>다시 불러오기</button></div>}
    {status === 'loading' && <p className="pr-empty" role="status">새친구 등록 정보를 불러오고 있습니다.</p>}
    {status === 'ready' && <>
      {editing && selected && <NewFriendRemarkEditor key={editing.key} friendKey={editing.key} name={selected.name} opened={editing.opened} latest={loads[editing.key]} isCurrent={isCurrent} onClose={() => { setEditing(null); requestAnimationFrame(() => editButton.current?.focus()); }} onRetry={retry} />}
      <p className="pr-registration-hint">단계를 선택하면 해당 학생만 보입니다. 1주차부터 출석부 반영까지는 다음 확인 단계입니다.</p>
      <div className="pr-registration-summary" role="group" aria-label="새친구 진행 단계별 학생 보기">{SUMMARY_STAGES.map(stage => <button type="button" key={stage} data-status-tone={adminStatusTone(stage)} aria-pressed={activeStage === stage} onClick={() => onStageChange(activeStage === stage ? null : stage)}><span className="admin-status-mark"><AdminIcon name={stage === '완료' ? 'check' : stage === '보류' || stage === '종료' ? 'minus' : stage === '1주차' || stage === '2주차' ? 'info' : 'clock'} />{stage}</span><strong>{counts[stage]}<small>명</small></strong></button>)}</div>
      <div className="pr-registration-list-heading"><p className="pr-registration-count" role="status">{activeStage ? `${activeStage} ${visible.length}명 · 검색·필터 결과 ${filtered.length}명 / 전체 ${friends.length}명` : part || grade || terms.length ? `검색·필터 결과 ${filtered.length}명 / 전체 ${friends.length}명` : `전체 ${friends.length}명`}</p>{activeStage && <button type="button" onClick={() => onStageChange(null)}>전체 단계 보기</button>}</div>
      {!visible.length ? <p className="pr-empty">{!friends.length ? '접수된 새친구가 없습니다.' : !filtered.length ? '검색 조건에 맞는 새친구가 없습니다. 검색어나 필터를 바꿔 주세요.' : '선택한 단계에 해당하는 새친구가 없습니다. 다른 단계를 선택하거나 전체 단계 보기를 눌러 주세요.'}</p> : <>
        <div className="pr-registration-mobile" aria-label="새친구 진행 현황 모바일 목록">{visible.map(friend => {
          const progress = deriveNewFriendRosterProgress(friend);
          const stage = deriveNewFriendStage(friend);
          return <article key={friend.key}>
            <div className="pr-registration-mobile-head"><div><small>등록일 {friend.registeredDate || '확인 필요'}</small><h3>{friend.name}</h3><p>{friend.school || '학교 미입력'}</p></div><AdminStatusBadge label={stage} /></div>
            <dl><div><dt>부서 / 학년</dt><dd>{friend.part ? `${friend.part}부` : '부서 미입력'} / {friend.grade ? `${friend.grade}학년` : '학년 미입력'}</dd></div><div><dt>바나바 담당</dt><dd>{friend.owner || '미배정'}</dd></div><div><dt>1주차</dt><dd>{friend.week1Date || '-'}</dd></div><div><dt>2주차</dt><dd>{friend.week2Date || '-'}</dd></div><div><dt>등록 결정</dt><dd><AdminStatusBadge label={friend.decision || '미정'} /></dd></div><div><dt>배정 반</dt><dd>{classLabel(friend.assignedClassKey)}</dd></div></dl>
            <p className="pr-registration-mobile-foot"><span>진행 상태 {progress}</span><AdminStatusBadge label={`출석부 ${rosterLabel(friend)}`} tone={adminStatusTone(rosterLabel(friend))} /></p>
            <div className="pr-registration-mobile-remark"><strong>비고</strong>{remark(friend)}</div>
          </article>;
        })}</div>
        <div className="pr-table-wrap pr-registration-table"><table className="pr-table"><caption>통합사이트 새친구 등록일과 이름, 진행 단계, 2주 과정, 등록 결정, 배정 반과 출석부 반영 현황, 비고</caption><thead><tr><th scope="col">이름</th><th scope="col">진행 단계</th><th scope="col">등록일</th><th scope="col">학교</th><th scope="col">부서 / 학년</th><th scope="col">바나바 담당</th><th scope="col">1주차</th><th scope="col">2주차</th><th scope="col">등록 결정</th><th scope="col">배정 반</th><th scope="col">출석부</th><th scope="col">비고</th></tr></thead><tbody>{visible.map(friend => {
          const progress = deriveNewFriendRosterProgress(friend);
          const stage = deriveNewFriendStage(friend);
          return <tr key={friend.key}><th scope="row">{friend.name}</th><td><AdminStatusBadge label={stage} /><small>진행 상태 {progress}</small></td><td>{friend.registeredDate || '확인 필요'}</td><td>{friend.school || '-'}</td><td>{friend.part ? `${friend.part}부` : '-'} · {friend.grade ? `${friend.grade}학년` : '학년 미입력'}</td><td>{friend.owner || '미배정'}</td><td>{friend.week1Date || '-'}</td><td>{friend.week2Date || '-'}</td><td><AdminStatusBadge label={friend.decision || '미정'} /></td><td>{classLabel(friend.assignedClassKey)}</td><td><AdminStatusBadge label={rosterLabel(friend)} /></td><td className="pr-remark-cell">{remark(friend)}</td></tr>;
        })}</tbody></table></div>
      </>}
      <p className="pr-registration-private-note">비고는 여기서 수정할 수 있습니다. 나머지 등록 정보의 수정과 비공개 연락처 확인은 고등부 통합사이트에서 진행해 주세요.</p>
    </>}
  </section>;
}
