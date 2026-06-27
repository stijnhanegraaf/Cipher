import { describe, it, expect } from "vitest";
import { toForceGraphData } from "./force-graph-data";
import type { Graph, GraphNode } from "@/lib/vault-graph";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  opts: Partial<Pick<GraphNode, "backlinks" | "outlinks" | "tag" | "tags" | "title" | "folder" | "mtime">> = {}
): GraphNode {
  return {
    id,
    title: opts.title ?? id,
    folder: opts.folder ?? "",
    backlinks: opts.backlinks ?? 0,
    outlinks: opts.outlinks ?? 0,
    mtime: opts.mtime ?? 0,
    tags: opts.tags ?? [],
    tag: opts.tag ?? "",
  };
}

function makeGraph(
  nodes: GraphNode[],
  edges: Array<{ source: string; target: string }>
): Graph {
  return { nodes, edges, folders: [] };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("toForceGraphData", () => {
  it("maps node count correctly", () => {
    const g = makeGraph([makeNode("a.md"), makeNode("b.md"), makeNode("c.md")], []);
    const { nodes } = toForceGraphData(g);
    expect(nodes).toHaveLength(3);
  });

  it("maps link count correctly", () => {
    const g = makeGraph(
      [makeNode("a.md"), makeNode("b.md")],
      [{ source: "a.md", target: "b.md" }]
    );
    const { links } = toForceGraphData(g);
    expect(links).toHaveLength(1);
  });

  it("preserves node id and path (both equal the vault path)", () => {
    const g = makeGraph([makeNode("wiki/entities/foo.md")], []);
    const { nodes } = toForceGraphData(g);
    expect(nodes[0].id).toBe("wiki/entities/foo.md");
    expect(nodes[0].path).toBe("wiki/entities/foo.md");
  });

  it("link source and target are string ids", () => {
    const g = makeGraph(
      [makeNode("a.md"), makeNode("b.md")],
      [{ source: "a.md", target: "b.md" }]
    );
    const { links } = toForceGraphData(g);
    expect(links[0].source).toBe("a.md");
    expect(links[0].target).toBe("b.md");
  });

  it("degree = node.backlinks + outbound count from edges", () => {
    // a.md has backlinks=2, two outgoing edges → degree 4
    // c.md has backlinks=1, one outgoing edge   → degree 2
    // b.md has backlinks=0, no outgoing edges   → degree 0
    const nodes = [
      makeNode("a.md", { backlinks: 2 }),
      makeNode("b.md", { backlinks: 0 }),
      makeNode("c.md", { backlinks: 1 }),
    ];
    const edges = [
      { source: "a.md", target: "b.md" },
      { source: "a.md", target: "c.md" },
      { source: "c.md", target: "b.md" },
    ];
    const { nodes: out } = toForceGraphData(makeGraph(nodes, edges));
    const byId = Object.fromEntries(out.map((n) => [n.id, n]));

    expect(byId["a.md"].degree).toBe(4); // 2 inbound + 2 outbound
    expect(byId["c.md"].degree).toBe(2); // 1 inbound + 1 outbound
    expect(byId["b.md"].degree).toBe(0); // 0 inbound + 0 outbound
  });

  it("orphan node (no edges) is preserved with degree 0", () => {
    const g = makeGraph([makeNode("a.md"), makeNode("orphan.md")], []);
    const { nodes } = toForceGraphData(g);
    const orphan = nodes.find((n) => n.id === "orphan.md");
    expect(orphan).toBeDefined();
    expect(orphan?.degree).toBe(0);
  });

  it("degree is 0 for isolated node with no edges and backlinks=0", () => {
    const g = makeGraph([makeNode("isolated.md", { backlinks: 0 })], []);
    const { nodes } = toForceGraphData(g);
    expect(nodes[0].degree).toBe(0);
  });

  it("preserves tag and tags fields", () => {
    const g = makeGraph(
      [makeNode("a.md", { tag: "idea", tags: ["idea", "project"] })],
      []
    );
    const { nodes } = toForceGraphData(g);
    expect(nodes[0].tag).toBe("idea");
    expect(nodes[0].tags).toEqual(["idea", "project"]);
  });

  it("preserves title field", () => {
    const g = makeGraph([makeNode("a.md", { title: "My Note" })], []);
    const { nodes } = toForceGraphData(g);
    expect(nodes[0].title).toBe("My Note");
  });

  it("empty graph returns empty nodes and links", () => {
    const g = makeGraph([], []);
    const result = toForceGraphData(g);
    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
  });

  it("hub node with many outgoing edges has correct degree", () => {
    // Hub links to 5 others, and has 3 inbound links → degree 8
    const hub = makeNode("hub.md", { backlinks: 3 });
    const leaves = [1, 2, 3, 4, 5].map((i) => makeNode(`leaf-${i}.md`));
    const edges = leaves.map((l) => ({ source: "hub.md", target: l.id }));
    const { nodes } = toForceGraphData(makeGraph([hub, ...leaves], edges));
    const hubOut = nodes.find((n) => n.id === "hub.md");
    expect(hubOut?.degree).toBe(8); // 3 inbound + 5 outbound
  });

  it("node with only inbound links has degree = backlinks", () => {
    const g = makeGraph(
      [makeNode("a.md"), makeNode("b.md", { backlinks: 3 })],
      [
        { source: "a.md", target: "b.md" },
        { source: "a.md", target: "b.md" }, // duplicate — in real graph deduped, but adapter counts as-is
      ]
    );
    // b.md: backlinks=3 (from GraphNode), outbound=0 edges sourced from b.md → degree=3
    const { nodes } = toForceGraphData(g);
    const b = nodes.find((n) => n.id === "b.md");
    expect(b?.degree).toBe(3);
  });

  it("does not mutate the input graph", () => {
    const nodes = [makeNode("a.md"), makeNode("b.md")];
    const edges = [{ source: "a.md", target: "b.md" }];
    const g = makeGraph([...nodes], [...edges]);
    toForceGraphData(g);
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(1);
  });
});
