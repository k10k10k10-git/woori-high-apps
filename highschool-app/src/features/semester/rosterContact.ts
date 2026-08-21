import { makeAppKey, STAFF_BU } from "./applicant";
import { parseClassKey } from "./classKey";
import type { ApplicationPrivate, ClassInfo, StaffPerson } from "./types";

export type RosterContact = {
  phone?: string;
  parentPhone?: string;
};

/** 학생·스탭 원장의 연락처를 신청 appKey 기준으로 묶는다. 원장 데이터는 읽기 전용이다. */
export function buildRosterContactMap(classes: ClassInfo[], staff: StaffPerson[]): Record<string, RosterContact> {
  const result: Record<string, RosterContact> = {};
  for (const classInfo of classes) {
    const parsed = parseClassKey(classInfo.classKey);
    if (!parsed) continue;
    for (const [studentId, student] of Object.entries(classInfo.students)) {
      result[makeAppKey(parsed.bu, studentId)] = {
        ...(student.phone?.trim() ? { phone: student.phone.trim() } : {}),
        ...(student.pphone?.trim() ? { parentPhone: student.pphone.trim() } : {}),
      };
    }
  }
  for (const person of staff) {
    result[makeAppKey(STAFF_BU, person.staffId)] = {
      ...(person.phone?.trim() ? { phone: person.phone.trim() } : {}),
    };
  }
  return result;
}

/** 신청서에서 수정한 값이 있으면 우선하고, 없으면 현재 원장값을 그대로 보여준다. */
export function resolvedContact(
  privateValue: ApplicationPrivate | undefined,
  rosterValue: RosterContact | undefined,
): RosterContact {
  return {
    phone: privateValue?.phone?.trim() || rosterValue?.phone?.trim() || "",
    parentPhone: privateValue?.parentPhone?.trim() || rosterValue?.parentPhone?.trim() || "",
  };
}

/** 원장 기본값과 같은 값은 복사 저장하지 않는다. 이후 원장 변경을 실시간으로 따라가기 위함이다. */
export function contactOverrideValue(input: string, rosterDefault?: string): string {
  const value = input.trim();
  return value === (rosterDefault?.trim() ?? "") ? "" : value;
}
