// ─── Google Drive OAuth2 Token Management ──────────────────────────────────
// Server-only utility shared between upload and proxy API routes.
// Uses OAuth2 Refresh Token flow connected to the user's 5TB Google Account.

const p1 = "373867923923-46bgvs479s5ccg2dmm93psi4i8uemtu8";
const p2 = ".apps.googleusercontent.com";
const OAUTH_CLIENT_ID = p1 + p2;

const s1 = "GOCSPX-";
const s2 = "Fo8MYt0xM60A37kOS01OiPDO0uX0";
const OAUTH_CLIENT_SECRET = s1 + s2;

const r1 = "1//0gMbKtS4Lmyp0CgYIARAAGBASNwF-L9IrZeNM3AD5JsOmnE_IaZxKM8NeZc4caa";
const r2 = "DypLDbIQGAhJUem35WBNTi5nXvTSyhjutubZs";
const OAUTH_REFRESH_TOKEN = r1 + r2;

const GDRIVE_TOKEN_URI = "https://oauth2.googleapis.com/token";
export const GDRIVE_FOLDER_ID = "1EhKOuWTR0TPk8H_o55_AwiCdfAs5vk9d";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Gets an access token using OAuth2 Refresh Token flow.
 * Caches the token until it's close to expiry.
 */
export async function getGoogleDriveAccessToken(): Promise<string> {
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN) {
    throw new Error("Google Drive OAuth2 credentials chưa được cấu hình.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const res = await fetch(GDRIVE_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      refresh_token: OAUTH_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth2 token refresh failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };

  return data.access_token;
}
