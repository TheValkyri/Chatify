// ─── Chatify — Session Management ───────────────────────────────────────────
// Thin wrapper over auth.ts for backward compatibility.
// The actual auth logic lives in auth.ts (Supabase + demo dual-mode).
//
// This file is kept for existing imports but delegates to the new auth layer.

import type { AuthUser } from "./types";
import { getSessionSync } from "./auth";
import { STORAGE_KEYS } from "./config";

// ─── Legacy Type (kept for backward compat during migration) ────────────────

export type ChatSession = AuthUser;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the current session synchronously.
 * Returns null if not authenticated.
 */
export function getSession(): ChatSession | null {
  return getSessionSync();
}

/**
 * Start a session (demo mode only — production uses Supabase Auth).
 */
export function startSession(session: ChatSession): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
}

/**
 * Clear the current session.
 */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEYS.SESSION);
}
