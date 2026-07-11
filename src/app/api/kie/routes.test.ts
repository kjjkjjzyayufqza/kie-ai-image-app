import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as createTask } from "@/app/api/kie/tasks/route";
import { POST as queryTask } from "@/app/api/kie/task-status/route";

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
});
