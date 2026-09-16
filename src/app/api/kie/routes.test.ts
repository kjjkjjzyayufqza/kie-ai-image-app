import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as createTask } from "@/app/api/kie/tasks/route";
import { POST as getDownloadUrl } from "@/app/api/kie/download-url/route";
import { POST as queryTask } from "@/app/api/kie/task-status/route";
import { POST as listModels } from "@/app/api/kie/models/route";
import { FALLBACK_IMAGE_COST_LIST, FALLBACK_IMAGE_MODELS } from "@/lib/image-catalog";

const apiKey = "test_key_12345678901234567890";

function makeRequest(path: string, body: unknown, origin = "http://localhost:3000") {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

describe("Kie proxy routes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects an untrusted origin before calling Kie", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createTask(
      makeRequest(
        "/api/kie/tasks",
        {
          model: "gpt-image-2-text-to-image",
          mode: "text-to-image",
          prompt: "test",
          aspectRatio: "auto",
          resolution: "1K",
          inputUrls: [],
        },
        "https://attacker.example",
      ),
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a browser request marked as cross-site", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = makeRequest("/api/kie/tasks", {});
    request.headers.set("Sec-Fetch-Site", "cross-site");

    const response = await createTask(request);

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized JSON body before parsing or proxying it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = makeRequest("/api/kie/tasks", {});
    request.headers.set("Content-Length", "256001");

    const response = await createTask(request);
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error.code).toBe("REQUEST_TOO_LARGE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops reading an oversized body when content length is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = makeRequest("/api/kie/tasks", {
      prompt: "x".repeat(256_001),
    });

    const response = await createTask(request);
    const payload = await response.json();

    expect(response.status).toBe(413);
    expect(payload.error.code).toBe("REQUEST_TOO_LARGE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns live image models and costs from a successful Kie catalog response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        code: 200,
        data: {
          models: [
            {
              model: "flux-2/pro-text-to-image",
              category: "image",
              credits: { "1K": 5, "2K": 9, "4K": 9 },
            },
            { model: "nano-banana-2", type: "image", price: 8 },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await listModels(makeRequest("/api/kie/models", {}));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe("live");
    const flux = payload.data.models.find(
      (model: { id: string }) => model.id === "flux-2/pro-text-to-image",
    );
    const banana = payload.data.models.find(
      (model: { id: string }) => model.id === "nano-banana-2",
    );
    expect(flux.credits["1K"]).toBe(5);
    expect(payload.data.costs["flux-2/pro-text-to-image"]["2K"]).toBe(9);
    expect(banana.credits["1K"]).toBe(8);
  });

  it("returns the maintained fallback model list and cost list when Kie catalog calls fail", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await listModels(makeRequest("/api/kie/models", {}));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe("fallback");
    expect(payload.data.models.map((model: { id: string }) => model.id)).toEqual(
      FALLBACK_IMAGE_MODELS.map((model) => model.id),
    );
    expect(payload.data.costs["gpt-image-2-text-to-image"]).toEqual(
      FALLBACK_IMAGE_COST_LIST["gpt-image-2-text-to-image"],
    );
  });

  it("forwards a selected non-GPT catalog model id on createTask", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ code: 200, msg: "success", data: { taskId: "task_flux" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await createTask(
      makeRequest("/api/kie/tasks", {
        model: "flux-2/pro-text-to-image",
        mode: "text-to-image",
        prompt: "A white ceramic object",
        aspectRatio: "1:1",
        resolution: "1K",
        inputUrls: [],
      }),
    );

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("flux-2/pro-text-to-image");
    expect(body.model).not.toBe("gpt-image-2-text-to-image");
  });

  it("rejects an illegal model id on createTask instead of substituting GPT Image 2", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await createTask(
      makeRequest("/api/kie/tasks", {
        model: "totally-unknown-model",
        mode: "text-to-image",
        prompt: "Nope",
        aspectRatio: "1:1",
        resolution: "1K",
        inputUrls: [],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards only the validated GPT Image 2 payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ code: 200, msg: "success", data: { taskId: "task_123" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await createTask(
      makeRequest("/api/kie/tasks", {
        model: "gpt-image-2-text-to-image",
        mode: "text-to-image",
        prompt: "A white ceramic object",
        aspectRatio: "1:1",
        resolution: "2K",
        inputUrls: [],
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.kie.ai/api/v1/jobs/createTask");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "gpt-image-2-text-to-image",
      input: {
        prompt: "A white ceramic object",
        aspect_ratio: "1:1",
        resolution: "2K",
      },
    });
  });

  it("stops reading an oversized response from Kie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("x".repeat(1_000_001)));
    vi.stubGlobal("fetch", fetchMock);

    const response = await createTask(
      makeRequest("/api/kie/tasks", {
        model: "gpt-image-2-text-to-image",
        mode: "text-to-image",
        prompt: "test",
        aspectRatio: "auto",
        resolution: "1K",
        inputUrls: [],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe("UPSTREAM_RESPONSE_TOO_LARGE");
  });

  it("normalizes allowed and unknown result hosts without fetching images", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        code: 200,
        data: {
          taskId: "task_123",
          state: "success",
          resultJson: JSON.stringify({
            resultUrls: [
              "https://tempfile.redpandaai.co/generated.png",
              "https://cdn.example.com/generated.png",
            ],
          }),
          creditsConsumed: 5,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await queryTask(
      makeRequest("/api/kie/task-status", { taskId: "task_123" }),
    );
    const payload = await response.json();

    expect(payload.data.resultUrls).toEqual([
      {
        url: "https://tempfile.redpandaai.co/generated.png",
        isRenderable: true,
      },
      { url: "https://cdn.example.com/generated.png", isRenderable: false },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects a download URL that is not safe HTTPS", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        code: 200,
        data: "http://phishing.example/download.png",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getDownloadUrl(
      makeRequest("/api/kie/download-url", {
        url: "https://tempfile.redpandaai.co/generated.png",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe("DOWNLOAD_URL_INVALID");
  });

  it("accepts signed temporary download hosts outside the render allowlist", async () => {
    const signedUrl =
      "https://cdn.example.r2.cloudflarestorage.com/v/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        code: 200,
        data: signedUrl,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getDownloadUrl(
      makeRequest("/api/kie/download-url", {
        url: "https://tempfile.redpandaai.co/generated.png",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.url).toBe(signedUrl);
  });

  it("accepts object-shaped download-url responses", async () => {
    const signedUrl =
      "https://assets.example.com/download/image.png?token=abc";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        code: 200,
        data: { url: signedUrl },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getDownloadUrl(
      makeRequest("/api/kie/download-url", {
        url: "https://tempfile.aiquickdraw.com/generated.png",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.url).toBe(signedUrl);
  });
});
