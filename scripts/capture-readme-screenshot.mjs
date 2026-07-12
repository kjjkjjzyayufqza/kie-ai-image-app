import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(root, "..", "docs", "kie-image-workspace.png");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

await page.addInitScript(() => {
  localStorage.setItem(
    "kie-ai-workspace.api-key.v1",
    "demo_key_12345678901234567890",
  );
});

await page.route("**/api/kie/credits", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      data: { credits: 12840, latencyMs: 42, checkedAt: Date.now() },
    }),
  }),
);
await page.route("**/api/kie/tasks", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { taskId: "task_demo_1" } }),
  }),
);
await page.route("**/api/kie/task-status", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      data: {
        remoteTaskId: "task_demo_1",
        state: "generating",
        resultUrls: [],
      },
    }),
  }),
);

await page.goto("http://127.0.0.1:3100/en", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Text to image", exact: true }).click();
await page
  .getByLabel("Prompt")
  .fill(
    "Soft studio product photo of a ceramic lamp on oak, warm daylight, shallow depth of field",
  );
await page.getByLabel("Generation count").fill("4");
await page.getByRole("button", { name: "Generate 4x" }).click();
await page.getByTestId("task-card").first().waitFor({ state: "visible" });
await page.waitForTimeout(400);

await page.screenshot({ path: outPath, fullPage: false });
await browser.close();
console.log("Wrote", outPath);
