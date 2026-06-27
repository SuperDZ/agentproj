import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMock = vi.hoisted(() => ({
  createAgentReview: vi.fn(),
  listAgentReviews: vi.fn(),
  processInitialAgentReviewDispatch: vi.fn()
}));

vi.mock("@/lib/agents/service", () => serviceMock);

describe("/api/projects/[id]/agent-reviews", () => {
  beforeEach(() => {
    vi.resetModules();
    serviceMock.createAgentReview.mockReset();
    serviceMock.listAgentReviews.mockReset();
    serviceMock.processInitialAgentReviewDispatch.mockReset();
  });

  it("dispatches the initial parallel review task immediately after creating the review", async () => {
    serviceMock.createAgentReview.mockResolvedValue({ id: "review_1", status: "queued" });
    serviceMock.processInitialAgentReviewDispatch.mockResolvedValue({
      processed: true,
      action: "succeeded",
      taskId: "task_1",
      status: "succeeded"
    });

    const { POST } = await import("@/app/api/projects/[id]/agent-reviews/route");
    const response = await POST(
      new Request("http://localhost/api/projects/project_1/agent-reviews", {
        method: "POST",
        body: JSON.stringify({ targetType: "codex_pack" })
      }),
      { params: Promise.resolve({ id: "project_1" }) }
    );
    const payload = await response.json();

    expect(serviceMock.createAgentReview).toHaveBeenCalledWith("project_1", { targetType: "codex_pack" });
    expect(serviceMock.processInitialAgentReviewDispatch).toHaveBeenCalledWith("review_1");
    expect(payload.dispatch).toMatchObject({ processed: true, action: "succeeded" });
  });
});
