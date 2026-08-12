/**
 * 역할 배정 실행기 — planRoleAssignment가 만든 단계를 도메인 db 함수로 실행한다.
 * (firebase를 직접 import하지 않는다. 쓰기는 각 도메인의 db 모듈만 담당한다.)
 */

import {
  addRetreatAdmin,
  removeRetreatAdmin,
  setMainAdmin,
} from "@/lib/db";
import { approveIguardMember, removeIguardMember } from "@/features/iguard/lib/db";
import type { RoleAssignStep } from "./roleAssign";

export type RoleTarget = { uid: string; email: string; name?: string; hasIguardMember: boolean };

export async function applyRoleSteps(steps: RoleAssignStep[], target: RoleTarget): Promise<void> {
  for (const step of steps) {
    switch (step.kind) {
      case "setMainAdmin":
        await setMainAdmin(target.uid, step.enabled);
        break;
      case "setRetreatAdmin":
        await addRetreatAdmin(target.uid, target.email, target.name, step.role, step.roles);
        break;
      case "removeRetreatAdmin":
        await removeRetreatAdmin(target.uid);
        break;
      case "setIguardMember":
        // 이미 멤버여도 두 축 역할을 함께 저장해야 하므로 approve 경로 하나만 쓴다.
        // (멤버·역할·대기열을 한 번의 multi-path update로 처리한다.)
        await approveIguardMember(target.uid, target.email, step.role, target.name, step.roles);
        break;
      case "removeIguardMember":
        await removeIguardMember(target.uid);
        break;
    }
  }
}
