// 학생 사진 압축 유틸
// 사진은 classes/{year}/{ck}/students 에 base64로 저장되는데, 이 노드는
// 4개 앱이 매 세션 통째로 구독한다. 원본(수 MB)을 그대로 넣으면 전체 트리
// 로딩이 무거워지므로, 업로드 전 캔버스로 축소·JPEG 압축해 수십 KB로 줄인다.
export async function compressImage(
  file: File,
  maxSize = 320,
  quality = 0.72,
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    im.src = dataUrl;
  });

  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl; // 캔버스 불가 시 원본 폴백
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}
