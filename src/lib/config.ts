// ─── Chatify — Configuration & Demo Mode ────────────────────────────────────
// Central config for environment detection and demo/production mode switching.
//
// DEMO MODE:
//   When no Supabase URL is configured, the app runs in demo mode.
//   All data stays in localStorage, no network calls are made.
//   This is the default for local development without backend.
//
// PRODUCTION MODE:
//   When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set,
//   the app connects to Supabase for auth, storage, and realtime.

// ─── Environment Variables ──────────────────────────────────────────────────

/** Supabase project URL (e.g., https://abc.supabase.co) */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

/** Supabase anon/public key */
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// ─── Demo Mode Detection ────────────────────────────────────────────────────

/**
 * `true` when running without Supabase config.
 * All data operations fall back to localStorage.
 * Use this to branch between real API calls and local mock behavior.
 *
 * @example
 * ```ts
 * if (IS_DEMO_MODE) {
 *   // use localStorage
 * } else {
 *   // call Supabase
 * }
 * ```
 */
// ─── Fail-Fast Production Validation ───────────────────────────────────────

if (import.meta.env.PROD && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
  throw new Error(
    "FATAL: Môi trường Production bắt buộc phải cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY!",
  );
}

export const IS_DEMO_MODE = !SUPABASE_URL || !SUPABASE_ANON_KEY;

// ─── Storage Keys (demo mode) ──────────────────────────────────────────────
// Centralized localStorage keys to avoid typos and duplication.

export const STORAGE_KEYS = {
  SESSION: "chatify.session",
  CONVERSATIONS: "chatify.conversations",
  ACTIVE_ID: "chatify.activeId",
  MESSAGES: "chatify.messagesByConv",
  INVITE_CODES: "chatify.globalInviteCodes",
  THEME: "chatify.theme",
  MODE: "chatify.mode",
  FRIENDS: "chatify.friends",
} as const;

// ─── API Config ─────────────────────────────────────────────────────────────

/** Base URL for custom API routes (if using Edge Functions or custom server) */
export const API_BASE = import.meta.env.VITE_API_URL as string | undefined;

// ─── Feature Flags ──────────────────────────────────────────────────────────
