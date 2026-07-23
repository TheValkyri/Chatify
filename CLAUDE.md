# Chatify Development Guide

## Build & Test Commands

- Local Dev Server: `npm run dev`
- Production Build: `npm run build`
- Preview Build: `npm run preview`
- Linting: `npm run lint`
- Formatter: `npm run format`
- Typecheck: `npm run typecheck`

## Code Guidelines

- **Framework**: TanStack Start + TanStack Router (File-based routing under `src/routes/`).
- **State Management**: React Query (TanStack Query) for API caching and mutations.
- **Backend Integration**: Supabase (Auth, Database, Realtime, Storage).
- **Environment**: Configured via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Must be present _at build time_ (inside `.env.local` or environment variables) for production bundle to work.
- **Styling**: Modern CSS with curated HSL color systems, responsive grids, and Framer Motion micro-animations.
- **Data Mapper Layer**: Database entities (snake_case) must always pass through `src/lib/mappers.ts` to camelCase frontend types before component usage.

## Bảo mật Storage (quan trọng — đã từng bị cấu hình sai)

Bucket `attachments` PHẢI là private (`public: false`), mọi policy PHẢI dựa trên
`is_conversation_member()`. KHÔNG dùng `getPublicUrl()` — dùng `createSignedUrl()`
qua `getAttachmentSignedUrl()` trong `lib/upload.ts`. Nếu thấy `public: true` ở bất
kỳ đâu trong migration mới, đó là lỗi, không phải tính năng.

## Trước khi thêm phase mới

Đọc `docs/Chatify-Backend-Master-Plan*.md` (Part 1/2/3) để biết phase nào đã xong,
đang làm dở, hay đã bị phát hiện có vấn đề — tránh làm lại việc đã xong hoặc
lặp lại lỗi đã từng vá.
