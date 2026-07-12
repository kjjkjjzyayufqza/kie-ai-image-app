import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import { translate } from "@/i18n/translate";

describe("translate", () => {
  it("returns English strings by default keys", () => {
    expect(translate(en, "rooms.newChat")).toBe("New chat");
    expect(translate(en, "chat.textToImage")).toBe("Text to image");
  });

  it("returns Chinese strings for zh dictionary", () => {
    expect(translate(zh, "rooms.newChat")).toBe("新建对话");
    expect(translate(zh, "chat.textToImage")).toBe("文生图");
  });

  it("interpolates values", () => {
    expect(translate(en, "composer.createdTasks", { count: 7 })).toBe(
      "Created 7 image tasks",
    );
    expect(translate(zh, "composer.createdTasks", { count: 7 })).toBe(
      "已创建 7 个图片任务",
    );
  });

  it("supports nested status keys with hyphens", () => {
    expect(translate(en, "queue.status.canceled-local")).toBe("Canceled");
    expect(translate(zh, "queue.status.canceled-local")).toBe("已取消");
  });
});
