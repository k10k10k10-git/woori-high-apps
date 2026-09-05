import React from 'react';

const query = new URLSearchParams(location.search);
export const qa = {
  role: query.get('role') || 'admin', state: query.get('state') || 'populated',
  theme: query.get('theme') === 'dark' ? 'dark' : 'light', tab: query.get('tab') || 'dashboard',
  subscriptions: [] as string[], unsubscriptions: [] as string[], blockedWrites: [] as string[], confirmations: [] as string[],
  productionSDK: 'disabled-by-resolver',
};
const name = query.has('longName') ? '아주긴이름의가상운영담당자' : '가상 담당자';
const rolesByName = {
  admin: { semester: 'superAdmin', retreat: 'superAdmin' },
  staff: { semester: 'staff', retreat: 'fieldStaff' },
  barnabas: { semester: 'barnabas', retreat: 'none' },
  none: { semester: 'none', retreat: 'none' },
};
const auth = { user: { uid: 'qa-user', email: 'qa-user@example.invalid', displayName: name, photoURL: null }, roles: rolesByName[qa.role] || rolesByName.staff, memberName: name, loading: false };
export function useAuth() { return auth; }
export function useUI() { return { toast: (text: string) => qa.confirmations.push(text), uiConfirm: async (...args: unknown[]) => { qa.confirmations.push(JSON.stringify(args)); return false; } }; }
export default function Link({ href, children, ...props }: any) { return <a href={typeof href === 'string' ? href : '#'} {...props}>{children}</a>; }

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const year = Number(today.slice(0, 4));
const now = Date.now();
const request = (id: string, title: string, state = 'received', urgency = '보통') => ({
  id, ownerUid: 'qa-user', kind: '사이트 건의사항', category: '사용성 개선', title,
  description: '합성 데이터로 만든 요청입니다. 실제 사용자의 개인정보와 무관합니다.',
  page: '/my-page', urgency, reproduction: '마이페이지의 내 요청 목록을 확인합니다.', expected: '필요한 정보를 빠르게 찾습니다.',
  anonymous: false, reporterName: '가상 담당자', roleLabel: '사역팀', createdAt: now - 86400000,
  status: state, ...(state === 'resolved' ? { resolvedAt: now - 3600000, resolvedBy: '가상 관리자', resolutionNote: '요청 반영을 완료했습니다.' } : {}),
});
const requests = [request('qa-request-1', '모바일에서 팀 일정 확인 개선', 'received', '높음'), request('qa-request-2', '내 사역 배정 화면 안내 문구'), request('qa-request-3', '마이페이지 요청 상태 표시', 'resolved')];
const adminMembers = {
  'qa-user': { name, email: 'qa-user@example.invalid', role: 'admin', semesterRole: 'superAdmin', retreatRole: 'superAdmin' },
  'qa-admin-2': { name: '가상 행정담당', email: 'qa-admin-2@example.invalid', role: 'admin', semesterRole: 'adminTeam', retreatRole: 'adminTeam' },
};
const memberData = {
  'qa-staff-1': { name: '가상 현장담당', email: 'qa-staff-1@example.invalid', semesterRole: 'staff', retreatRole: 'fieldStaff' },
  'qa-staff-2': { name: '가상 이가드팀', email: 'qa-staff-2@example.invalid', semesterRole: 'staff', retreatRole: 'iguardTeam' },
};
const data: Record<string, unknown> = {
  subscribeToAdminSiteRequests: requests,
  subscribeToMySiteRequests: requests,
  subscribeToMainAdmins: { 'qa-user': true },
  subscribeToRetreatAdmins: adminMembers,
  subscribeToPendingRequests: { 'qa-pending-1': { name: '가상 새담당자', email: 'qa-pending-1@example.invalid', requestedAt: now - 7200000 } },
  subscribeToIguardMembers: memberData,
  subscribeToIguardPending: [{ uid: 'qa-pending-2', name: '가상 현장스탭', email: 'qa-pending-2@example.invalid', requestedAt: now - 3600000 }],
  subscribeToIguardRoles: { 'qa-staff-1': 'staff', 'qa-staff-2': 'team' },
  subscribeToRetreats: [{ id: 'qa-retreat', year, name: '고등부 여름 수련회', createdAt: now - 86400000 }],
  subscribeToAllRetreatPeriods: [{ id: 'qa-period', retreatId: 'qa-retreat', startDate: today, endDate: today, label: '전체 일정' }],
  subscribeToMilestones: [
    { id: 'qa-milestone-1', title: '주일 사역 준비 확인', targetDate: today, done: false, sourceSite: 'portal-main' },
    { id: 'qa-milestone-2', title: '수련회 조별 운영 점검', targetDate: today, done: false, sourceSite: 'retreat-admin' },
  ],
  subscribeSemesters: [{ id: `${year}-2`, meta: { title: `${year}년 2학기 훈련·사역팀`, startDate: `${year}-08-01`, endDate: `${year}-12-31`, completionRule: { minRate: 0.7 }, createdAt: `${year}-08-01` } }],
  subscribeSessions: [{ id: 'qa-session', date: today, type: '정규', label: '사역팀 모임' }],
  subscribeApplications: [{ id: 'qa-application', studentId: 'qa-staff', bu: '1부', grade: 0, class: 0, name, status: '배치', teamId: 'qa-team', trainingClassId: 'qa-training', createdAt: today }],
  subscribeTeams: [{ id: 'qa-team', name: '예배팀', room: '고등부 예배실', order: 1, color: 'bg-blue-100' }],
  subscribeTrainingClasses: [{ id: 'qa-training', name: '성경 읽기반', room: '교육관 301호', teacher: '가상 교사', order: 1, color: 'bg-emerald-100' }],
  subscribeAllAttendance: { 'qa-session': { 'qa-application': { s: '출석' } } },
  subscribeSundayNewFriends: [],
  subscribeToGroups: [{ id: 'qa-group', name: '믿음 1조', bu: '1부', staff: name, members: [] }],
  subscribeToTeacherAttendances: [{ id: 'qa-teacher', name, bu: '스탭', status: '참석' }],
  subscribeToIguardGroupStaff: { 'qa-group': ['qa-teacher'] },
  subscribeToIguardSchedule: [], subscribeToIguardSegments: [], subscribeToIguardMovements: [], subscribeToIguardPosts: [],
};
function subscription(key: string, ...args: any[]) {
  qa.subscriptions.push(key);
  const callbacks = args.filter(value => typeof value === 'function');
  let active = true;
  const timer = setTimeout(() => {
    if (!active || qa.state === 'loading') return;
    if (key === 'subscribeToConnection') { callbacks[0]?.(qa.state !== 'offline'); return; }
    if (qa.state === 'error') { callbacks[1]?.(new Error('QA 합성 구독 오류: 연결을 다시 확인해 주세요.')); return; }
    if (!(key in data)) throw new Error(`합성 데이터가 없는 구독: ${key}`);
    const value = data[key];
    callbacks[0]?.(qa.state === 'empty' ? Array.isArray(value) ? [] : {} : structuredClone(value));
  }, 45);
  return () => { active = false; clearTimeout(timer); qa.unsubscriptions.push(key); };
}
function denyWrite(name: string) { qa.blockedWrites.push(name); throw new Error(`QA 쓰기 차단: ${name}`); }
export const subscribeToConnection = (...args: any[]) => subscription('subscribeToConnection', ...args);
export const subscribeToAdminSiteRequests = (...args: any[]) => subscription('subscribeToAdminSiteRequests', ...args);
export const subscribeToMySiteRequests = (...args: any[]) => subscription('subscribeToMySiteRequests', ...args);
export const subscribeToMainAdmins = (...args: any[]) => subscription('subscribeToMainAdmins', ...args);
export const subscribeToRetreatAdmins = (...args: any[]) => subscription('subscribeToRetreatAdmins', ...args);
export const subscribeToPendingRequests = (...args: any[]) => subscription('subscribeToPendingRequests', ...args);
export const subscribeToIguardMembers = (...args: any[]) => subscription('subscribeToIguardMembers', ...args);
export const subscribeToIguardPending = (...args: any[]) => subscription('subscribeToIguardPending', ...args);
export const subscribeToIguardRoles = (...args: any[]) => subscription('subscribeToIguardRoles', ...args);
export const subscribeToRetreats = (...args: any[]) => subscription('subscribeToRetreats', ...args);
export const subscribeToAllRetreatPeriods = (...args: any[]) => subscription('subscribeToAllRetreatPeriods', ...args);
export const subscribeToMilestones = (...args: any[]) => subscription('subscribeToMilestones', ...args);
export const subscribeSemesters = (...args: any[]) => subscription('subscribeSemesters', ...args);
export const subscribeSessions = (...args: any[]) => subscription('subscribeSessions', ...args);
export const subscribeApplications = (...args: any[]) => subscription('subscribeApplications', ...args);
export const subscribeTeams = (...args: any[]) => subscription('subscribeTeams', ...args);
export const subscribeTrainingClasses = (...args: any[]) => subscription('subscribeTrainingClasses', ...args);
export const subscribeAllAttendance = (...args: any[]) => subscription('subscribeAllAttendance', ...args);
export const subscribeSundayNewFriends = (...args: any[]) => subscription('subscribeSundayNewFriends', ...args);
export const subscribeToGroups = (...args: any[]) => subscription('subscribeToGroups', ...args);
export const subscribeToTeacherAttendances = (...args: any[]) => subscription('subscribeToTeacherAttendances', ...args);
export const subscribeToIguardGroupStaff = (...args: any[]) => subscription('subscribeToIguardGroupStaff', ...args);
export const subscribeToIguardSchedule = (...args: any[]) => subscription('subscribeToIguardSchedule', ...args);
export const subscribeToIguardSegments = (...args: any[]) => subscription('subscribeToIguardSegments', ...args);
export const subscribeToIguardMovements = (...args: any[]) => subscription('subscribeToIguardMovements', ...args);
export const subscribeToIguardPosts = (...args: any[]) => subscription('subscribeToIguardPosts', ...args);
export const denyRetreatRequest = () => denyWrite('denyRetreatRequest');
export const updateRetreatAdminMemberName = () => denyWrite('updateRetreatAdminMemberName');
export const denyIguardPending = () => denyWrite('denyIguardPending');
export const updateIguardMemberName = () => denyWrite('updateIguardMemberName');
export const addRetreatAdmin = () => denyWrite('addRetreatAdmin');
export const removeRetreatAdmin = () => denyWrite('removeRetreatAdmin');
export const setMainAdmin = () => denyWrite('setMainAdmin');
export const approveIguardMember = () => denyWrite('approveIguardMember');
export const removeIguardMember = () => denyWrite('removeIguardMember');
export const deleteSiteRequest = () => denyWrite('deleteSiteRequest');
export const resolveSiteRequest = () => denyWrite('resolveSiteRequest');
