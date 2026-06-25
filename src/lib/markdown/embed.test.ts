import { describe, it, expect } from "vitest";
import { parseEmbed, EMBED_RE } from "./embed";

describe("parseEmbed", () => {
  it("plain note — no anchor, no alias", () => {
    expect(parseEmbed("note")).toEqual({
      target: "note",
      anchor: null,
      alias: null,
      isBlockRef: false,
      kind: "note",
    });
  });

  it("note with heading anchor", () => {
    const result = parseEmbed("note#Heading");
    expect(result.target).toBe("note");
    expect(result.anchor).toBe("Heading");
    expect(result.isBlockRef).toBe(false);
    expect(result.kind).toBe("note");
  });

  it("note with block ref anchor — strips leading ^", () => {
    const result = parseEmbed("note#^abc123");
    expect(result.target).toBe("note");
    expect(result.anchor).toBe("abc123");
    expect(result.isBlockRef).toBe(true);
    expect(result.kind).toBe("note");
  });

  it("note with anchor AND alias", () => {
    const result = parseEmbed("note#Sec|Label");
    expect(result.target).toBe("note");
    expect(result.anchor).toBe("Sec");
    expect(result.alias).toBe("Label");
    expect(result.isBlockRef).toBe(false);
  });

  it("classifies .png as image", () => {
    expect(parseEmbed("image.png").kind).toBe("image");
  });

  it("classifies .JPG (uppercase) as image", () => {
    expect(parseEmbed("photo.JPG").kind).toBe("image");
  });

  it("classifies .jpeg as image", () => {
    expect(parseEmbed("photo.jpeg").kind).toBe("image");
  });

  it("classifies .gif as image", () => {
    expect(parseEmbed("anim.gif").kind).toBe("image");
  });

  it("classifies .webp as image", () => {
    expect(parseEmbed("img.webp").kind).toBe("image");
  });

  it("classifies .svg as image", () => {
    expect(parseEmbed("icon.svg").kind).toBe("image");
  });

  it("classifies .pdf as pdf", () => {
    expect(parseEmbed("doc.pdf").kind).toBe("pdf");
  });

  it("classifies .mp4 as av", () => {
    expect(parseEmbed("clip.mp4").kind).toBe("av");
  });

  it("classifies .mp3 as av", () => {
    expect(parseEmbed("audio.mp3").kind).toBe("av");
  });

  it("classifies unknown extension as note", () => {
    expect(parseEmbed("data.csv").kind).toBe("note");
  });

  it("plain .md file classifies as note", () => {
    expect(parseEmbed("page.md").kind).toBe("note");
  });

  it("no extension → note", () => {
    expect(parseEmbed("My Note").kind).toBe("note");
  });
});

describe("EMBED_RE", () => {
  it("matches a simple embed token", () => {
    EMBED_RE.lastIndex = 0;
    const m = EMBED_RE.exec("![[my note]]");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("my note");
  });

  it("does NOT match a plain wiki-link (no leading !)", () => {
    EMBED_RE.lastIndex = 0;
    const m = EMBED_RE.exec("[[my note]]");
    expect(m).toBeNull();
  });

  it("matches embed with anchor", () => {
    EMBED_RE.lastIndex = 0;
    const m = EMBED_RE.exec("![[note#Section]]");
    expect(m).not.toBeNull();
    expect(m![1]).toBe("note#Section");
  });
});
