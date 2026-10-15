import { deflateSync, crc32 } from "node:zlib";
import { expect, test } from "@playwright/test";
import { imageSize, slugFromFile, titleFromFile } from "../scripts/lib/image-size";

/** Reading a map image's size from its own header, and the names made from file names. No browser, no database. */

function png(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc((w * 4 + 1) * h))), chunk("IEND", Buffer.alloc(0))]);
}

/** A JPEG with some segments before the frame header, as real files have. */
function jpeg(w: number, h: number, marker = 0xc0): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const dqt = Buffer.concat([Buffer.from([0xff, 0xdb, 0x00, 0x43, 0x00]), Buffer.alloc(64, 1)]);
  const sof = Buffer.from([0xff, marker, 0x00, 0x0b, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x01, 0x01, 0x11, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, dqt, sof, Buffer.from([0xff, 0xd9])]);
}

test.describe("reading the size", () => {
  test("[TC-IMGS-001] a PNG's size is read from its header, for tall, wide and tiny images, and the real continent map", () => {
    expect(imageSize(png(64, 48))).toEqual({ width: 64, height: 48 });
    expect(imageSize(png(1, 1))).toEqual({ width: 1, height: 1 });
    expect(imageSize(png(5000, 20))).toEqual({ width: 5000, height: 20 });
    expect(imageSize(png(20, 5000))).toEqual({ width: 20, height: 5000 });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const real = (require("node:fs") as typeof import("node:fs")).readFileSync(require("node:path").join(__dirname, "..", "public", "maps", "wip-map.png"));
    expect(imageSize(real)).toEqual({ width: 2250, height: 1200 });
  });

  test("[TC-IMGS-002] a JPEG's size is read after the segments that come first, whichever kind of frame it uses", () => {
    expect(imageSize(jpeg(640, 480))).toEqual({ width: 640, height: 480 });
    expect(imageSize(jpeg(3000, 2000, 0xc2))).toEqual({ width: 3000, height: 2000 }); // progressive
    expect(imageSize(jpeg(1, 65535))).toEqual({ width: 1, height: 65535 });
  });

  test("[TC-IMGS-003] anything else is refused: text, an empty file, a short one, a damaged PNG or JPEG, a GIF, a zero size", () => {
    for (const bad of [Buffer.from("not an image"), Buffer.alloc(0), Buffer.from([0x89, 0x50]), Buffer.from("GIF89a\x01\x00\x01\x00", "binary"), png(64, 48).subarray(0, 20), jpeg(10, 10).subarray(0, 8), png(0, 10), jpeg(0, 10)]) {
      expect(imageSize(bad)).toBeNull();
    }
    const notIhdr = png(64, 48);
    notIhdr.write("XXXX", 12, "ascii");
    expect(imageSize(notIhdr)).toBeNull();
  });
});

test.describe("names from file names", () => {
  test("[TC-IMGS-004] a title is made of the words, capitalised, whatever separates them", () => {
    expect(titleFromFile("port-city.png")).toBe("Port City");
    expect(titleFromFile("the_old_harbour_map.jpg")).toBe("The Old Harbour Map");
    expect(titleFromFile("Helarchon  district.JPEG")).toBe("Helarchon District");
    expect(titleFromFile(".png")).toBe("Map");
  });

  test("[TC-IMGS-005] a slug is lower case, with single hyphens, and never empty or starting or ending with a hyphen", () => {
    expect(slugFromFile("Port City.png")).toBe("port-city");
    expect(slugFromFile("__The  Old__Harbour!!.jpg")).toBe("the-old-harbour");
    expect(slugFromFile("map (2).png")).toBe("map-2");
    expect(slugFromFile("!!!.png")).toBe("map");
  });
});
