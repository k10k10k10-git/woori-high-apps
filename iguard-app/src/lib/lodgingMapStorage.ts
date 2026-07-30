import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";

function safeFileName(name: string): string {
  return name.normalize("NFKC").replace(/[^0-9A-Za-z가-힣._-]+/g, "_").slice(-120);
}

export async function uploadLodgingMapPdf(
  retreatId: string,
  mapId: string,
  file: File,
): Promise<{ filePath: string; fileUrl: string }> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("PDF 파일만 업로드할 수 있습니다.");
  }
  if (file.size > 30 * 1024 * 1024) throw new Error("PDF는 30MB 이하만 업로드할 수 있습니다.");
  const filePath = `retreats/${retreatId}/iguard/lodging-maps/${mapId}/${safeFileName(file.name)}`;
  const target = ref(storage, filePath);
  await uploadBytes(target, file, { contentType: "application/pdf" });
  return { filePath, fileUrl: await getDownloadURL(target) };
}

export async function deleteLodgingMapPdf(filePath: string): Promise<void> {
  if (!filePath) return;
  await deleteObject(ref(storage, filePath));
}
