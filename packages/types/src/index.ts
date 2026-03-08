// Shared DTOs and API response shapes for @velo/types
// Populated in subsequent plans

export type PlanTier = "free" | "starter" | "growth" | "enterprise"

export type WorkspaceRole = "admin" | "editor" | "viewer"

export interface ApiError {
  error: string
  code?: string
}
