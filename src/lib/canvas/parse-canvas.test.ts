import { describe, it, expect } from "vitest";
import { parseCanvas, edgeAnchor } from "./parse-canvas";
import type { CanvasNodeBase } from "./parse-canvas";

// ─── Helper for concise node fixtures ──────────────────────────────────────
function textNode(overrides?: Record<string, unknown>) {
  return {
    type: "text",
    id: "n1",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    text: "hello",
    ...overrides,
  };
}

// ─── Garbage tolerance ──────────────────────────────────────────────────────
describe("parseCanvas — garbage never throws", () => {
  it("handles null input", () => {
    expect(parseCanvas(null)).toEqual({ nodes: [], edges: [] });
  });

  it("handles non-JSON string", () => {
    expect(parseCanvas("nope")).toEqual({ nodes: [], edges: [] });
  });

  it("handles empty object", () => {
    expect(parseCanvas({})).toEqual({ nodes: [], edges: [] });
  });

  it("handles top-level array", () => {
    expect(parseCanvas([])).toEqual({ nodes: [], edges: [] });
  });

  it("handles nodes:null", () => {
    expect(parseCanvas('{"nodes":null}')).toEqual({ nodes: [], edges: [] });
  });

  it("handles undefined input", () => {
    expect(parseCanvas(undefined)).toEqual({ nodes: [], edges: [] });
  });
});

// ─── Text nodes ─────────────────────────────────────────────────────────────
describe("parseCanvas — text node", () => {
  it("preserves geometry and text", () => {
    const result = parseCanvas({
      nodes: [{ type: "text", id: "t1", x: 10, y: 20, width: 300, height: 150, text: "Hello **world**" }],
    });
    expect(result.nodes).toHaveLength(1);
    const n = result.nodes[0];
    expect(n.type).toBe("text");
    if (n.type === "text") {
      expect(n.id).toBe("t1");
      expect(n.x).toBe(10);
      expect(n.y).toBe(20);
      expect(n.width).toBe(300);
      expect(n.height).toBe(150);
      expect(n.text).toBe("Hello **world**");
    }
  });
});

// ─── File nodes ─────────────────────────────────────────────────────────────
describe("parseCanvas — file node", () => {
  it("splits file#subpath correctly", () => {
    const result = parseCanvas({
      nodes: [{ type: "file", id: "f1", x: 0, y: 0, file: "folder/note.md#Heading One" }],
    });
    expect(result.nodes).toHaveLength(1);
    const n = result.nodes[0];
    if (n.type === "file") {
      expect(n.file).toBe("folder/note.md");
      expect(n.subpath).toBe("#Heading One");
    } else {
      expect.fail("expected file node");
    }
  });

  it("sets subpath null when no hash", () => {
    const result = parseCanvas({
      nodes: [{ type: "file", id: "f2", x: 0, y: 0, file: "folder/note.md" }],
    });
    const n = result.nodes[0];
    if (n.type === "file") {
      expect(n.subpath).toBeNull();
    } else {
      expect.fail("expected file node");
    }
  });
});

// ─── Link nodes ─────────────────────────────────────────────────────────────
describe("parseCanvas — link node", () => {
  it("preserves url", () => {
    const result = parseCanvas({
      nodes: [{ type: "link", id: "l1", x: 0, y: 0, url: "https://example.com" }],
    });
    const n = result.nodes[0];
    if (n.type === "link") {
      expect(n.url).toBe("https://example.com");
    } else {
      expect.fail("expected link node");
    }
  });
});

// ─── Group nodes ─────────────────────────────────────────────────────────────
describe("parseCanvas — group node", () => {
  it("preserves label when present", () => {
    const result = parseCanvas({
      nodes: [{ type: "group", id: "g1", x: 0, y: 0, label: "My Group" }],
    });
    const n = result.nodes[0];
    if (n.type === "group") {
      expect(n.label).toBe("My Group");
    } else {
      expect.fail("expected group node");
    }
  });

  it("sets label null when absent", () => {
    const result = parseCanvas({
      nodes: [{ type: "group", id: "g2", x: 0, y: 0 }],
    });
    const n = result.nodes[0];
    if (n.type === "group") {
      expect(n.label).toBeNull();
    } else {
      expect.fail("expected group node");
    }
  });
});

