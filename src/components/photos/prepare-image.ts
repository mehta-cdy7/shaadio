import {
  DISPLAY_MAX_BYTES,
  DISPLAY_MAX_SIDE,
  SELECTED_FILE_MAX_BYTES,
  THUMB_MAX_BYTES,
  THUMB_MAX_SIDE,
  type PhotoMimeType,
} from '@/modules/gallery/schemas';

/**
 * The browser half of the upload pipeline (SYSTEM_DESIGN §37, §39): decode the selected file,
 * resize it to a display image (longest side 2560 px) and a grid thumbnail, and encode both as
 * WebP (JPEG where the browser cannot encode WebP). Originals never leave the phone. This step is
 * what keeps the gallery fast on a guest's phone, so it is load-bearing (§42).
 *
 * HEIC: Safari decodes it natively, and iOS hands other pickers a JPEG. A browser that cannot
 * decode the file gets UNREADABLE and a clear message (§39), never an unviewable upload.
 */

export type PreparedPhoto = {
  display: Blob;
  thumb: Blob;
  mimeType: PhotoMimeType;
  width: number;
  height: number;
};

export type PrepareError = 'VIDEO' | 'NOT_AN_IMAGE' | 'TOO_BIG' | 'UNREADABLE';

/** The size that fits within `max` on its longest side, never enlarged. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const HEIC = /\.(heic|heif)$/i;

/** Quick checks on the selected file, before any decoding (PRD §9.22). */
export function checkSelectedFile(
  file: Pick<File, 'type' | 'name' | 'size'>,
): PrepareError | undefined {
  if (file.type.startsWith('video/')) return 'VIDEO';
  // Some browsers report HEIC with an empty type.
  if (!file.type.startsWith('image/') && !HEIC.test(file.name)) return 'NOT_AN_IMAGE';
  if (file.size > SELECTED_FILE_MAX_BYTES) return 'TOO_BIG';
  return undefined;
}

type Canvas = {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
};

function makeCanvas(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    return { canvas, ctx: canvas.getContext('2d')! };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function encode(canvas: Canvas['canvas'], type: string, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality }).catch(() => null);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Draws the bitmap at `size` and encodes it, lowering quality until it fits `maxBytes`. Returns
 * undefined if even the lowest quality is too large (practically never at these sizes).
 */
async function render(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
  maxBytes: number,
  qualities: number[],
): Promise<{ blob: Blob; mimeType: PhotoMimeType } | undefined> {
  const { canvas, ctx } = makeCanvas(size.width, size.height);
  // A white backdrop, so transparent PNGs do not turn black when encoded as JPEG.
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);

  for (const quality of qualities) {
    let blob = await encode(canvas, 'image/webp', quality);
    // Browsers that cannot encode WebP silently return PNG; use JPEG instead.
    if (!blob || blob.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg', quality);
    if (!blob) return undefined;
    const mimeType = blob.type as PhotoMimeType;
    if (blob.size <= maxBytes) return { blob, mimeType };
  }
  return undefined;
}

/** Decodes and resizes one selected file. Both outputs share one format, as the API requires. */
export async function prepareImage(file: File): Promise<PreparedPhoto | { error: PrepareError }> {
  const problem = checkSelectedFile(file);
  if (problem) return { error: problem };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { error: 'UNREADABLE' };
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height, DISPLAY_MAX_SIDE);
    const display = await render(bitmap, size, DISPLAY_MAX_BYTES, [0.85, 0.72, 0.6]);
    if (!display) return { error: 'TOO_BIG' };
    const thumbSize = fitWithin(bitmap.width, bitmap.height, THUMB_MAX_SIDE);
    const thumb = await render(bitmap, thumbSize, THUMB_MAX_BYTES, [0.75, 0.6, 0.45]);
    if (!thumb) return { error: 'TOO_BIG' };
    // One upload declares one type for both files; the same browser encodes both the same way.
    if (thumb.mimeType !== display.mimeType) return { error: 'UNREADABLE' };
    return {
      display: display.blob,
      thumb: thumb.blob,
      mimeType: display.mimeType,
      width: size.width,
      height: size.height,
    };
  } finally {
    bitmap.close();
  }
}
