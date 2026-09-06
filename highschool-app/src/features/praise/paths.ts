const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
export function assertPraiseId(value: string): string {
  if (!SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) throw new Error("올바르지 않은 찬양팀 기록 번호입니다.");
  return value;
}
export const praisePaths = {
  root: () => "praiseOps",
  workspace: (id: string) => `praiseOps/${assertPraiseId(id)}`,
  metadata: (id: string) => `praiseOps/${assertPraiseId(id)}/meta`,
  audit: (id: string) => `praiseOps/${assertPraiseId(id)}/audit`,
};
