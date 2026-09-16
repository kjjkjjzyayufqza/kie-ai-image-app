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
  await page.route("**/api/kie/models", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          source: "fallback",
          models: [
            {
              id: "gpt-image-2-text-to-image",
              label: "GPT Image 2",
              family: "gpt-image",
              mode: "text-to-image",
              imageField: null,
              resolutionField: "resolution",
              supportedAspectRatios: ["auto", "1:1", "16:9"],
              supportedResolutions: ["1K", "2K", "4K"],
              credits: { "1K": 6, "2K": 10, "4K": 16 },
            },
            {
              id: "flux-2/pro-text-to-image",
              label: "Flux-2 Pro",
              family: "flux-2",
              mode: "text-to-image",
              imageField: null,
              resolutionField: "resolution",
              supportedAspectRatios: ["1:1", "16:9"],
              supportedResolutions: ["1K", "2K"],
              credits: { "1K": 5, "2K": 8, "4K": 8 },
            },
            {
              id: "gpt-image-2-image-to-image",
              label: "GPT Image 2 Edit",
              family: "gpt-image",
              mode: "image-to-image",
              imageField: "input_urls",
              resolutionField: "resolution",
              supportedAspectRatios: ["auto", "1:1", "16:9"],
              supportedResolutions: ["1K", "2K", "4K"],
              credits: { "1K": 6, "2K": 10, "4K": 16 },
            },
          ],
          costs: {
            "gpt-image-2-text-to-image": { "1K": 6, "2K": 10, "4K": 16 },
            "flux-2/pro-text-to-image": { "1K": 5, "2K": 8, "4K": 8 },
            "gpt-image-2-image-to-image": { "1K": 6, "2K": 10, "4K": 16 },
          },
        },
      }),
    }),
  );
});

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

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

test("model picker is usable and canvas layout holds generated objects", async ({
  page,
}) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Text to image", exact: true }).click();
  await expect(page.getByTestId("model-picker")).toBeVisible();
  await page.getByTestId("model-picker").click();
  await page.getByRole("option", { name: /Flux-2 Pro/ }).click();

  await page.getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("canvas-surface")).toBeVisible();

  await page.getByLabel("Prompt").fill("A canvas-first studio still");
  await page.getByLabel("Generation count").fill("1");
  await page.getByRole("button", { name: "Generate 1x" }).click();
  await expect(page.getByTestId("canvas-node")).toHaveCount(1);
  await page.screenshot({ path: "test-results/canvas.png", fullPage: true });
});

test("selecting a reference image places it on the canvas", async ({ page }) => {
  await page.route("https://kieai.redpandaai.co/api/file-stream-upload", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          downloadUrl: "https://tempfile.redpandaai.co/reference.png",
          fileSize: 70,
          mimeType: "image/png",
        },
      }),
    }),
  );

  await page.goto("/en");
  await page.getByRole("button", { name: "Canvas" }).click();
  await expect(page.getByTestId("canvas-surface")).toBeVisible();
  await page.getByRole("button", { name: "Image to image", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.getByTestId("canvas-node")).toHaveCount(1);
  await expect(page.getByTestId("canvas-node")).toHaveAttribute(
    "data-kind",
    "reference",
  );

  await page.locator('input[type="file"]').setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await expect(page.getByTestId("canvas-node")).toHaveCount(1);
});

test("gallery opens a stored image without a live Kie URL", async ({ page }) => {
  await page.route("**/api/kie/task-status", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          remoteTaskId: "task_stored",
          state: "success",
          resultUrls: [
            {
              url: "https://tempfile.redpandaai.co/generated.png",
              isRenderable: true,
            },
          ],
          creditsConsumed: 6,
          completedAt: Date.now(),
        },
      }),
    }),
  );
  await page.route("**/api/kie/download-file", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: PNG_1X1,
    }),
  );

  await page.goto("/en");
  await page.getByRole("button", { name: "Text to image", exact: true }).click();
  await page.getByLabel("Prompt").fill("Persist this image locally");
  await page.getByLabel("Generation count").fill("1");
  await page.getByRole("button", { name: "Generate 1x" }).click();
  await expect(page.getByTestId("task-card")).toHaveCount(1);
  await expect(page.locator("img[data-local-asset='true']")).toBeVisible({
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Gallery" }).click();
  await expect(page.locator("img[data-local-asset='true']")).toBeVisible();
});
