import { paths } from "./paths";

interface StaffMemberInput {
  name: string;
  phone: string;
  toTeamMemberCount: number;
}

export function buildStaffMoveUpdates(
  year: number,
  fromTeam: string,
  toTeam: string,
  id: string,
  member: StaffMemberInput,
  attendance: unknown,
): Record<string, unknown> {
  return {
    [paths.staffMember(year, toTeam, id)]: {
      name: member.name.trim(),
      phone: member.phone.trim() || null,
      num: member.toTeamMemberCount + 1,
    },
    [paths.staffMemberAttendance(year, toTeam, id)]: attendance ?? null,
    [paths.staffMemberAttendance(year, fromTeam, id)]: null,
    [paths.staffMember(year, fromTeam, id)]: null,
  };
}
