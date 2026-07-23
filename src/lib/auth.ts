// ─── Chatify — Auth Layer ───────────────────────────────────────────────────
// Handles authentication via Supabase Auth in production mode,
// and falls back to localStorage-based session in demo mode.

import { IS_DEMO_MODE, STORAGE_KEYS } from "./config";
import { getSupabase, getSupabaseServer } from "./supabase";
import type { AuthUser } from "./types";
import { createServerFn } from "@tanstack/react-start";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AuthResponse = {
  user: AuthUser;
  session: { accessToken: string; refreshToken: string } | null;
};

export type AuthError = {
  message: string;
  status?: number;
};

async function fetchProfileFromDb(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  fallback: { name: string; email: string; username: string; avatar: string },
): Promise<AuthUser> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, username, avatar, phone")
    .eq("id", userId)
    .single();

  if (data) {
    return {
      id: userId,
      name: data.name || fallback.name,
      email: fallback.email,
      username: data.username || fallback.username,
      avatar: data.avatar || fallback.avatar,
    };
  }

  return { id: userId, ...fallback };
}

// ─── Demo Mode Helpers ──────────────────────────────────────────────────────

function demoAvatar(name: string): string {
  const initials =
    name
      .split(/\s+/)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='a' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#F0356B'/><stop offset='1' stop-color='#2b0a18'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#a)'/><text x='50%' y='54%' text-anchor='middle' font-family='Be Vietnam Pro, sans-serif' font-size='24' font-weight='600' fill='white'>${initials}</text></svg>`,
  )}`;
}

function getDemoSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEYS.SESSION);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // Validate shape
    if (parsed && typeof parsed === "object" && parsed.id && parsed.email) {
      return parsed as AuthUser;
    }
    // Legacy format: { name, email, username } — migrate
    if (parsed && parsed.name && parsed.email) {
      const user: AuthUser = {
        id: `demo_${parsed.email.replace(/[^a-z0-9]/gi, "_")}`,
        name: parsed.name,
        email: parsed.email,
        username: parsed.username || parsed.email.split("@")[0],
        avatar: demoAvatar(parsed.name),
      };
      window.sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
      return user;
    }
    return null;
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEYS.SESSION);
    return null;
  }
}

function setDemoSession(user: AuthUser): void {
  window.sessionStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
}

function clearDemoSession(): void {
  window.sessionStorage.removeItem(STORAGE_KEYS.SESSION);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Sign up a new user.
 * Demo: stores session locally, skips password.
 * Production: calls Supabase Auth signup.
 */
export async function signup(data: {
  name: string;
  username: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  if (IS_DEMO_MODE) {
    const user: AuthUser = {
      id: `demo_${Date.now()}`,
      name: data.name,
      email: data.email,
      username: data.username.toLowerCase().replace("@", ""),
      avatar: demoAvatar(data.name),
    };
    setDemoSession(user);
    return { user, session: null };
  }

  const supabase = getSupabase();
  const { data: authData, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        name: data.name,
        username: data.username.toLowerCase().replace("@", ""),
      },
    },
  });

  if (error) throw { message: error.message, status: error.status } as AuthError;
  if (!authData.user) throw { message: "Signup failed — no user returned" } as AuthError;

  // Profile may not exist yet (trigger `handle_new_user` runs async),
  // so provide good fallback values from signup form data.
  const user = await fetchProfileFromDb(supabase, authData.user.id, {
    name: data.name,
    email: data.email,
    username: data.username.toLowerCase().replace("@", ""),
    avatar: demoAvatar(data.name),
  });

  return {
    user,
    session: authData.session
      ? {
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
        }
      : null,
  };
}

/**
 * Sign in an existing user.
 * Demo: stores session locally, skips password verification.
 * Production: calls Supabase Auth signInWithPassword.
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  if (IS_DEMO_MODE) {
    const name = email.split("@")[0];
    const user: AuthUser = {
      id: `demo_${Date.now()}`,
      name,
      email,
      username: name.toLowerCase(),
      avatar: demoAvatar(name),
    };
    setDemoSession(user);
    return { user, session: null };
  }

  const supabase = getSupabase();
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw { message: error.message, status: error.status } as AuthError;
  if (!authData.user) throw { message: "Login failed — no user returned" } as AuthError;

  const meta = authData.user.user_metadata ?? {};
  const user = await fetchProfileFromDb(supabase, authData.user.id, {
    name: (meta.name as string) || email.split("@")[0],
    email: authData.user.email || email,
    username: (meta.username as string) || email.split("@")[0],
    avatar: (meta.avatar as string) || demoAvatar((meta.name as string) || email),
  });

  return {
    user,
    session: authData.session
      ? {
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
        }
      : null,
  };
}

export const getServerUser = createServerFn({ method: "GET" }).handler(async () => {
  if (IS_DEMO_MODE) return null;
  try {
    const { getRequest, setResponseHeader } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const resHeaders = new Headers();
    const supabase = getSupabaseServer(req, resHeaders);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    // Ghi lại mọi Set-Cookie mà supabase vừa tính toán (nếu có refresh xảy ra)
    resHeaders.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        setResponseHeader("Set-Cookie", value);
      }
    });

    if (error || !user) return null;

    const meta = user.user_metadata ?? {};
    const profileSupabase = getSupabaseServer(req);
    return fetchProfileFromDb(profileSupabase, user.id, {
      name: (meta.name as string) || user.email?.split("@")[0] || "User",
      email: user.email || "",
      username: (meta.username as string) || user.email?.split("@")[0] || "user",
      avatar: (meta.avatar as string) || demoAvatar((meta.name as string) || "U"),
    });
  } catch (e) {
    console.error("Lỗi auth server-side:", e);
    return null;
  }
});

/**
 * Get the current authenticated user.
 * Demo: reads from sessionStorage.
 * Production: calls Supabase Auth getUser via Server Function.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (IS_DEMO_MODE) {
    return getDemoSession();
  }

  // On the browser, use client-side auth directly to avoid cookie sync issues
  // with server functions after login/signup redirect.
  if (typeof window !== "undefined") {
    try {
      const supabase = getSupabase();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) return null;

      const meta = user.user_metadata ?? {};
      return fetchProfileFromDb(supabase, user.id, {
        name: (meta.name as string) || user.email?.split("@")[0] || "User",
        email: user.email || "",
        username: (meta.username as string) || user.email?.split("@")[0] || "user",
        avatar: (meta.avatar as string) || demoAvatar((meta.name as string) || "U"),
      });
    } catch (e) {
      console.error("Lỗi auth client-side:", e);
      return null;
    }
  }

  // Server-side (SSR): use server function
  return getServerUser();
}

/**
 * Sign out the current user.
 * Demo: clears sessionStorage.
 * Production: calls Supabase Auth signOut.
 */
export async function logout(): Promise<void> {
  if (IS_DEMO_MODE) {
    clearDemoSession();
    return;
  }

  const supabase = getSupabase();
  await supabase.auth.signOut();
}

/**
 * Synchronous check — demo mode only.
 * For production, use `getCurrentUser()` instead.
 */
export function getSessionSync(): AuthUser | null {
  return getDemoSession();
}
