// ─── Chatify — Supabase Client ──────────────────────────────────────────────
// Initializes the Supabase client for auth, database, storage, and realtime.
// Only created when NOT in demo mode (VITE_SUPABASE_URL is set).

import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, IS_DEMO_MODE } from "./config";

// ─── Client Singleton ───────────────────────────────────────────────────────

let _supabaseBrowser: SupabaseClient | null = null;

/**
 * Returns the Supabase client instance for client-side usage.
 * Throws if called in demo mode or server-side directly.
 */
export function getSupabase(): SupabaseClient {
  if (IS_DEMO_MODE) {
    throw new Error(
      "Supabase client is not available in demo mode. " +
        "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable.",
    );
  }

  if (typeof window !== "undefined") {
    if (!_supabaseBrowser) {
      _supabaseBrowser = createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
    }
    return _supabaseBrowser;
  }

  throw new Error(
    "getSupabase() should not be called directly on the server. Use getSupabaseServer(req) instead.",
  );
}

/**
 * Safe helper — returns null in demo mode instead of throwing.
 */
export function getSupabaseSafe(): SupabaseClient | null {
  if (IS_DEMO_MODE) return null;
  return getSupabase();
}

/**
 * Returns the Supabase client instance for server-side usage with request context.
 */
export function getSupabaseServer(req: Request, resHeaders?: Headers) {
  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookieOptions: {
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
    cookies: {
      getAll() {
        const cookieHeader = req.headers.get("Cookie");
        const cookies: { name: string; value: string }[] = [];
        if (cookieHeader) {
          cookieHeader.split(";").forEach((cookie) => {
            const parts = cookie.split("=");
            const name = parts[0]?.trim();
            const value = parts.slice(1).join("=").trim();
            if (name) cookies.push({ name, value: decodeURIComponent(value) });
          });
        }
        return cookies;
      },
      setAll(cookiesToSet) {
        if (!resHeaders) return;
        cookiesToSet.forEach(({ name, value, options }) => {
          let cookieStr = `${name}=${encodeURIComponent(value)}`;
          if (options.maxAge) cookieStr += `; Max-Age=${options.maxAge}`;
          if (options.domain) cookieStr += `; Domain=${options.domain}`;
          if (options.path) cookieStr += `; Path=${options.path}`;
          if (options.sameSite) cookieStr += `; SameSite=${options.sameSite}`;
          if (options.secure) cookieStr += "; Secure";
          if (options.httpOnly) cookieStr += "; HttpOnly";
          resHeaders.append("Set-Cookie", cookieStr);
        });
      },
    },
  });
}
