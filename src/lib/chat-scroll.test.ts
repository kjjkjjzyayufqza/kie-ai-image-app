import { describe, expect, it } from "vitest";

import { isNearChatBottom } from "@/lib/chat-scroll";

describe("isNearChatBottom", () => {
  it("treats a short thread as already at the bottom", () => {
    expect(
      isNearChatBottom({ scrollTop: 0, scrollHeight: 400, clientHeight: 800 }),
    ).toBe(true);
  });

  it("stays pinned when the viewport is within the bottom threshold", () => {
    expect(
      isNearChatBottom({
        scrollTop: 910,
        scrollHeight: 1800,
        clientHeight: 800,
      }),
    ).toBe(true);
  });

  it("releases the pin after the user scrolls up into history", () => {
    expect(
      isNearChatBottom({
        scrollTop: 0,
        scrollHeight: 1800,
        clientHeight: 800,
      }),
    ).toBe(false);
  });
});
