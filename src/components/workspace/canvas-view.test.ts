import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("canvas-view pointer persist", () => {
  it("persists only through persistLive, not on pointermove", () => {
    const source = readFileSync(
      path.join(__dirname, "canvas-view.tsx"),
      "utf8",
    );
    const moveStart = source.indexOf("const onPointerMove");
    const moveEnd = source.indexOf("const onPointerUp");
    const moveBlock = source.slice(moveStart, moveEnd);
    const downStart = source.indexOf("const onPointerDown");
    const downBlock = source.slice(downStart, moveStart);

    expect(source).toContain("createLiveCanvasBuffer");
    expect(source).toContain("liveRef.current.commit");
    expect(downBlock).not.toContain("saveCanvasGraph");
    expect(moveBlock).not.toContain("saveCanvasGraph");
    expect(source).toMatch(/onPointerUp[\s\S]*persistLive\(\)/);
  });
});
