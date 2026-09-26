import { deriveNewFriendRosterProgress, deriveNewFriendStage, type PublicReportFriend } from '@/lib/pastoralFriendProgress';

type Props = {
  year: number;
  friends: PublicReportFriend[];
  status: 'loading' | 'ready' | 'error';
  part: string;
  grade: string;
  search: string;
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
  if (friend.decision === '등록' && friend.week1Date && friend.week2Date && friend.assignedClassKey) return '관리자 확인 대기';
  return '준비 필요';
}

export default function NewFriendRegistrationSection({ year, friends, status, part, grade, search, onRetry }: Props) {
  const terms = search.trim().split(/\s+/).filter(Boolean).map(value => value.normalize('NFKC').replace(/[\s()-]/g, '').toLocaleLowerCase('ko'));
  const filtered = friends.filter(friend => (!part || friend.part === part) && (!grade || friend.grade === grade) && matchesSearch(friend, terms))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.name.localeCompare(b.name, 'ko'));
  const counts = Object.fromEntries(SUMMARY_STAGES.map(stage => [stage, filtered.filter(friend => deriveNewFriendStage(friend) === stage).length]));

  return <section className="pr-registration" aria-labelledby="pr-registration-title">
    <div className="pr-section-heading"><div><h2 id="pr-registration-title">새친구 등록현황 <span>{status === 'ready' ? `${filtered.length}명` : '확인 중'}</span></h2><p className="pr-note">고등부 통합사이트의 조회 연도({year}년) 1·2학기와 주일 사역 진행 현황입니다. 등록 기록이 바뀌면 이 화면에도 자동 반영됩니다.</p></div></div>
    {status === 'error' && <div className="ao-error" role="alert"><span>새친구 등록 정보를 불러오지 못해 명단과 집계를 표시하지 않습니다.</span><button type="button" onClick={onRetry}>다시 불러오기</button></div>}
    {status === 'loading' && <p className="pr-empty" role="status">새친구 등록 정보를 불러오고 있습니다.</p>}
    {status === 'ready' && <>
      <div className="pr-registration-summary" aria-label="새친구 진행 단계별 인원">{SUMMARY_STAGES.map(stage => <div key={stage}><span>{stage}</span><strong>{counts[stage]}<small>명</small></strong></div>)}</div>
      <p className="pr-registration-count" role="status">{part || grade || terms.length ? `검색·필터 결과 ${filtered.length}명 / 전체 ${friends.length}명` : `전체 ${friends.length}명`}</p>
      {!filtered.length ? <p className="pr-empty">{friends.length ? '검색 조건에 맞는 새친구가 없습니다. 검색어나 필터를 바꿔 주세요.' : '접수된 새친구가 없습니다.'}</p> : <>
        <div className="pr-registration-mobile" aria-label="새친구 진행 현황 모바일 목록">{filtered.map(friend => {
          const progress = deriveNewFriendRosterProgress(friend);
          return <article key={friend.key}>
            <div className="pr-registration-mobile-head"><div><small>등록일 {friend.registeredDate || '확인 필요'}</small><h3>{friend.name}</h3><p>{friend.school || '학교 미입력'}</p></div><span className="pr-registration-progress" data-progress={progress}>{progress}</span></div>
            <dl><div><dt>부서 / 학년</dt><dd>{friend.part ? `${friend.part}부` : '부서 미입력'} / {friend.grade ? `${friend.grade}학년` : '학년 미입력'}</dd></div><div><dt>바나바 담당</dt><dd>{friend.owner || '미배정'}</dd></div><div><dt>1주차</dt><dd>{friend.week1Date || '-'}</dd></div><div><dt>2주차</dt><dd>{friend.week2Date || '-'}</dd></div><div><dt>등록 결정</dt><dd>{friend.decision || '미정'}</dd></div><div><dt>배정 반</dt><dd>{classLabel(friend.assignedClassKey)}</dd></div></dl>
            <p className="pr-registration-mobile-foot"><span>현재 단계 {deriveNewFriendStage(friend)}</span><strong>{rosterLabel(friend)}</strong></p>
          </article>;
        })}</div>
        <div className="pr-table-wrap pr-registration-table"><table className="pr-table"><caption>통합사이트 새친구 등록일, 2주 과정, 등록 결정, 배정 반, 진행 상태와 출석부 반영 현황</caption><thead><tr><th scope="col">등록일</th><th scope="col">이름</th><th scope="col">학교</th><th scope="col">부서 / 학년</th><th scope="col">바나바 담당</th><th scope="col">1주차</th><th scope="col">2주차</th><th scope="col">등록 결정</th><th scope="col">배정 반</th><th scope="col">진행 상태</th><th scope="col">출석부</th></tr></thead><tbody>{filtered.map(friend => {
          const progress = deriveNewFriendRosterProgress(friend);
          return <tr key={friend.key}><td>{friend.registeredDate || '확인 필요'}</td><th scope="row">{friend.name}</th><td>{friend.school || '-'}</td><td>{friend.part ? `${friend.part}부` : '-'} · {friend.grade ? `${friend.grade}학년` : '학년 미입력'}</td><td>{friend.owner || '미배정'}</td><td>{friend.week1Date || '-'}</td><td>{friend.week2Date || '-'}</td><td>{friend.decision || '미정'}</td><td>{classLabel(friend.assignedClassKey)}</td><td><span className="pr-registration-progress" data-progress={progress}>{progress}</span><small>{deriveNewFriendStage(friend)}</small></td><td>{rosterLabel(friend)}</td></tr>;
        })}</tbody></table></div>
      </>}
      <p className="pr-registration-private-note">등록 정보의 수정과 비공개 연락처 확인은 고등부 통합사이트에서 진행해 주세요.</p>
    </>}
  </section>;
}
