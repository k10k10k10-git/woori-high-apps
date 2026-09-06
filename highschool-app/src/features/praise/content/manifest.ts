import type { PraiseResource } from "./types";

/** 공개 배포 전 본문·이미지 검토를 마친 파일만 추가한다. 원본 명단은 포함하지 않는다. */
export const PRAISE_RESOURCES = [
  {
    id: "nanum-marble-kit",
    title: "전체 운영안과 게임판",
    description: "운영 순서, 그룹 질문, 나눔 질문 55개와 게임판 3종을 담은 편집용 21장 슬라이드입니다.",
    href: "/praise-resources/nanum-marble-kit.pptx",
    format: "PPTX",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    bytes: 155048,
  },
  {
    id: "nanum-marble-guide",
    title: "진행자 안내문",
    description: "라운드별 시간 배분, 진행 멘트, 질문과 준비물을 텍스트로 확인합니다.",
    href: "/praise-resources/nanum-marble-guide.txt",
    format: "TXT",
    mimeType: "text/plain",
    bytes: 17254,
  },
  {
    id: "nanum-marble-round-1",
    title: "1라운드 인쇄판 · 취향으로 가볍게",
    description: "A3 가로 권장 · 3360 × 2376px · 그룹 수만큼 인쇄해 사용합니다.",
    href: "/praise-resources/nanum-marble-round-1.png",
    format: "PNG",
    mimeType: "image/png",
    bytes: 576401,
  },
  {
    id: "nanum-marble-round-2",
    title: "2라운드 인쇄판 · 음악으로 함께",
    description: "A3 가로 권장 · 3360 × 2376px · 그룹 수만큼 인쇄해 사용합니다.",
    href: "/praise-resources/nanum-marble-round-2.png",
    format: "PNG",
    mimeType: "image/png",
    bytes: 606087,
  },
  {
    id: "nanum-marble-round-3",
    title: "3라운드 인쇄판 · 응원으로 깊게",
    description: "A3 가로 권장 · 3360 × 2376px · 그룹 수만큼 인쇄해 사용합니다.",
    href: "/praise-resources/nanum-marble-round-3.png",
    format: "PNG",
    mimeType: "image/png",
    bytes: 605401,
  },
] as const satisfies readonly PraiseResource[];

export function praiseResourceSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1_000)} KB`;
}
