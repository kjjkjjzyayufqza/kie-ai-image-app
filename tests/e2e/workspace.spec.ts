import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "kie-ai-workspace.api-key.v1",
      "test_key_12345678901234567890",
    );
  });
  let taskNumber = 0;
  await page.route("**/api/kie/credits", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { credits: 1234, latencyMs: 18, checkedAt: Date.now() },
      }),
    }),
  );
  await page.route("**/api/kie/tasks", (route) => {
    taskNumber += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { taskId: `task_${taskNumber}` } }),
    });
  });
  await page.route("**/api/kie/task-status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          remoteTaskId: "task_mock",
          state: "generating",
          resultUrls: [],
        },
      }),
    }),
  );
});

test("custom 7x batch renders seven placeholders immediately", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Prompt").fill("Seven studio variations of a ceramic lamp");
  await page.getByLabel("生成数量").fill("7");
  await page.getByRole("button", { name: "生成 7x" }).click();

  await expect(page.getByTestId("task-card")).toHaveCount(7);
  await expect(page.getByText("7x", { exact: true }).first()).toBeVisible();
});

test("a new room starts with an empty prompt", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Prompt").fill("This must not carry into a new room");
  await page.getByRole("button", { name: "新建对话" }).click();

  await expect(page.getByLabel("Prompt")).toHaveValue("");
});

test("a 37x batch requires confirmation and renders all placeholders", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Prompt").fill("Thirty seven layout studies");
  await page.getByLabel("生成数量").fill("37");
  await page.getByRole("button", { name: "生成 37x" }).click();

  await expect(page.getByText("确认创建 37 个任务？")).toBeVisible();
  await page.getByRole("button", { name: "确认生成" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(37);
});

test("settings shows official credits separately from browser usage", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();

  await expect(page.getByRole("dialog").getByText("连接设置")).toBeVisible();
  await expect(page.getByText("官方 credits")).toBeVisible();
  await expect(
    page.getByText("以上为当前浏览器记录，不代表 Kie 全账号历史。"),
  ).toBeVisible();
});
