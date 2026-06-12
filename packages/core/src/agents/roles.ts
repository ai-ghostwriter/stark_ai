export type FridayRoleId = "architect" | "implementer" | "reviewer";

export interface FridayRole {
  id: FridayRoleId;
  title: string;
  purpose: string;
  canModifyCode: boolean;
  requiresApproval: boolean;
}

export const FRIDAY_ROLES: Record<FridayRoleId, FridayRole> = {
  architect: {
    id: "architect",
    title: "Claude Architect",
    purpose: "Analyze requirements and define the implementation plan.",
    canModifyCode: false,
    requiresApproval: true,
  },
  implementer: {
    id: "implementer",
    title: "Codex Implementer",
    purpose: "Apply approved changes with minimal scope.",
    canModifyCode: true,
    requiresApproval: true,
  },
  reviewer: {
    id: "reviewer",
    title: "Claude Reviewer",
    purpose: "Review diffs, regressions, and missing tests.",
    canModifyCode: false,
    requiresApproval: false,
  },
};
