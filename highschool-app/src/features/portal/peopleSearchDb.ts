import { get, ref } from "firebase/database";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { paths as semesterPaths } from "@/features/semester/paths";
import type { PeopleSearchData } from "./peopleSearch";

async function read(path: string): Promise<Record<string, unknown>> {
  const snapshot = await get(ref(db, path));
  return snapshot.exists() ? snapshot.val() as Record<string, unknown> : {};
}

export async function loadPeopleSearchData(options: {
  includeSemester: boolean;
  includePrivate: boolean;
  includeAttendancePrivate: boolean;
}): Promise<PeopleSearchData> {
  const [classes, attendance, retreats, semesters, retreatsPrivate, semestersPrivate, teacherStaff, teacherSpecial, teacherExtra, teacherAdditional] = await Promise.all([
    read(paths.classesRoot()),
    read(paths.attendanceRoot()),
    read(paths.retreats()),
    options.includeSemester ? read(semesterPaths.semesters()) : Promise.resolve({}),
    options.includePrivate ? read(paths.retreatsPrivate()) : Promise.resolve({}),
    options.includePrivate && options.includeSemester
      ? read(semesterPaths.semestersPrivate())
      : Promise.resolve({}),
    read(paths.teacherStaffRoot()),
    read(paths.teacherSpecialRoot()),
    read(paths.teacherExtraRoot()),
    options.includeAttendancePrivate ? read(paths.teacherAdditionalRoot()) : Promise.resolve({}),
  ]);

  return { classes, attendance, retreats, semesters, retreatsPrivate, semestersPrivate, teacherStaff, teacherSpecial, teacherExtra, teacherAdditional };
}
