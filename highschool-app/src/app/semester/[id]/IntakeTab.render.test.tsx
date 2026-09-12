/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'synthetic' } }) }));
vi.mock('@/context/UIContext', () => ({ useUI: () => ({ toast: vi.fn(), uiConfirm: async () => true }) }));
vi.mock('@/features/semester/EditContext', () => ({ useSemesterCanEdit: () => true }));
vi.mock('@/features/semester/db', async () => {
  const { makeAppKey } = await import('@/features/semester/applicant');
  return {
    makeAppKey, upsertApplication: mocks.save, removeApplication: mocks.remove,
    subscribeClassesByYear: (_year: string, cb: (data: unknown) => void) => {
      cb([{ classKey: '1-3-7', students: { '-new': { name: '이동 학생', personId: 'person_student_moved', phone: '현재 연락처' } } }]); return () => {};
    },
    subscribeStaffByYear: (_year: string, cb: (data: unknown) => void) => { cb([]); return () => {}; },
    subscribeApplicationsPrivate: (_sid: string, cb: (data: unknown) => void) => { cb({ '2_S37_05': { phone: '신청 연락처', motive: '기존 지원 동기' } }); return () => {}; },
  };
});
import IntakeTab from './IntakeTab';
import type { Application, Team } from '@/features/semester/types';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('이동한 학생 편집은 기존 신청·비공개 정보·출석 연결 키를 유지한다', async () => {
  const app = { id: '2_S37_05', studentId: 'S37_05', personId: 'person_student_moved', bu: '2부', grade: 3, class: 7, name: '이동 학생', status: '배치', choice1: 'praise', teamId: 'praise' } as Application;
  render(<IntakeTab sid="2026-2" teams={[{ id: 'praise', name: '찬양팀' } as Team]} trainingClasses={[]} applications={[app]} />);
  fireEvent.click(await screen.findByRole('button', { name: /이동 학생/ }));
  expect(screen.getByDisplayValue('신청 연락처')).toBeInTheDocument();
  expect(screen.getByDisplayValue('기존 지원 동기')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('2026-2', expect.objectContaining({ studentId: 'S37_05', bu: '2부', personId: 'person_student_moved' }), expect.objectContaining({ phone: '신청 연락처', motive: '기존 지원 동기' })));
});
