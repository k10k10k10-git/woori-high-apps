/** Firebase Realtime Database 경로 단일 원천.
 *  컴포넌트·db 함수에서 경로 문자열을 직접 쓰지 말고 이 함수를 사용한다. */

export const paths = {
  // ── 앱 저장 활동 이력 (추가 전용, 통합관리자 조회) ──
  activityLogEvents: () => "activityLogs/events",
  // ── 수련회 ──
  retreats: () => "retreats",
  retreat: (id: string) => `retreats/${id}`,
  retreatMetaField: (id: string, field: "name" | "year" | "sheetId" | "sheetGid" | "createdAt" | "groupCount" | "startDate" | "endDate") => `retreats/${id}/${field}`,

  // ── 참가자 ──
  participants: (id: string) => `retreats/${id}/participants`,
  participant: (id: string, key: string) => `retreats/${id}/participants/${key}`,
  participantExtra: (id: string, key: string) => `retreats/${id}/participants/${key}/extra`,
  participantsBackups: (id: string) => `retreats/${id}/participantsBackups`,
  participantsBackup: (id: string, backupKey: string) => `retreats/${id}/participantsBackups/${backupKey}`,
  // 중복 신청 원본 데이터는 시트의 모든 열(주민등록번호 등 민감정보 포함 가능)을 담을 수 있어
  // retreatsPrivate(행정 관리자만 접근, 이가드 멤버는 못 봄)에 둔다. retreats/{id}/syncMeta는 구버전 경로(폐기).
  syncDuplicates: (id: string) => `retreatsPrivate/${id}/syncDuplicates`,

  // ── 교사/스탭 ──
  teachers: (id: string) => `retreats/${id}/teachers`,
  teacher: (id: string, tid: string) => `retreats/${id}/teachers/${tid}`,

  // ── 조편성 ──
  groups: (id: string) => `retreats/${id}/groups`,
  group: (id: string, gid: string) => `retreats/${id}/groups/${gid}`,
  groupsBackups: (id: string) => `retreats/${id}/groupsBackups`,
  groupsBackup: (id: string, backupKey: string) => `retreats/${id}/groupsBackups/${backupKey}`,
  autoAssignConfig: (id: string) => `retreats/${id}/autoAssignConfig`,

  // ── 숙소 ──
  rooms: (id: string) => `retreats/${id}/rooms`,
  room: (id: string, rid: string) => `retreats/${id}/rooms/${rid}`,
  roomsBackups: (id: string) => `retreats/${id}/roomsBackups`,
  roomsBackup: (id: string, backupKey: string) => `retreats/${id}/roomsBackups/${backupKey}`,
  roomAutoAssignConfig: (id: string) => `retreats/${id}/roomAutoAssignConfig`,

  // ── 차량 ──
  carpools: (id: string) => `retreats/${id}/carpools`,
  carpool: (id: string, cid: string) => `retreats/${id}/carpools/${cid}`,

  // ── 준비물 ──
  supplies: (id: string) => `retreats/${id}/supplies`,
  supply: (id: string, sid: string) => `retreats/${id}/supplies/${sid}`,

  // ── 행정물품 체크리스트 (구매 리스트인 supplies와 별개 — 재고/준비 여부 관리) ──
  adminSupplies: (id: string) => `retreats/${id}/adminSupplies`,
  adminSupply: (id: string, sid: string) => `retreats/${id}/adminSupplies/${sid}`,

  // ── 간식 ──
  snacks: (id: string) => `retreats/${id}/snacks`,
  snack: (id: string, sid: string) => `retreats/${id}/snacks/${sid}`,

  // ── 물품/간식 예산 ──
  suppliesBudget: (id: string) => `retreats/${id}/suppliesBudget`,

  // ── 식수 계산 ──
  mealCount: (id: string) => `retreats/${id}/mealCount`,

  // ── 브레인스토밍 (전역 — 수련회와 무관하게 공유, prepMilestones와 동일 패턴) ──
  brainstorm: () => "brainstorm",
  brainstormNote: (nid: string) => `brainstorm/${nid}`,
  brainstormComments: (nid: string) => `brainstorm/${nid}/comments`,
  brainstormComment: (nid: string, cid: string) => `brainstorm/${nid}/comments/${cid}`,

  // ── 셀 색상/부분참 ──
  cellColors: (id: string) => `retreats/${id}/cellColors`,
  cellColor: (id: string, cellKey: string) => `retreats/${id}/cellColors/${cellKey}`,
  partialAttendances: (id: string) => `retreats/${id}/partialAttendances`,
  partialAttendance: (id: string, studentKey: string) => `retreats/${id}/partialAttendances/${studentKey}`,

  // ── 현장 등록 ──
  onSiteReg: (id: string) => `retreats/${id}/onSiteReg`,
  onSiteRegEntry: (id: string, key: string) => `retreats/${id}/onSiteReg/${key}`,

  // ── 단체티 ──
  tshirtOrders: (id: string) => `retreats/${id}/tshirtOrders`,
  tshirtOrder: (id: string, oid: string) => `retreats/${id}/tshirtOrders/${oid}`,

  // ── 약품 프리셋 ──
  medicinePresets: (id: string) => `retreats/${id}/medicinePresets`,

  // ── 이가드 (행정은 읽기 전용) ──
  iguardGroupStaff: (id: string) => `retreats/${id}/iguard/groupStaff`,

  // ── 수련회 기간 ──
  periods: (id: string) => `retreats/${id}/periods`,
  period: (id: string, pid: string) => `retreats/${id}/periods/${pid}`,

  // ── 프로그램 준비 (행정 소유, 이가드 published 읽기) ──
  programs: (id: string) => `retreats/${id}/programs`,
  program: (id: string, programId: string) => `retreats/${id}/programs/${programId}`,
  programTasks: (id: string, programId: string) => `retreats/${id}/programs/${programId}/tasks`,
  programTask: (id: string, programId: string, taskId: string) => `retreats/${id}/programs/${programId}/tasks/${taskId}`,
  // 회의 안건·메모·결정은 현장 역할이 원문을 읽지 못하도록 retreatsPrivate에 둔다.
  programMeetingsRoot: (id: string) => `retreatsPrivate/${id}/programMeetings`,
  programMeetings: (id: string, programId: string) => `retreatsPrivate/${id}/programMeetings/${programId}`,
  programMeeting: (id: string, programId: string, meetingId: string) => `retreatsPrivate/${id}/programMeetings/${programId}/${meetingId}`,
  programDecisions: (id: string, programId: string, meetingId: string) =>
    `retreatsPrivate/${id}/programMeetings/${programId}/${meetingId}/decisions`,
  programDecision: (id: string, programId: string, meetingId: string, decisionId: string) =>
    `retreatsPrivate/${id}/programMeetings/${programId}/${meetingId}/decisions/${decisionId}`,
  programPost: (id: string, programId: string, postId: string) => `retreats/${id}/programs/${programId}/posts/${postId}`,
  programPostMatch: (id: string, programId: string, postId: string, matchId: string) =>
    `retreats/${id}/programs/${programId}/posts/${postId}/matches/${matchId}`,
  programItem: (id: string, programId: string, itemId: string) => `retreats/${id}/programs/${programId}/items/${itemId}`,
  programRole: (id: string, programId: string, roleId: string) => `retreats/${id}/programs/${programId}/roles/${roleId}`,
  programCompetitionTeams: (id: string, programId: string) => `retreats/${id}/programs/${programId}/competitionTeams`,
  programCompetitionTeam: (id: string, programId: string, teamId: string) =>
    `retreats/${id}/programs/${programId}/competitionTeams/${teamId}`,
  programCompetitionTeamGroup: (id: string, programId: string, teamId: string, groupId: string) =>
    `retreats/${id}/programs/${programId}/competitionTeams/${teamId}/groupIds/${groupId}`,
  programReleases: (id: string, programId: string) => `retreats/${id}/programs/${programId}/releases`,
  programRelease: (id: string, programId: string, releaseId: string) =>
    `retreats/${id}/programs/${programId}/releases/${releaseId}`,

  // ── 민감정보 (retreatsPrivate) ──
  retreatsPrivate: () => "retreatsPrivate",
  /** 수련회의 민감정보 루트. 수련회 삭제 시 이 노드까지 함께 지워야 한다(고아로 남으면 UI로 접근 불가). */
  retreatPrivate: (id: string) => `retreatsPrivate/${id}`,
  cancellations: (id: string) => `retreatsPrivate/${id}/cancellations`,
  cancellation: (id: string, cid: string) => `retreatsPrivate/${id}/cancellations/${cid}`,
  unmatchedPayments: (id: string) => `retreatsPrivate/${id}/unmatchedPayments`,
  unmatchedPayment: (id: string, pid: string) => `retreatsPrivate/${id}/unmatchedPayments/${pid}`,
  medicalLogs: (id: string) => `retreatsPrivate/${id}/medicalLogs`,
  medicalLog: (id: string, lid: string) => `retreatsPrivate/${id}/medicalLogs/${lid}`,
  teacherIdNumbers: (id: string) => `retreatsPrivate/${id}/teacherIdNumbers`,
  teacherIdNumber: (id: string, tid: string) => `retreatsPrivate/${id}/teacherIdNumbers/${tid}`,
  participantContacts: (id: string) => `retreatsPrivate/${id}/participantContacts`,
  participantContact: (id: string, participantKey: string) => `retreatsPrivate/${id}/participantContacts/${participantKey}`,
  participantContactsBackups: (id: string) => `retreatsPrivate/${id}/participantContactsBackups`,

  // ── 접근 관리 ──
  admins: (uid: string) => `admins/${uid}`,
  mainAdmins: () => "admins",
  retreatAdmins: () => "retreatAdmins",
  retreatAdmin: (uid: string) => `retreatAdmins/${uid}`,
  retreatPending: () => "retreatPending",
  retreatPendingEntry: (uid: string) => `retreatPending/${uid}`,
  iguardMember: (uid: string) => `iguardMembers/${uid}`,
  iguardRole: (uid: string) => `iguardRoles/${uid}`,
  iguardPending: () => "iguardPending",
  iguardPendingEntry: (uid: string) => `iguardPending/${uid}`,
  siteRequests: (uid: string) => `iguardPending/${uid}/siteRequests`,
  siteRequest: (uid: string, requestId: string) => `iguardPending/${uid}/siteRequests/${requestId}`,

  // ── 마일스톤 (전역) ──
  prepMilestones: () => "prepMilestones",
  prepMilestone: (id: string) => `prepMilestones/${id}`,

  // ── 학생 앱 소유 (읽기 전용) ──
  classesRoot: () => "classes",
  classes: (year: number) => `classes/${year}`,
  attendanceRoot: () => "attendance",
  attendance: (year: number) => `attendance/${year}`,
  events: (year: number) => `events/${year}`,
  teacherStaff: (year: number) => `teacherStaff/${year}`,
  teacherSpecial: (year: number) => `teacherSpecial/${year}`,
  teacherExtra: (year: number) => `teacherExtra/${year}`,
  teacherStaffRoot: () => "teacherStaff",
  teacherSpecialRoot: () => "teacherSpecial",
  teacherExtraRoot: () => "teacherExtra",
  teacherAdditionalRoot: () => "teacherAdditional",
} as const;

/** 회계 서버 전용 경로. 클라이언트 직접 접근은 기본 Rules에서 거부된다. */
export const financeLedgerPath = (year: number) => `financePrivate/${year}/ledger`;
export const financeFilePath = (year: number, receiptId: string) => `financePrivate/${year}/files/${receiptId}`;
