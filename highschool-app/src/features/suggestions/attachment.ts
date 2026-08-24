import type { PreparedSiteRequestAttachment } from "./siteRequest";

const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1_200_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("첨부 이미지를 읽지 못했습니다."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("첨부 이미지를 변환하지 못했습니다.")),
      "image/jpeg",
      quality,
    );
  });
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("첨부 이미지를 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

function safeJpegName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[^0-9A-Za-z가-힣._ -]/g, "_").trim() || "screenshot";
  return `${stem.slice(0, 100)}.jpg`;
}

/** Storage 업로드 전에 스크린샷을 최대 1600px·1.2MB JPEG로 축소한다. */
export async function prepareSiteRequestAttachment(file: File): Promise<PreparedSiteRequestAttachment> {
  if (!/^image\/(?:jpeg|png|webp)$/i.test(file.type)) throw new Error("JPG, PNG, WEBP 이미지만 첨부할 수 있습니다.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("첨부 이미지는 12MB 이하여야 합니다.");

  const image = await loadImage(file);
  const attempts = [
    { maxEdge: 1600, quality: 0.84 },
    { maxEdge: 1280, quality: 0.72 },
    { maxEdge: 1024, quality: 0.62 },
  ];
  for (const attempt of attempts) {
    const scale = Math.min(1, attempt.maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("첨부 이미지를 처리할 수 없는 브라우저입니다.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas, attempt.quality);
    if (blob.size <= MAX_OUTPUT_BYTES) {
      return {
        name: safeJpegName(file.name),
        type: "image/jpeg",
        size: blob.size,
        dataUrl: await blobDataUrl(blob),
      };
    }
  }
  throw new Error("첨부 이미지를 1.2MB 이하로 줄이지 못했습니다. 더 작은 이미지를 선택해 주세요.");
}
