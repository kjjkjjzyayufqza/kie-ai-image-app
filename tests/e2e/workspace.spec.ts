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
  await page.goto("/en");
  await page.getByRole("button", { name: "Text to image", exact: true }).click();
  await page.getByLabel("Prompt").fill("Seven studio variations of a ceramic lamp");
  await page.getByLabel("Generation count").fill("7");
  await page.getByRole("button", { name: "Generate 7x" }).click();

  await expect(page.getByTestId("task-card")).toHaveCount(7);
  await expect(page.getByText("7x", { exact: true }).first()).toBeVisible();
});

test("a new room starts with an empty prompt", async ({ page }) => {
  await page.goto("/en");
  await page.getByLabel("Prompt").fill("This must not carry into a new room");
  await page.getByRole("button", { name: "New chat" }).click();

  await expect(page.getByLabel("Prompt")).toHaveValue("");
});

test("a 37x batch requires confirmation and renders all placeholders", async ({
  page,
}) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Text to image", exact: true }).click();
  await page.getByLabel("Prompt").fill("Thirty seven layout studies");
  await page.getByLabel("Generation count").fill("37");
  await page.getByRole("button", { name: "Generate 37x" }).click();

  await expect(page.getByText("Create 37 tasks?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm generate" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(37);
});

test("settings shows official credits separately from browser usage", async ({
  page,
}) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByRole("dialog").getByText("Connection settings")).toBeVisible();
  await expect(page.getByText("Official credits")).toBeVisible();
  await expect(
    page.getByText("Browser-local records only. Not full Kie account history."),
  ).toBeVisible();
});

test("root redirects into a locale path", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(en|zh)(\/)?$/);
});
