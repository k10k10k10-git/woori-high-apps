function compactName(value: string): string {
  return value.normalize("NFKC").replace(/sf/gi, "").replace(/\s+/g, "");
}

function cleanRole(value: string): string {
  return value
    .replace(/^[\s*•·\-–—]+/u, "")
    .replace(/\s+/g, " ")
    .replace(/[,:：/|\-–—\s]+$/u, "")
    .trim();
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
