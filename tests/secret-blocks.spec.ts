import { expect, test } from "@playwright/test";
import { SECRET_LIMITS, buildBody, hasMarkers, inlineBody, isSecretId, marker, markerIds, splitAtMarkers, splitInline, stripMarkers } from "../src/lib/secret-blocks";

/**
 * Phase 12 (pure part): the inline form a DM writes, the marker the body keeps, and the way back.
 * No browser and no database.
 */

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

function ok(inline: string) {
  const r = splitInline(inline);
  if (!r.ok) throw new Error(`expected a valid body, got: ${r.error}`);
  return r.segments;
}
function bad(inline: string) {
  const r = splitInline(inline);
  if (r.ok) throw new Error("expected a refusal");
  return r;
}

test.describe("reading the inline form", () => {
  test("[TC-SECB-001] text with no secret block is one text segment, unchanged", () => {
    expect(ok("Hello\n\nWorld")).toEqual([{ type: "text", text: "Hello\n\nWorld" }]);
    expect(ok("")).toEqual([]);
  });

  test("[TC-SECB-002] a block is found with its text trimmed, and the text around it is kept in order", () => {
    const segs = ok("Before\n:::secret\n  The baker is a spy.  \n:::\nAfter");
    expect(segs.map((s) => s.type)).toEqual(["text", "block", "text"]);
    expect(segs[0]).toMatchObject({ text: "Before" });
    expect(segs[1]).toMatchObject({ type: "block", id: null, text: "The baker is a spy." });
    expect(segs[2]).toMatchObject({ text: "After" });
  });

  test("[TC-SECB-003] a block may carry an id, in any letter case, and keeps several lines and Markdown", () => {
    const segs = ok(`:::secret ${ID_A.toUpperCase()}\nLine one\n\n- a list\n- of things\n:::`);
    expect(segs[0]).toMatchObject({ type: "block", id: ID_A, text: "Line one\n\n- a list\n- of things" });
  });

  test("[TC-SECB-004] two blocks and Windows line endings both work", () => {
    const segs = ok("A\r\n:::secret\r\none\r\n:::\r\nB\r\n:::secret\r\ntwo\r\n:::\r\n");
    expect(segs.filter((s) => s.type === "block")).toHaveLength(2);
  });

  test("[TC-SECB-005] a secret fence inside a code fence is just text", () => {
    const segs = ok("```\n:::secret\nnot a block\n:::\n```\nthen text");
    expect(segs.every((s) => s.type === "text")).toBe(true);
  });

  test("[TC-SECB-006] the fence words must stand alone on their line: ':::secret' inside a sentence is text", () => {
    expect(ok("He said :::secret and left").every((s) => s.type === "text")).toBe(true);
    expect(ok("a ::: b").every((s) => s.type === "text")).toBe(true);
  });
});

test.describe("refusals, each with a plain message and the line", () => {
  test("[TC-SECB-007] a nested block", () => {
    const r = bad(":::secret\none\n:::secret\ntwo\n:::\n:::");
    expect(r.error).toMatch(/nested/);
    expect(r.line).toBe(3);
  });

  test("[TC-SECB-008] a block that never ends", () => {
    const r = bad("intro\n:::secret\nforever");
    expect(r.error).toMatch(/never ends/);
    expect(r.line).toBe(2);
  });

  test("[TC-SECB-009] an end with no start", () => {
    const r = bad("text\n:::\nmore");
    expect(r.error).toMatch(/none was opened/);
    expect(r.line).toBe(2);
  });

  test("[TC-SECB-010] an empty block, even one holding only blank lines", () => {
    expect(bad(":::secret\n:::").error).toMatch(/empty/);
    expect(bad(":::secret\n\n   \n:::").error).toMatch(/empty/);
  });

  test("[TC-SECB-011] a malformed opening line (a word after secret, or a bad id)", () => {
    expect(bad(":::secret now\ntext\n:::").error).toMatch(/line of its own/);
    expect(bad(":::secret not-a-uuid\ntext\n:::").error).toMatch(/line of its own/);
    expect(bad(":::secretive\ntext\n:::").error).toMatch(/line of its own/);
  });

  test("[TC-SECB-012] the size limits hold at the boundary: 20,000 characters pass, 20,001 do not; 50 blocks pass, 51 do not", () => {
    expect(splitInline(`:::secret\n${"x".repeat(SECRET_LIMITS.maxChars)}\n:::`).ok).toBe(true);
    expect(bad(`:::secret\n${"x".repeat(SECRET_LIMITS.maxChars + 1)}\n:::`).error).toMatch(/limit/);
    const blocks = (n: number) => Array.from({ length: n }, (_, i) => `:::secret\nbit ${i}\n:::`).join("\n");
    expect(splitInline(blocks(SECRET_LIMITS.maxBlocks)).ok).toBe(true);
    expect(bad(blocks(SECRET_LIMITS.maxBlocks + 1)).error).toMatch(/at most 50/);
  });
});

