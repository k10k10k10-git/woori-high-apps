import { escapeHtml, printAsPDF } from "@/lib/exportUtils";
import type { PraiseStageVersion } from "../types";
function title(version: PraiseStageVersion) { return `${version.worshipDate} 찬양팀 등단표 · ${version.kind === "CONFIRMED" ? "확정" : "초안"} ${version.number}차`; }
export function printStagePDF(version: PraiseStageVersion): boolean {
  const html = `<h1>${escapeHtml(title(version))}</h1><p>인도 ${escapeHtml(version.leaderName)} · 회중석에서 바라본 무대</p>${version.services.map((service) => `<section class="section"><h2>${service.department === "FIRST" ? "1부" : "2부"} 예배</h2><table><thead><tr><th>역할</th><th>왼쪽</th><th>오른쪽</th></tr></thead><tbody>${(["CHOIR", "SINGER"] as const).map((role) => `<tr><th>${role === "CHOIR" ? "콰이어" : "싱어"}</th>${(["LEFT", "RIGHT"] as const).map((side) => `<td>${service.assignments.filter((person) => person.role === role && person.side === side).sort((a, b) => a.positionOrder - b.positionOrder).map((person) => escapeHtml(person.name + (person.personType === "STAFF" ? " (스탭)" : ""))).join(" · ") || "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`).join("")}`;
  return printAsPDF(html, title(version), true);
}
/** HTML과 외부 이미지를 사용하지 않고 텍스트·무대 위치만 고해상도 캔버스에 그린다. */
export async function exportStagePNG(version: PraiseStageVersion): Promise<void> {
  await document.fonts?.ready;
  const width = 1600;
  const rowHeight = 62;
  const roleRows = version.services.map((service) => (["CHOIR", "SINGER"] as const).map((role) => Math.max(1, ...(["LEFT", "RIGHT"] as const).map((side) => service.assignments.filter((person) => person.role === role && person.side === side).length))));
  const height = 170 + roleRows.reduce((sum, roles) => sum + 100 + roles.reduce((subtotal, count) => subtotal + 66 + count * rowHeight, 0), 0);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("canvas_unavailable");
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); context.fillStyle = "#20252b"; context.font = "bold 34px sans-serif"; context.fillText(title(version), 60, 70); context.font = "24px sans-serif"; context.fillStyle = "#505b66"; context.fillText(`인도 ${version.leaderName} · 회중석에서 바라본 무대`, 60, 117);
  let y = 165;
  version.services.forEach((service, serviceIndex) => {
    context.fillStyle = "#20252b"; context.font = "bold 30px sans-serif"; context.fillText(service.department === "FIRST" ? "1부 예배" : "2부 예배", 60, y + 34); y += 80;
    (["CHOIR", "SINGER"] as const).forEach((role, roleIndex) => {
      const count = roleRows[serviceIndex][roleIndex]; context.fillStyle = "#f3f5f7"; context.fillRect(60, y, width - 120, 54); context.fillStyle = "#505b66"; context.font = "bold 24px sans-serif"; context.fillText(`${role === "CHOIR" ? "콰이어" : "싱어"} · 왼쪽`, 84, y + 36); context.fillText("오른쪽", 840, y + 36); y += 64;
      (["LEFT", "RIGHT"] as const).forEach((side) => service.assignments.filter((person) => person.role === role && person.side === side).sort((a, b) => a.positionOrder - b.positionOrder).forEach((person, index) => { context.fillStyle = "#20252b"; context.font = "27px sans-serif"; context.fillText(`${index + 1}. ${person.name}${person.personType === "STAFF" ? " (스탭)" : ""}`, side === "LEFT" ? 84 : 840, y + index * rowHeight + 36, 650); }));
      y += count * rowHeight + 2;
    }); y += 20;
  });
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("이미지 변환 실패")), "image/png"));
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${version.worshipDate}-찬양팀-등단표-${version.number}.png`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