// ─── Unknown node type ──────────────────────────────────────────────────────
describe("parseCanvas — unknown node type", () => {
  it("preserves unknown type with raw data", () => {
    const result = parseCanvas({
      nodes: [{ type: "custom-thing", id: "u1", x: 5, y: 5, extraField: 42 }],
    });
    expect(result.nodes).toHaveLength(1);
    const n = result.nodes[0];
    expect(n.type).toBe("unknown");
    if (n.type === "unknown") {
      expect(n.raw.extraField).toBe(42);
    }
  });
});

// ─── Node validation / dropping ─────────────────────────────────────────────
describe("parseCanvas — node dropping", () => {
  it("drops node missing id", () => {
    const result = parseCanvas({
      nodes: [{ type: "text", x: 0, y: 0, text: "no id" }],
    });
    expect(result.nodes).toHaveLength(0);
  });

  it("drops node with empty-string id", () => {
    const result = parseCanvas({
      nodes: [{ type: "text", id: "", x: 0, y: 0, text: "empty id" }],
    });
    expect(result.nodes).toHaveLength(0);
  });

  it("drops node with non-finite x", () => {
    const result = parseCanvas({
      nodes: [{ type: "text", id: "bad-x", x: NaN, y: 0, text: "bad x" }],
    });
    expect(result.nodes).toHaveLength(0);
  });

  it("drops node with non-finite y (Infinity)", () => {
    const result = parseCanvas({
      nodes: [{ type: "text", id: "bad-y", x: 0, y: Infinity, text: "bad y" }],
    });
    expect(result.nodes).toHaveLength(0);
  });
});

// ─── Width/height defaults ───────────────────────────────────────────────────
describe("parseCanvas — width/height defaults", () => {
  it("keeps node with missing width and height, applying defaults", () => {
    const result = parseCanvas({
      nodes: [{ type: "text", id: "n1", x: 0, y: 0, text: "hi" }],
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].width).toBe(250);
    expect(result.nodes[0].height).toBe(60);
  });
});

// ─── Color normalization ─────────────────────────────────────────────────────
describe("parseCanvas — color normalization", () => {
  it('maps "4" to preset 4', () => {
    const result = parseCanvas({ nodes: [textNode({ color: "4" })] });
    expect(result.nodes[0].color).toEqual({ kind: "preset", preset: 4 });
  });

  it('maps "#ff8800" to hex', () => {
    const result = parseCanvas({ nodes: [textNode({ color: "#ff8800" })] });
    expect(result.nodes[0].color).toEqual({ kind: "hex", hex: "#ff8800" });
  });

  it('maps "#ABC" (3-char uppercase) to hex', () => {
    const result = parseCanvas({ nodes: [textNode({ color: "#ABC" })] });
    expect(result.nodes[0].color).toEqual({ kind: "hex", hex: "#ABC" });
  });

  it('maps "9" (out of range preset) to null', () => {
    const result = parseCanvas({ nodes: [textNode({ color: "9" })] });
    expect(result.nodes[0].color).toBeNull();
  });

  it('maps "red" (named color) to null', () => {
    const result = parseCanvas({ nodes: [textNode({ color: "red" })] });
    expect(result.nodes[0].color).toBeNull();
  });

  it("maps missing color to null", () => {
    const result = parseCanvas({ nodes: [textNode()] });
    expect(result.nodes[0].color).toBeNull();
  });
});