test.describe("the stored body and the way back", () => {
  test("[TC-SECB-013] building the body replaces each block with its marker on a line of its own and keeps the text", () => {
    const segs = ok("Before\n:::secret\nHidden\n:::\nAfter");
    const body = buildBody(segs, () => ID_A);
    expect(body).toBe(`Before\n\n${marker(ID_A)}\n\nAfter`);
    expect(body).not.toContain("Hidden");
  });

  test("[TC-SECB-014] the body never contains the secret text, whatever the block holds", () => {
    const segs = ok(`:::secret\nzzcanary mentions [[Somebody]] and <script>alert(1)</script>\n:::`);
    const body = buildBody(segs, () => ID_A);
    expect(body).not.toMatch(/zzcanary|Somebody|script/);
    expect(body).toContain(ID_A);
  });

  test("[TC-SECB-015] marker ids come back in order, case-insensitively, and only for whole marker lines", () => {
    const body = `${marker(ID_A)}\ntext {{§${ID_B}}} inline\n  ${marker(ID_B.toUpperCase())}  \n`;
    expect(markerIds(body)).toEqual([ID_A, ID_B]);
    expect(hasMarkers("plain")).toBe(false);
    expect(hasMarkers(marker(ID_A))).toBe(true);
  });

  test("[TC-SECB-016] inlining restores the editor form from the body and the stored texts; an unknown marker is dropped", () => {
    const body = `Intro\n\n${marker(ID_A)}\n\n${marker(ID_B)}\n\nOutro`;
    const inline = inlineBody(body, new Map([[ID_A, "First secret"]]));
    expect(inline).toContain(`:::secret ${ID_A}\nFirst secret\n:::`);
    expect(inline).not.toContain(ID_B);
    expect(inline).toContain("Intro");
    expect(inline).toContain("Outro");
  });

  test("[TC-SECB-017] round trip: inline -> body + blocks -> inline gives the same blocks", () => {
    const original = `Top\n:::secret ${ID_A}\nOne\n:::\nMiddle\n:::secret ${ID_B}\nTwo\n:::\nEnd`;
    const segs = ok(original);
    const ids = [ID_A, ID_B];
    const body = buildBody(segs, (i) => ids[i]);
    const texts = new Map(segs.filter((s) => s.type === "block").map((s, i) => [ids[i], (s as { text: string }).text]));
    const again = ok(inlineBody(body, texts));
    expect(again.filter((s) => s.type === "block").map((s) => (s as { id: string; text: string }).text)).toEqual(["One", "Two"]);
    expect(again.filter((s) => s.type === "block").map((s) => (s as { id: string }).id)).toEqual(ids);
  });

  test("[TC-SECB-018] stripping removes marker lines and nothing else", () => {
    const text = `Keep this\n${marker(ID_A)}\nand this\n   ${marker(ID_B)}   \nand {{§not-a-marker}} stays`;
    const out = stripMarkers(text);
    expect(out).toBe("Keep this\nand this\nand {{§not-a-marker}} stays");
  });

  test("[TC-SECB-019] splitting at markers gives text and secrets in page order", () => {
    const parts = splitAtMarkers(`One\n\n${marker(ID_A)}\n\nTwo\n${marker(ID_B)}\nThree`);
    expect(parts.map((p) => p.type)).toEqual(["text", "secret", "text", "secret", "text"]);
    expect(parts.filter((p) => p.type === "secret").map((p) => (p as { id: string }).id)).toEqual([ID_A, ID_B]);
  });

  test("[TC-SECB-020] the marker contains no English word, so a search for 'secret' cannot find pages that have one", () => {
    expect(marker(ID_A)).not.toMatch(/secret/i);
    expect(/^[^a-z]*[a-f0-9-]*[^a-z]*$/i.test(marker(ID_A).replace(/[{}§]/g, ""))).toBe(true);
  });

  test("[TC-SECB-021] ids are recognised in canonical form only", () => {
    expect(isSecretId(ID_A)).toBe(true);
    expect(isSecretId(ID_A.toUpperCase())).toBe(true);
    for (const bad of ["", "nope", ID_A.slice(1), `${ID_A}0`, "11111111111141118111111111111111", "' OR 1=1 --"]) expect(isSecretId(bad), bad).toBe(false);
  });
});
