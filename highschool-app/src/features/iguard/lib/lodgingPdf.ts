import type { IguardLodgingHotspot, Room } from "./types";

interface PdfTextItemLike {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
}

export interface LodgingPdfAnalysis {
  label: string;
  building: string;
  pageCount: number;
  hotspots: Record<string, IguardLodgingHotspot>;
  detectedRoomCount: number;
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function fileLabel(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "숙소 배치도";
}

function buildingCandidates(text: string, fileName: string, rooms: Room[]): Array<{ building: string; score: number }> {
  const haystack = normalize(`${text}\n${fileName}`);
  const candidates = [...new Set(
    rooms.map(room => room.dong?.trim()).filter((value): value is string => !!value),
  )];
  return candidates
    .map(building => {
      const compact = normalize(building);
      const tokens = building
        .normalize("NFKC")
        .split(/[\s()·/_-]+/u)
        .map(normalize)
        .filter(token => token.length >= 2 && !["숙소", "숙소동", "건물"].includes(token));
      const exact = haystack.includes(compact) ? 100 + compact.length : 0;
      const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? token.length : 0), 0);
      return { building, score: exact + tokenScore };
    })
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function detectLodgingBuilding(text: string, fileName: string, rooms: Room[]): string {
  const matched = buildingCandidates(text, fileName, rooms)[0];
  if (matched?.score) return matched.building;

  const visibleLines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const buildingLine = visibleLines.find(line =>
    line.length <= 40 && /(숙소동|숙소|생활관|인재관|핵심관|별관|본관|센터|관)$/u.test(line),
  );
  return buildingLine || fileLabel(fileName);
}

function distinctiveBuildingTokens(building: string): string[] {
  return building
    .normalize("NFKC")
    .split(/[\s()·/_-]+/u)
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !["숙소", "숙소동", "건물", "센터", "HRD"].includes(token));
}

function roomNumberOf(room: Room): string {
  return room.roomNumber.normalize("NFKC").replace(/\s+/g, "").replace(/호$/u, "");
}

export async function analyzeLodgingPdf(file: File, rooms: Room[]): Promise<LodgingPdfAnalysis> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: Array<{ page: number; text: string; items: PdfTextItemLike[]; width: number; height: number }> = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter((item): item is typeof item & PdfTextItemLike =>
      "str" in item && "transform" in item,
    );
    pages.push({
      page: pageNumber,
      text: items.map(item => item.str).join("\n"),
      items,
      width: viewport.width,
      height: viewport.height,
    });
  }

  const fullText = pages.map(page => page.text).join("\n");
  const detectedBuildings = buildingCandidates(fullText, file.name, rooms).map(candidate => candidate.building);
  const building = detectedBuildings.length > 0
    ? detectedBuildings.join(" · ")
    : detectLodgingBuilding(fullText, file.name, rooms);
  const targetRooms = detectedBuildings.length > 0
    ? rooms.filter(room => detectedBuildings.some(candidate => normalize(candidate) === normalize(room.dong || "")))
    : rooms;
  const hotspots: Record<string, IguardLodgingHotspot> = {};

  for (const room of targetRooms) {
    const number = roomNumberOf(room);
    if (!number) continue;
    const anchors = pages.flatMap(pdfPage =>
      pdfPage.items
        .filter(item => distinctiveBuildingTokens(room.dong || "").some(token => normalize(item.str).includes(normalize(token))))
        .map(item => ({ page: pdfPage.page, x: item.transform[4], y: item.transform[5] })),
    );
    const occurrences = pages.flatMap(pdfPage =>
      pdfPage.items.flatMap(item => {
        const compact = item.str.normalize("NFKC").replace(/\s+/g, "").replace(/호$/u, "");
        const index = compact.indexOf(number);
        if (index < 0) return [];
        const factor = compact.length > number.length ? (index + number.length / 2) / compact.length : 0.5;
        return [{
          page: pdfPage.page,
          x: item.transform[4] + (item.width || 0) * factor,
          y: item.transform[5] + (item.height || Math.abs(item.transform[3]) || 0) / 2,
          width: pdfPage.width,
          height: pdfPage.height,
        }];
      }),
    );
    const selected = [...occurrences].sort((a, b) => {
      const distance = (occurrence: typeof a) => {
        if (anchors.length === 0) return occurrence.page * 10_000 + occurrence.x;
        return Math.min(...anchors.map(anchor =>
          anchor.page === occurrence.page
            ? Math.abs(anchor.x - occurrence.x) / occurrence.width
              + Math.abs(anchor.y - occurrence.y) / occurrence.height * 0.15
            : 10 + Math.abs(anchor.page - occurrence.page),
        ));
      };
      return distance(a) - distance(b);
    })[0];
    if (!selected) continue;
    hotspots[room.id] = {
      roomId: room.id,
      page: selected.page,
      left: Math.max(0, Math.min(100, selected.x / selected.width * 100)),
      top: Math.max(0, Math.min(100, (1 - selected.y / selected.height) * 100)),
    };
  }

  return {
    label: fileLabel(file.name),
    building,
    pageCount: document.numPages,
    hotspots,
    detectedRoomCount: Object.keys(hotspots).length,
  };
}
