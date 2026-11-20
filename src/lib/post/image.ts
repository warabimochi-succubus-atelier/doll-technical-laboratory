// 写真を端末の中で縮小・再エンコードする。
// canvas に描き直すので、EXIF（位置情報・撮影機種など）はすべて消える。
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.8;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // 写真の回転情報を反映して読み込む
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // createImageBitmap が使えない・失敗したときは <img> で読み込む（向きはブラウザが反映する）
    const src = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(src);
    }
  }
}

export async function resizeToJpeg(file: File): Promise<Blob> {
  const source = await decode(file);
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height)); // 小さい写真は拡大しない
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('写真を変換できませんでした'))),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  );
}

/** Blob / 文字列を GitHub API に送るための base64 にする */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export const textToBase64 = (text: string) => blobToBase64(new Blob([text]));
