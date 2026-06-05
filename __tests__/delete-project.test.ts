import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`REDIRECT:${url}`), {
      digest: `NEXT_REDIRECT;replace;${url};303;`
    });
  })
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn()
}));

import { requireUser } from "@/lib/auth";
import { deleteProject } from "@/app/dashboard/projects/actions";

const mockRequireUser = vi.mocked(requireUser);

function makeSupabase({
  findResult = { data: null as { id: string } | null, error: null as object | null },
  deleteResult = { error: null as object | null }
} = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(findResult)
            })
          })
        })
      }),
      delete: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => Promise.resolve(deleteResult)
          })
        })
      })
    })
  };
}

function formDataWith(projectId: string) {
  const fd = new FormData();
  fd.append("projectId", projectId);
  return fd;
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("deleteProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to error when projectId is not a valid UUID", async () => {
    await expect(deleteProject(formDataWith("not-a-uuid"))).rejects.toThrow(
      "REDIRECT:/dashboard/projects?error=invalid_project_id"
    );
    expect(mockRequireUser).not.toHaveBeenCalled();
  });

  it("redirects to error when projectId is missing", async () => {
    const fd = new FormData();
    await expect(deleteProject(fd)).rejects.toThrow(
      "REDIRECT:/dashboard/projects?error=invalid_project_id"
    );
  });

  it("redirects to error when project is not found (not owned or not archived)", async () => {
    mockRequireUser.mockResolvedValue({
      supabase: makeSupabase({ findResult: { data: null, error: null } }) as any,
      user: { id: "user-123" } as any
    });

    await expect(deleteProject(formDataWith(VALID_UUID))).rejects.toThrow(
      "REDIRECT:/dashboard/projects?error=project_delete_failed"
    );
  });

  it("redirects to error when Supabase find query fails", async () => {
    mockRequireUser.mockResolvedValue({
      supabase: makeSupabase({
        findResult: { data: null, error: { message: "RLS policy violation" } }
      }) as any,
      user: { id: "user-123" } as any
    });

    await expect(deleteProject(formDataWith(VALID_UUID))).rejects.toThrow(
      "REDIRECT:/dashboard/projects?error=project_delete_failed"
    );
  });

  it("redirects to error when Supabase delete operation fails", async () => {
    mockRequireUser.mockResolvedValue({
      supabase: makeSupabase({
        findResult: { data: { id: VALID_UUID }, error: null },
        deleteResult: { error: { message: "DB constraint error" } }
      }) as any,
      user: { id: "user-123" } as any
    });

    await expect(deleteProject(formDataWith(VALID_UUID))).rejects.toThrow(
      "REDIRECT:/dashboard/projects?error=project_delete_failed"
    );
  });

  it("redirects to success when project is found and deleted", async () => {
    mockRequireUser.mockResolvedValue({
      supabase: makeSupabase({
        findResult: { data: { id: VALID_UUID }, error: null },
        deleteResult: { error: null }
      }) as any,
      user: { id: "user-123" } as any
    });

    await expect(deleteProject(formDataWith(VALID_UUID))).rejects.toThrow(
      "REDIRECT:/dashboard/projects?success=project_deleted"
    );
  });
});