// ─── Edges ──────────────────────────────────────────────────────────────────
describe("parseCanvas — edges", () => {
  const twoNodes = [
    { type: "text", id: "a", x: 0, y: 0, text: "A" },
    { type: "text", id: "b", x: 400, y: 0, text: "B" },
  ];

  it("applies edge defaults: fromEnd=none, toEnd=arrow", () => {
    const result = parseCanvas({
      nodes: twoNodes,
      edges: [{ id: "e1", fromNode: "a", toNode: "b" }],
    });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].fromEnd).toBe("none");
    expect(result.edges[0].toEnd).toBe("arrow");
  });

  it("parses explicit sides", () => {
    const result = parseCanvas({
      nodes: twoNodes,
      edges: [{ id: "e1", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left" }],
    });
    expect(result.edges[0].fromSide).toBe("right");
    expect(result.edges[0].toSide).toBe("left");
  });

  it("drops dangling edge referencing absent node", () => {
    const result = parseCanvas({
      nodes: [{ type: "text", id: "a", x: 0, y: 0, text: "A" }],
      edges: [{ id: "e1", fromNode: "a", toNode: "missing" }],
    });
    expect(result.edges).toHaveLength(0);
  });

  it("drops edge with missing fromNode", () => {
    const result = parseCanvas({
      nodes: twoNodes,
      edges: [{ id: "e1", toNode: "b" }],
    });
    expect(result.edges).toHaveLength(0);
  });
});

// ─── Raw JSON string path ────────────────────────────────────────────────────
describe("parseCanvas — raw string input", () => {
  it("parses a raw JSON string", () => {
    const raw = JSON.stringify({
      nodes: [{ type: "text", id: "s1", x: 1, y: 2, text: "from string" }],
    });
    const result = parseCanvas(raw);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("s1");
  });
});

// ─── edgeAnchor ─────────────────────────────────────────────────────────────
describe("edgeAnchor", () => {
  const node: CanvasNodeBase = {
    id: "n",
    x: 100,
    y: 200,
    width: 200,
    height: 100,
    color: null,
  };

  it("top side: center-x, top-y", () => {
    const other: CanvasNodeBase = { id: "o", x: 0, y: 0, width: 10, height: 10, color: null };
    expect(edgeAnchor(node, "top", other)).toEqual({ x: 200, y: 200 });
  });

  it("bottom side: center-x, bottom-y", () => {
    const other: CanvasNodeBase = { id: "o", x: 0, y: 0, width: 10, height: 10, color: null };
    expect(edgeAnchor(node, "bottom", other)).toEqual({ x: 200, y: 300 });
  });

  it("left side: left-x, center-y", () => {
    const other: CanvasNodeBase = { id: "o", x: 0, y: 0, width: 10, height: 10, color: null };
    expect(edgeAnchor(node, "left", other)).toEqual({ x: 100, y: 250 });
  });

  it("right side: right-x, center-y", () => {
    const other: CanvasNodeBase = { id: "o", x: 0, y: 0, width: 10, height: 10, color: null };
    expect(edgeAnchor(node, "right", other)).toEqual({ x: 300, y: 250 });
  });

  it("null side: auto-picks right when other is to the right", () => {
    // node center is at (200, 250); other center is at (600, 250) — purely to the right
    const other: CanvasNodeBase = { id: "o", x: 500, y: 200, width: 200, height: 100, color: null };
    expect(edgeAnchor(node, null, other)).toEqual({ x: 300, y: 250 });
  });

  it("null side: auto-picks left when other is to the left", () => {
    const other: CanvasNodeBase = { id: "o", x: -200, y: 200, width: 100, height: 100, color: null };
    expect(edgeAnchor(node, null, other)).toEqual({ x: 100, y: 250 });
  });

  it("null side: auto-picks bottom when other is below", () => {
    const other: CanvasNodeBase = { id: "o", x: 200, y: 500, width: 100, height: 100, color: null };
    expect(edgeAnchor(node, null, other)).toEqual({ x: 200, y: 300 });
  });

  it("null side: auto-picks top when other is above", () => {
    const other: CanvasNodeBase = { id: "o", x: 200, y: 0, width: 100, height: 100, color: null };
    expect(edgeAnchor(node, null, other)).toEqual({ x: 200, y: 200 });
  });
});
