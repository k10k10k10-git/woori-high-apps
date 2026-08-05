import type { IguardScheduleBlock } from "@/features/iguard/lib/types";

function compactName(value: string): string {
  return value.normalize("NFKC").replace(/sf/gi, "").replace(/\s+/g, "");
}

function cleanRole(value: string): string {
  return value
    .replace(/^[\s*•·\-–—]+/u, "")
    .replace(/\s*(?:-{1,2}>|=>|→)\s*/gu, " → ")
    .replace(/\s+/g, " ")
    .replace(/[,:：/|\-–—@\s]+$/u, "")
    .trim();
}

function compactDutyLabel(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\[[^\]]+\]/gu, "")
    .replace(/^담당\s*[·:：-]?\s*/u, "")
    .replace(/\s*(?:-{1,2}>|=>|→)\s*/gu, "→")
    .replace(/[\s·:：,，/|\-–—@()[\]{}]+/gu, "")
    .toLowerCase();
}

function textLines(value?: string | null): string[] {
  return (value || "").split(/\n+/).map(line => line.trim()).filter(Boolean);
}

/** 스탭 명단 안내처럼 개인 담당으로 해석하면 안 되는 특이사항 줄을 제외한다. */
export function visibleNoticeLines(value?: string | null): string[] {
  const lines = textLines(value);
  const visible: string[] = [];
  let inRosterMemo = false;

  for (const line of lines) {
    const compact = line.replace(/\s+/g, "");
    if (/^스탭명단/.test(compact)) {
      inRosterMemo = true;
      continue;
    }
    if (/^\*\s*(볼드체|밑줄|파란색|빨간색)/.test(line)) continue;
    if (inRosterMemo) continue;
    visible.push(line);
  }
  return visible;
}

/** 큐싯 담당·특이사항에서 선택한 스탭이 언급된 역할 줄을 찾는다. */
export function dutyLinesForStaff(block: IguardScheduleBlock, staffName?: string): string[] {
  if (!staffName) return [];
  const target = compactName(staffName);
  const all = [...textLines(block.owner), ...visibleNoticeLines(block.notice)];
  const picked: string[] = [];

  all.forEach((line, index) => {
    if (!compactName(line).includes(target)) return;
    const prev = all[index - 1];
    if (prev && !compactName(prev).includes(target) && /[:：]$/.test(prev.trim()) && !picked.includes(prev)) {
      picked.push(prev);
    }
    if (!picked.includes(line)) picked.push(line);
  });
  return picked;
}

/**
 * 한 줄에 여러 담당자 이름이 있어도 선택한 사람에게 해당하는 "역할명"만 반환한다.
 * 예: "[수련회장] 위 숙소 · 위 숙소: 이채희sf, 전예성sf" -> "위 숙소"
 */
export function dutyLabelsForStaff(lines: string[], staffName?: string): string[] {
  if (!staffName) return [];
  const target = compactName(staffName);
  const labels: string[] = [];

  for (const line of lines) {
    if (!compactName(line).includes(target)) continue;
    const dotParts = line.split(/\s*·\s*/u);
    const matchingParts = dotParts.filter(part => compactName(part).includes(target));

    for (const part of matchingParts.length ? matchingParts : [line]) {
      const colon = part.search(/[:：]/u);
      let label = colon >= 0 ? part.slice(0, colon) : part;
      if (colon < 0) {
        label = label
          .replace(new RegExp(staffName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gu"), "")
          .replace(/\bsf\b/giu, "");
      }
      label = cleanRole(label);
      if (label && label !== "내 담당" && !labels.includes(label)) labels.push(label);
    }
  }

  return labels;
}

/**
 * 같은 블록의 구조화 동선(회색 카드)에 이미 표시되는 역할은
 * 자유문구 담당(보라색 카드)에서 한 번 더 보여주지 않는다.
 */
export function withoutStructuredDutyLabels(
  dutyLabels: string[],
  structuredLabels: string[],
): string[] {
  const structured = new Set(structuredLabels.map(compactDutyLabel).filter(Boolean));
  return dutyLabels.filter(label => !structured.has(compactDutyLabel(label)));
}

/** 개인 카드에서는 다른 스탭의 이름 목록을 숨기고 담당 지점·역할만 남긴다. */
export function personalAssignmentLabel(value: string, staffNames: string[]): string {
  let result = value.normalize("NFKC");
  const colon = result.search(/[:：]/u);
  if (colon >= 0) {
    const suffix = result.slice(colon + 1);
    if (staffNames.some(name => compactName(suffix).includes(compactName(name)))) {
      result = result.slice(0, colon);
    }
  }

  for (const name of [...staffNames].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`${escaped}(?:sf)?`, "giu"), "");
  }

  return result
    .replace(/\bsf\b/giu, "")
    .replace(/\s*[,/|]\s*(?=[,/|]|$)/gu, "")
    .replace(/\s*·\s*(?=·|$)/gu, "")
    .replace(/\s+/g, " ")
    .replace(/[,:：/|·\-\s]+$/u, "")
    .trim();
}
