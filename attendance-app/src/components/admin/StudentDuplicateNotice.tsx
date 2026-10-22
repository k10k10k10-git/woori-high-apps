'use client';

import { useMemo } from 'react';
import { findStudentDuplicatePairs } from '@/utils/studentDuplicates';
import type { ClassInfo, Student } from '@/types';

const reasonLabel = { personId: '인물 식별자 일치', birth: '이름·생년월일 일치', phone: '이름·본인 연락처 일치', name: '이름만 일치 · 동명이인 확인' };
const classLabel = (key: string) => key.replace(/^(\d+)-(\d+)-(\d+)$/, '$1부 $2학년 $3반');

/** 조회만 하며, 동일인 판정이나 병합·삭제를 자동 실행하지 않는다. */
export default function StudentDuplicateNotice({ classes, onOpen }: {
  classes: Record<string, Pick<ClassInfo, 'students'>>;
  onOpen: (classKey: string, student: Student, button: HTMLButtonElement) => void;
}) {
  const pairs = useMemo(() => findStudentDuplicatePairs(Object.fromEntries(Object.entries(classes).map(([key, info]) => [key, {
    students: Object.fromEntries(info.students.map(student => [student.id, student])),
  }]))).sort((a, b) => Number(b.strong) - Number(a.strong)), [classes]);
  const strong = pairs.filter(pair => pair.strong).length;
  return <details className="sd-duplicate-notice">
    <summary>중복 등록 점검 <span>{strong ? `중복 의심 ${strong}건` : '중복 의심 없음'} · 동명이인 확인 {pairs.length - strong}건</span></summary>
    <p>조회 연도 전체 반·장결 학생을 비교합니다. 같은 학생인지 확인하기 전에는 명단과 출석 기록을 합치거나 삭제하지 않습니다. 이름만 같으면 중복으로 확정하지 않습니다.</p>
    {pairs.length ? <ul>{pairs.map(({ left, right, reason, strong }) => <li key={`${left.classKey}/${left.studentId}:${right.classKey}/${right.studentId}`}>
      <div><strong>{strong ? '중복 의심' : '동명이인 확인'}</strong><span>{reasonLabel[reason]}</span></div>
      <div>{[left, right].map(row => <button key={`${row.classKey}/${row.studentId}`} type="button" onClick={event => onOpen(row.classKey, row.student, event.currentTarget)}>
        {row.student.name} <span>{classLabel(row.classKey)}{row.student.jang ? ' · 장결' : ''}</span>
      </button>)}</div>
    </li>)}</ul> : <p>현재 조회한 명단에 비교 조건이 일치하는 학생 쌍이 없습니다. 정보가 부족하거나 다르게 입력된 동일인까지 없다는 뜻은 아닙니다.</p>}
  </details>;
}
