import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkflowPanel } from "./WorkflowPanel";

const plannedRun = {
  id: "run-1",
  status: "planned",
  error: null,
  plan: {
    workspace: "workspaces/demo",
    request: "analyze this repository",
    kind: "analysis",
    steps: [{ id: "architect", role: "architect", title: "Read the repo", requiresApproval: true }],
  },
  steps: [],
};

describe("WorkflowPanel", () => {
  it("renders controls for starting a workflow", () => {
    render(<WorkflowPanel />);

    expect(screen.getByRole("button", { name: "EXECUTE WORKFLOW" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Request/i)).toHaveValue("analyze this repository");
    expect(screen.getByRole("tablist", { name: "Workflow kind" })).toBeInTheDocument();
  });

  it("posts a workflow request and shows the planned run", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ run: plannedRun }),
      } as Response),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<WorkflowPanel />);
    fireEvent.click(screen.getByRole("button", { name: "EXECUTE WORKFLOW" }));

    await waitFor(() => expect(screen.getByText("workspaces/demo")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/workflow/run",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ request: "analyze this repository", kind: "analysis" }),
      }),
    );
  });
});
