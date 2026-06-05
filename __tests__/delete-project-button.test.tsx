// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/dashboard/projects/actions", () => ({
  deleteProject: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  redirect: vi.fn()
}));

import { DeleteProjectButton } from "@/app/dashboard/projects/delete-project-button";
import { deleteProject } from "@/app/dashboard/projects/actions";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("DeleteProjectButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(false);
  });

  it("renders Eliminar button", () => {
    render(<DeleteProjectButton projectId={VALID_UUID} />);
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy();
  });

  it("shows confirm dialog when clicked", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DeleteProjectButton projectId={VALID_UUID} />);
    fireEvent.click(screen.getByRole("button"));
    expect(confirmSpy).toHaveBeenCalledOnce();
  });

  it("does not call deleteProject when user cancels confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DeleteProjectButton projectId={VALID_UUID} />);
    fireEvent.click(screen.getByRole("button"));
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("calls deleteProject with correct projectId when user confirms", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DeleteProjectButton projectId={VALID_UUID} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledTimes(1);
    });

    const formData = vi.mocked(deleteProject).mock.calls[0][0] as FormData;
    expect(formData.get("projectId")).toBe(VALID_UUID);
  });

  it("button is disabled while deletion is pending", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteProject).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<DeleteProjectButton projectId={VALID_UUID} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveProperty("disabled", true);
    });
  });
});
