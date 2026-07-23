// ─── Chatify — Mock Data & Helpers ──────────────────────────────────────────
// SVG avatar/gradient generators used for placeholder visuals.
//
// NOTE: This file no longer defines types — import from "@/lib/types" instead.

// Re-export types for backward compatibility during migration
export type { Presence, Attachment, Message } from "./types";

// Re-export OriginalFile for the ZIP builder
export type { OriginalFile } from "./file-transfer";

// ─── SVG Generators ─────────────────────────────────────────────────────────

/** Generate a gradient background SVG data URI */
export const grad = (a: string, b: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='400' height='300' fill='url(#g)'/></svg>`,
  )}`;

/** Generate a circular avatar SVG with initials */
export const avatar = (label: string, from: string, to: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='a' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#a)'/><text x='50%' y='54%' text-anchor='middle' font-family='Be Vietnam Pro, sans-serif' font-size='24' font-weight='600' fill='white'>${label}</text></svg>`,
  )}`;
