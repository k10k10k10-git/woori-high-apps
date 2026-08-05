/**
 * 역할 배정 실행기 — planRoleAssignment가 만든 단계를 도메인 db 함수로 실행한다.
 * (firebase를 직접 import하지 않는다. 쓰기는 각 도메인의 db 모듈만 담당한다.)
 */

import {
  addRetreatAdmin,
  removeRetreatAdmin,
  setMainAdmin,
} from "@/lib/db";
import { approveIguardMember, removeIguardMember, setIguardRole } from "@/features/iguard/lib/db";
import type { RoleAssignStep } from "./roleAssign";

export type RoleTarget = { uid: string; email: string; name?: string; hasIguardMember: boolean };

export async function applyRoleSteps(steps: RoleAssignStep[], target: RoleTarget): Promise<void> {
  let iguardExists = target.hasIguardMember;
  for (const step of steps) {
    switch (step.kind) {
      case "setMainAdmin":
        await setMainAdmin(target.uid, step.enabled);
        break;
      case "setRetreatAdmin":
        await addRetreatAdmin(target.uid, target.email, target.name, step.role);
        break;
      case "removeRetreatAdmin":
        await removeRetreatAdmin(target.uid);
        break;
      case "setIguardMember":
        if (iguardExists) await setIguardRole(target.uid, step.role);
        else await approveIguardMember(target.uid, target.email, step.role, target.name);
        iguardExists = true;
        break;
      case "removeIguardMember":
        await removeIguardMember(target.uid);
        iguardExists = false;
        break;
    }
  }
}
