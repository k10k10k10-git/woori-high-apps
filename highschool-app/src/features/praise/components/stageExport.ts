import { escapeHtml, printAsPDF } from "@/lib/exportUtils";
import type { PraiseStageVersion } from "../types";
function title(version: PraiseStageVersion) {
  return `${version.worshipDate} 찬양팀 등단표 · ${version.kind === "CONFIRMED" ? "확정" : "초안"} ${version.number}차`;
}
const positions = ["LEFT", "RIGHT"] as const;
const roles = ["CHOIR", "SINGER"] as const;
/** 화면과 동일한 좌우 무대 배치로 출력하며 모든 이름은 HTML 이스케이프한다. */
export function printStagePDF(version: PraiseStageVersion): boolean {
  const html = `<style>.stage{background:#13271f;color:#fff;padding:28px;border-radius:16px;break-inside:avoid;margin-bottom:28px}.stage h2,.stage p{color:inherit;text-align:center}.stage-row{display:flex;gap:40px;margin:36px 0}.stage-zone{flex:1;border:1px solid #718579;padding:20px;text-align:center}.stage-person{display:inline-block;border:1px solid #718579;border-radius:8px;padding:12px;margin:5px}.stage-leader{text-align:center}.stage-label{display:block;font-size:12px;color:#c5d4c9}@media print{.stage{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style><h1>${escapeHtml(title(version))}</h1><p>회중석에서 바라본 무대</p>${version.services
    .map(
      (service) =>
        `<section class="stage"><h2>${service.department === "FIRST" ? "1부" : "2부"} 등단표</h2>${roles
          .map(
            (role) =>
              `<div class="stage-row">${positions
                .map(
                  (side) =>
                    `<div class="stage-zone"><span class="stage-label">${role === "CHOIR" ? "콰이어" : "싱어"} · ${side === "LEFT" ? "왼쪽" : "오른쪽"}</span>${
                      service.assignments
                        .filter((p) => p.role === role && p.side === side)
                        .sort((a, b) => a.positionOrder - b.positionOrder)
                        .map(
                          (p) =>
                            `<span class="stage-person">${escapeHtml(p.name)}</span>`,
                        )
                        .join("") || "배정 없음"
                    }</div>`,
                )
                .join("")}</div>`,
          )
          .join(
            "",
          )}<div class="stage-leader">인도자<br /><span class="stage-person">${escapeHtml(version.leaderName)}</span></div></section>`,
    )
    .join("")}`;
  return printAsPDF(html, title(version), true);
}
/** 외부 이미지·개인정보 서버 업로드 없이 브라우저 안에서 무대 캔버스를 만든다. */
export async function exportStagePNG(
  version: PraiseStageVersion,
): Promise<void> {
  await document.fonts?.ready;
  const width = 1600,
    columns = 4;
  const layouts = version.services.map((s) =>
    roles.map((role) =>
      Math.max(
        1,
        ...positions.map((side) =>
          Math.ceil(
            s.assignments.filter((p) => p.role === role && p.side === side)
              .length / columns,
          ),
        ),
      ),
    ),
  );
  const heights = layouts.map(
    (rows) => 260 + rows.reduce((sum, count) => sum + 85 + count * 80, 0),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 160 + heights.reduce((a, b) => a + b, 0);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.fillStyle = "#f7f7f2";
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.fillStyle = "#17271f";
  ctx.font = "bold 32px sans-serif";
  ctx.fillText(title(version), 60, 60);
  ctx.font = "23px sans-serif";
  ctx.fillText("회중석에서 바라본 무대", 60, 104);
  let y = 140;
  version.services.forEach((service, index) => {
    ctx.fillStyle = "#13271f";
    ctx.fillRect(40, y, width - 80, heights[index] - 20);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `${service.department === "FIRST" ? "1부" : "2부"} 등단표`,
      width / 2,
      y + 60,
    );
    let rowY = y + 100;
    roles.forEach((role, ri) => {
      positions.forEach((side, si) => {
        const x = 70 + si * 760,
          zoneHeight = 60 + layouts[index][ri] * 80;
        ctx.strokeStyle = "#718579";
        ctx.strokeRect(x, rowY, 700, zoneHeight);
        ctx.fillStyle = "#b7cabf";
        ctx.font = "20px sans-serif";
        ctx.fillText(
          `${role === "CHOIR" ? "콰이어" : "싱어"} · ${side === "LEFT" ? "왼쪽" : "오른쪽"}`,
          x + 350,
          rowY + 30,
        );
        service.assignments
          .filter((p) => p.role === role && p.side === side)
          .sort((a, b) => a.positionOrder - b.positionOrder)
          .forEach((p, i) => {
            const px = x + 18 + (i % columns) * 167,
              py = rowY + 48 + Math.floor(i / columns) * 80;
            ctx.strokeRect(px, py, 154, 62);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 25px sans-serif";
            ctx.fillText(p.name, px + 77, py + 40, 145);
          });
      });
      rowY += 85 + layouts[index][ri] * 80;
    });
    ctx.fillStyle = "#b7cabf";
    ctx.font = "20px sans-serif";
    ctx.fillText("인도자", width / 2, rowY + 22);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(version.leaderName, width / 2, rowY + 60);
    y += heights[index];
  });
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))),
      "image/png",
    ),
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${version.worshipDate}-찬양팀-등단표-${version.number}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
