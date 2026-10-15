/**
 * The pixel size of a PNG or JPEG, read from its own header, so a registered map can never disagree with its file.
 * Returns null for anything else (or a file too short or damaged to read).
 */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  // PNG: the 8-byte signature, then the IHDR chunk holding width and height.
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a && buf.toString("ascii", 12, 16) === "IHDR") {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // JPEG: walk the segments until a start-of-frame marker.
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      let marker = buf[i + 1];
      while (marker === 0xff && i + 2 < buf.length) {
        i++;
        marker = buf[i + 1];
      }
      i += 2;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // markers with no length
      if (i + 1 >= buf.length) return null;
      const length = buf.readUInt16BE(i);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        if (i + 7 > buf.length) return null;
        const height = buf.readUInt16BE(i + 3);
        const width = buf.readUInt16BE(i + 5);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      if (length < 2) return null;
      i += length;
    }
  }
  return null;
}

/** A readable title from a file name: "port-city_map.png" becomes "Port City Map". */
export function titleFromFile(file: string): string {
  const stem = file.replace(/\.[^.]+$/, "");
  const words = stem.split(/[-_\s]+/).filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Map";
}

/** A web-safe slug from a file name. */
export function slugFromFile(file: string): string {
  return (
    file
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "map"
  );
}
