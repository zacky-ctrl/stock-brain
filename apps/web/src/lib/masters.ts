/**
 * Shared types for master data server actions.
 * ActionState is the return type for every master insert action.
 */
export type ActionState =
  | { error: string }
  | { success: string }
  | null
