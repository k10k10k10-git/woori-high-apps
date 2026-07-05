// 후기 신청자로 인정되는 셀 색상 (red = 취소이므로 제외)
export const LATE_REGISTRANT_COLORS: ReadonlySet<string> = new Set(["blue", "orange", "green", "purple"]);

export const TEACHER_STATUS_CLS: Record<string, string> = {
  "전참":  "bg-green-100 text-green-700 border border-green-200",
  "부분참": "bg-orange-100 text-orange-700 border border-orange-200",
  "불참":  "bg-red-100 text-red-700 border border-red-200",
};
