import { describe, expect, it } from 'vitest';
import { countOpenVisitRequests, parseTeacherMessages, parseYearTeacherMessages } from '@/utils/teacherMessages';

describe('교사 특이사항과 심방 요청 분리', () => {
  const data = {
    old: { text: '기존 기록', createdAt: 1, author: '교사' },
    note: { kind: 'note', text: '새 특이사항', createdAt: 2, author: '교사' },
    open: { kind: 'visit', studentId: 's1', studentName: '학생1', text: '연락 필요', status: 'open', createdAt: 3, author: '교사' },
    done: { kind: 'visit', studentId: 's2', studentName: '학생2', text: '확인 완료', status: 'done', createdAt: 4, author: '교사' },
    broken: { kind: 'visit', text: '학생 연결 없음' },
  };

  it('종류가 없던 기존 건의사항을 특이사항으로 보존한다', () => {
    expect(parseTeacherMessages(data, 'note').map(item => item.id)).toEqual(['note', 'old']);
  });

  it('학생이 연결된 심방 요청만 읽고 최신순으로 정렬한다', () => {
    expect(parseTeacherMessages(data, 'visit').map(item => [item.id, item.status])).toEqual([['done', 'done'], ['open', 'open']]);
  });

  it('전체 반에서 처리되지 않은 심방 요청만 센다', () => {
    const year = { '1-1-1': data, '1-1-2': { another: { ...data.open, createdAt: 5 } } };
    expect(Object.keys(parseYearTeacherMessages(year, 'visit'))).toEqual(['1-1-1', '1-1-2']);
    expect(countOpenVisitRequests(year)).toBe(2);
  });
});
