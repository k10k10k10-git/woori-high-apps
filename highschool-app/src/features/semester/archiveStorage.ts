import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { safeArchiveFileName } from "./archiveFile";

export async function uploadSemesterArchiveFile(
  semesterId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ filePath: string; fileUrl: string }> {
  if (file.size > 30 * 1024 * 1024) throw new Error("파일은 30MB 이하만 업로드할 수 있습니다.");
  const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const filePath = `semesters/${semesterId}/archive/${fileId}/${safeArchiveFileName(file.name)}`;
  const target = ref(storage, filePath);
  const upload = uploadBytesResumable(target, file, { contentType: file.type || "application/octet-stream" });

  await new Promise<void>((resolve, reject) => {
    upload.on(
      "state_changed",
      snapshot => onProgress?.(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)),
      reject,
      resolve,
    );
  });

  return { filePath, fileUrl: await getDownloadURL(target) };
}

export async function deleteSemesterArchiveFile(filePath: string): Promise<void> {
  if (!filePath) return;
  try {
    await deleteObject(ref(storage, filePath));
  } catch (error) {
    if ((error as { code?: string }).code !== "storage/object-not-found") throw error;
  }
}
