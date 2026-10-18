// Reads what we need to know about a picture file: its type and size in pixels.
// Only PNG and JPEG are accepted. This avoids a library and keeps unknown formats out of projects.

export interface ImageInfo { type: "png" | "jpeg"; extension: "png" | "jpg"; mime: string; width: number; height: number }

export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { type: "png", extension: "png", mime: "image/png", width, height } : null;
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) { at++; continue; }
      const marker = bytes[at + 1];
      if (marker === 0xff) { at++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
      const length = view.getUint16(at + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        const height = view.getUint16(at + 5);
        const width = view.getUint16(at + 7);
        return width > 0 && height > 0 ? { type: "jpeg", extension: "jpg", mime: "image/jpeg", width, height } : null;
      }
      at += 2 + length;
    }
  }
  return null;
}
