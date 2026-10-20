'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { isDataReady, useApp } from '@/store/AppContext';
import { auth } from '@/lib/firebase/client';
import { isDemoAccount } from '@/lib/demo';
import { canUseAdminWorkspace } from '@/lib/adminNavigation';
import { buildPastoralReport, type ReportSort } from '@/utils/pastoralReport';
import { buildFileWorkbook, downloadFileWorkbook } from '@/utils/fileExport';
import AdminIcon from './AdminIcon';
import './file-export.css';

type Selection = Parameters<typeof buildFileWorkbook>[1];
type Kind = Selection['kind'];
const FILES: { kind: Kind; label: string; description: string }[] = [
  { kind: 'roster', label: '전체 명단', description: '1부·2부를 각각 한 파일로' },
  { kind: 'class', label: '반별 출석부', description: '선택한 반의 연간 O·X 기록' },
  { kind: 'absent', label: '연속 결석 명단', description: '3회 이상 연속 결석한 학생' },
  { kind: 'recovered', label: '다시 출석 명단', description: '3회 이상 결석 뒤 출석한 학생' },
];
const classLabel = (key: string) => key.replace(/^(\d)-(\d)-(\d+)$/, '$1부 $2학년 $3반');

/** Operate: 기존 흰 작업면·연보라 선택·둥근 조작부를 유지한다. 파일 종류 → 범위·인원 → 내려받기 순서다. */
export default function FileExportTab() {
  const { state, getState } = useApp();
  const [kind, setKind] = useState<Kind>('roster');
  const [pickedPart, setPart] = useState('1');
  const [pickedGrade, setGrade] = useState('1');
  const [pickedClass, setClass] = useState('');
  const [pickedWeek, setWeek] = useState('');
  const [order, setOrder] = useState<ReportSort>('absence');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ error?: string; success?: string }>({});
  const [nowMs] = useState(() => Date.now());
  const exporting = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const allowed = Boolean(auth.currentUser) && canUseAdminWorkspace(state.userRole, isDemoAccount(auth.currentUser?.email));
  const ready = allowed && isDataReady(state);
  const futureYear = state.curYear > new Date(nowMs + 9 * 3600 * 1000).getUTCFullYear();
  const canDownload = ready && !futureYear;
  const classes = Object.keys(state.classData).filter(key => /^[12]-[123]-[1-9]\d*$/.test(key)).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
  const parts = [...new Set(classes.map(key => key.split('-')[0]))];
  const part = parts.includes(pickedPart) ? pickedPart : parts[0] ?? '';
  const grades = [...new Set(classes.filter(key => key.startsWith(`${part}-`)).map(key => key.split('-')[1]))];
  const grade = grades.includes(pickedGrade) ? pickedGrade : grades[0] ?? '';
  const classKeys = classes.filter(key => key.startsWith(`${part}-${grade}-`));
  const classKey = classKeys.includes(pickedClass) ? pickedClass : classKeys[0] ?? '';
  const classCount = state.classData[classKey]?.students.length ?? 0;
  const report = useMemo(() => buildPastoralReport(state, [], nowMs, pickedWeek), [state, nowMs, pickedWeek]);
  const weekKey = report.selectedWeek?.key;
  const pastoral = kind === 'absent' || kind === 'recovered';
  const count = kind === 'absent' ? report.absent.length : report.recovered.length;
  const choice = `${kind}/${kind === 'class' ? classKey : pastoral ? `${weekKey}/${order}` : ''}`;
  const currentChoice = useRef(choice);
  currentChoice.current = choice;
  const label = FILES.find(file => file.kind === kind)!.label;

  function clearStatus() { setStatus({}); }

  async function download(selection: Selection) {
    if (!canDownload || exporting.current) return;
    const user = auth.currentUser;
    const year = state.curYear;
    const revision = state.dataRevision;
    const expectedChoice = choice;
    const buttonKey = selection.kind === 'roster' ? selection.part : selection.kind;
    const assertScope = () => {
      const current = getState();
      if (!active.current || !auth.currentUser || auth.currentUser !== user || current.curYear !== year || current.dataRevision !== revision
        || currentChoice.current !== expectedChoice || !isDataReady(current) || !canUseAdminWorkspace(current.userRole, isDemoAccount(auth.currentUser?.email))) {
        throw new Error('파일 종류·조회 조건 또는 로그인 상태가 변경되었습니다. 현재 화면에서 다시 내려받아 주세요.');
      }
    };
    exporting.current = true; setBusy(buttonKey); clearStatus();
    try {
      assertScope();
      const file = buildFileWorkbook(getState(), selection, Date.now());
      if (!file.count) throw new Error('내려받을 학생이 없습니다. 조회 연도와 선택한 조건을 확인해 주세요.');
      await downloadFileWorkbook(file, assertScope);
      assertScope();
      setStatus({ success: `${file.label} ${file.count}명의 엑셀 내려받기를 시작했습니다.` });
    } catch (error) {
      if (active.current) setStatus({ error: error instanceof Error ? error.message : '엑셀을 만들지 못했습니다. 다시 내려받아 주세요.' });
    } finally {
      exporting.current = false;
      if (active.current) setBusy(null);
    }
  }

  if (!allowed) return null;
  return <section className="file-export" aria-labelledby="file-export-title">
    <header className="fe-heading"><h2 id="file-export-title">파일화</h2><p>필요한 명단과 출석 기록을 골라 엑셀로 내려받으세요.</p></header>
    <div className="fe-kinds" role="group" aria-label="내보낼 파일 선택">
      {FILES.map(file => <button type="button" key={file.kind} aria-label={file.label} aria-pressed={kind === file.kind} onClick={() => { setKind(file.kind); clearStatus(); }}>
        <strong>{file.label}</strong><span>{file.description}</span>
      </button>)}
    </div>

    {!ready && <p className="fe-message" role="status">명단·출석·행사 자료를 모두 불러온 뒤 내려받을 수 있습니다.</p>}
    {ready && futureYear && <p className="fe-message" role="status">아직 시작되지 않은 연도입니다. 상단 조회 연도에서 현재 또는 과거 연도를 선택해 주세요.</p>}
    <section className="fe-panel" aria-labelledby="file-selection-title" aria-busy={busy !== null}>
      <div className="fe-panel-heading"><div><h3 id="file-selection-title">{label}</h3><p>{kind === 'roster' ? `${state.curYear}년 전체 학생 · 장결 학생 포함` : kind === 'class' ? `${state.curYear}년 1월~12월 · 장결 학생 포함` : `${state.curYear}년 선택한 기준 주일 · 1부·2부 전체 · 장결 학생 포함`}</p></div><span className="fe-format">Excel .xlsx</span></div>

      {kind === 'roster' ? <div className="fe-parts">{(['1', '2'] as const).map(value => {
        const keys = classes.filter(key => key.startsWith(`${value}-`));
        const students = keys.reduce((sum, key) => sum + state.classData[key].students.length, 0);
        return <div className="fe-part" key={value}><div><h4>{value}부 전체 명단</h4><p><strong>{students}명</strong> · {keys.length}개 반</p></div>
          <button type="button" className="fe-download" aria-label={`${value}부 전체 명단 엑셀 내려받기`} disabled={!canDownload || busy !== null || !students} onClick={() => void download({ kind: 'roster', part: value })}><AdminIcon name="download" />{busy === value ? '엑셀 만드는 중…' : `${value}부 엑셀 내려받기`}</button>
          {!students && ready && <p className="fe-empty">{value}부에 등록된 학생이 없습니다.</p>}
        </div>;
      })}</div> : <>
        <div className="fe-controls">{kind === 'class' ? <>
          <label><span>부서</span><select aria-label="부서" value={part} disabled={!ready || !parts.length} onChange={event => { setPart(event.target.value); clearStatus(); }}>{!parts.length && <option value="">부서 없음</option>}{parts.map(value => <option value={value} key={value}>{value}부</option>)}</select></label>
          <label><span>학년</span><select aria-label="학년" value={grade} disabled={!ready || !grades.length} onChange={event => { setGrade(event.target.value); clearStatus(); }}>{!grades.length && <option value="">학년 없음</option>}{grades.map(value => <option value={value} key={value}>{value}학년</option>)}</select></label>
          <label className="fe-class-control"><span>반</span><select aria-label="반" value={classKey} disabled={!ready || !classKeys.length} onChange={event => { setClass(event.target.value); clearStatus(); }}>{!classKeys.length && <option value="">반 없음</option>}{classKeys.map(key => <option value={key} key={key}>{key.split('-')[2]}반{state.classData[key].teacher ? ` · ${state.classData[key].teacher}` : ''}</option>)}</select></label>
        </> : <>
          <label className="fe-week-control"><span>기준 주일</span><select aria-label="기준 주일" value={weekKey ?? ''} disabled={!ready || !report.weeks.length} onChange={event => { setWeek(event.target.value); clearStatus(); }}>{!report.weeks.length && <option value="">조회할 주일 없음</option>}{report.weeks.map(week => <option value={week.key} key={week.key}>{week.label}</option>)}</select></label>
          <label><span>정렬</span><select aria-label="정렬" value={order} onChange={event => { setOrder(event.target.value as ReportSort); clearStatus(); }}><option value="absence">결석 많은 순</option><option value="latest">마지막 출석 최신순</option><option value="oldest">마지막 출석 오래된순</option></select></label>
        </>}</div>
        <div className="fe-selected-summary"><div><strong>{kind === 'class' ? classKey ? classLabel(classKey) : '선택할 반이 없습니다' : report.selectedWeek ? `${report.selectedWeek.label} 기준` : '조회할 주일이 없습니다'}</strong><p>내려받을 학생 <b>{kind === 'class' ? classCount : count}명</b>{pastoral && ' · 다른 화면의 검색·필터와 무관한 전체 명단'}</p></div>
          <button type="button" className="fe-download" aria-label={kind === 'class' ? '선택한 반 출석부 엑셀 내려받기' : `${label} 엑셀 내려받기`} disabled={!canDownload || busy !== null || !(kind === 'class' ? classCount : count) || (pastoral && !weekKey)} onClick={() => void download(kind === 'class' ? { kind: 'class', classKey } : { kind, weekKey, sort: order })}><AdminIcon name="download" />{busy === kind ? '엑셀 만드는 중…' : '엑셀 내려받기'}</button>
        </div>
        {ready && kind === 'class' && !classCount && <p className="fe-empty">이 반에 등록된 학생이 없습니다. 다른 반을 선택해 주세요.</p>}
        {ready && pastoral && !count && <p className="fe-empty">{report.selectedWeek ? `선택한 기준 주일에 해당하는 ${kind === 'absent' ? '연속 결석' : '다시 출석'} 학생이 없습니다.` : '현재까지 조회할 정상 주일이 없습니다.'}</p>}
      </>}

      <div className="fe-contents"><h4>파일에 담기는 내용</h4>{kind === 'roster' ? <><p>반별 요약 → 학생 명단 → 전체 학생·연간 출석 → 반별 출석부 순으로 시트를 구성합니다.</p><ul><li>이름·본인 연락처·보호자 연락처</li><li>생년월일·학교·주소</li><li>전체 날짜별 O·X · 출석률·등급</li></ul></> : kind === 'class' ? <><p>선택한 반의 1월부터 12월까지 출석을 한 파일에서 확인합니다.</p><ul><li>이름·장결 구분</li><li>월별로 묶은 전체 날짜·O·X</li><li>출석 횟수·출석률·등급</li></ul></> : <><p>기존 연락처 명단 구성에 보호자 연락처를 함께 넣습니다.</p><ul><li>이름·본인 연락처·보호자 연락처</li><li>소속 반·장결 구분</li><li>{kind === 'recovered' ? '복귀 전 ' : ''}연속 결석 횟수·마지막 출석일</li></ul></>}
        <p className="fe-calculation">{pastoral ? '연속 결석·다시 출석 명단은 실제 입력된 출석·결석 기록으로 판정합니다.' : '장결자의 지난 정상 주일 빈칸은 엑셀에서만 X로 표시·집계합니다. 기존 출석 기록·행사·미래 날짜와 DB 원본은 유지합니다.'}</p>
      </div>
    </section>
    {status.error && <p className="fe-message fe-error" role="alert">{status.error}</p>}
    {status.success && <p className="fe-message fe-success" role="status">{status.success}</p>}
    <p className="fe-privacy"><AdminIcon name="info" />내려받아도 기존 명단·출석 기록은 바뀌지 않습니다. 연락처가 포함된 파일은 필요한 담당자에게만 전달해 주세요.</p>
  </section>;
}
