import type { PhotoMimeType } from './schemas';

/**
 * The image type a file's first bytes say it is, or undefined (API_DESIGN §22.3, SYSTEM_DESIGN
 * §40). The server trusts this, never the declared type or the Content-Type header.
 */
export function sniffImageType(bytes: Uint8Array): PhotoMimeType | undefined {
  const starts = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, i) => bytes[offset + i] === byte);

  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // "RIFF" <size> "WEBP"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return undefined;
}
