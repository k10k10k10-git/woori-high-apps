/** Firebase Realtime Database 경로 단일 원천.
 *  컴포넌트·db 함수에서 경로 문자열을 직접 쓰지 말고 이 함수를 사용한다. */

export const paths = {
  // ── 수련회 ──
  retreats: () => "retreats",
  retreat: (id: string) => `retreats/${id}`,

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

  // ── 민감정보 (retreatsPrivate) ──
  cancellations: (id: string) => `retreatsPrivate/${id}/cancellations`,
  cancellation: (id: string, cid: string) => `retreatsPrivate/${id}/cancellations/${cid}`,
  unmatchedPayments: (id: string) => `retreatsPrivate/${id}/unmatchedPayments`,
  unmatchedPayment: (id: string, pid: string) => `retreatsPrivate/${id}/unmatchedPayments/${pid}`,
  medicalLogs: (id: string) => `retreatsPrivate/${id}/medicalLogs`,
  medicalLog: (id: string, lid: string) => `retreatsPrivate/${id}/medicalLogs/${lid}`,
  teacherIdNumbers: (id: string) => `retreatsPrivate/${id}/teacherIdNumbers`,
  teacherIdNumber: (id: string, tid: string) => `retreatsPrivate/${id}/teacherIdNumbers/${tid}`,

  // ── 접근 관리 ──
  admins: (uid: string) => `admins/${uid}`,
  retreatAdmins: () => "retreatAdmins",
  retreatAdmin: (uid: string) => `retreatAdmins/${uid}`,
  retreatPending: () => "retreatPending",
  retreatPendingEntry: (uid: string) => `retreatPending/${uid}`,

  // ── 마일스톤 (전역) ──
  prepMilestones: () => "prepMilestones",
  prepMilestone: (id: string) => `prepMilestones/${id}`,

  // ── 학생 앱 소유 (읽기 전용) ──
  classes: (year: number) => `classes/${year}`,
  attendance: (year: number) => `attendance/${year}`,
  teacherStaff: (year: number) => `teacherStaff/${year}`,
  teacherSpecial: (year: number) => `teacherSpecial/${year}`,
  teacherExtra: (year: number) => `teacherExtra/${year}`,
} as const;
