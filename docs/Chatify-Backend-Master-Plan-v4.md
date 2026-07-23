# Chatify — Kế hoạch Bổ sung Phase 20+ & Roadmap Tổng hợp (Master Plan — Part 4)

> Tiếp nối `Chatify-Backend-Master-Plan.md` (Part 1), `Chatify-Backend-Master-Plan-v2.md` (Part 2), và `Chatify-Backend-Master-Plan-v3.md` (Part 3).
> Tài liệu này được tạo tự động sau buổi Audit độc lập bởi Senior Fullstack Architect & Security Reviewer.
> Kết quả kiểm tra bằng lệnh thực tế: `tsc --noEmit` (0 lỗi, PASS), `npm run build` (thành công 100% cả Client + SSR + Cloudflare Worker bundle), `npm run lint` (thất bại với 16 vấn đề: 7 lỗi ESLint/Prettier, 9 cảnh báo).

---

## Phase 20 — Sửa dứt điểm 7 lỗi ESLint/Prettier & 9 Warning React-Hooks

**Mức độ:** 🟡 MEDIUM — chặn lệnh CI/CD build tự động (CI sẽ fail tại `npm run lint`).
**Điều kiện tiên quyết:** Không có.

### 20.1 — Vá 4 lỗi `@typescript-eslint/no-explicit-any`

1. **File `src/lib/api.ts` (dòng 610 & 644):**

```ts
// Định nghĩa type thô cho PostgREST response
type RawFriendRequest = {
  id: string;
  from_user_id: string;
  message: string | null;
  created_at: string;
  profiles: { name: string; avatar: string } | null;
};

type RawProfile = {
  id: string;
  name: string;
  avatar: string;
  username: string | null;
};

// Sửa line 610:
return (data as RawFriendRequest[] ?? []).map((r) => ({ ... }));

// Sửa line 644:
return (data as RawProfile[] ?? []).map((p) => ({ ... }));
```

2. **File `src/hooks/useRealtimeMessages.ts` (dòng 32):**

```ts
// Sửa payload: any -> payload: RealtimePostgresInsertPayload<DbMessage> hoặc Record<string, unknown>
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
// Thay payload: any bằng payload: RealtimePostgresInsertPayload<Record<string, unknown>>
```

3. **File `src/hooks/useRealtimeGlobal.ts` (dòng 38):**

```ts
// Thay payload: any bằng payload: RealtimePostgresInsertPayload<Record<string, unknown>>
```

### 20.2 — Chạy `npm run format` để tự động sửa 3 lỗi Prettier

```bash
npm run format
```

Sửa tận gốc các lỗi formatting trong `ChatifyApp.tsx` (dòng 1459, 1538, 1540).

### 20.3 — Xử lý các React Hooks Warning (exhaustive-deps)

- Refactor `retainedPreviewUrls.current` trong `useEffect` cleanup của `ChatifyApp.tsx` (dòng 1124) bọc vào local variable trước cleanup.
- Thêm hoặc bọc `handleGenerate` trong `Modals.tsx` (dòng 1022) bằng `useCallback`.

### Definition of Done — Phase 20

- [x] `npm run lint` chạy thành công 100% với 0 lỗi (0 errors, exit code 0).
- [x] `npx tsc --noEmit` giữ nguyên 0 lỗi.
- [x] `npm run build` tiếp tục PASS.

---

## Phase 21 — Nâng cấp CI/CD Workflow & Staging Deployment

**Mức độ:** 🟢 LOW / OPERATIONAL.

### 21.1 — Bổ sung `.github/workflows/deploy.yml`

Tạo file CI tự động kiểm tra `typecheck`, `lint`, `build` khi có Pull Request và deploy tự động lên Cloudflare Pages/Workers khi merge vào `main`.

### Definition of Done — Phase 21

- [ ] GitHub Actions workflow chạy tự động và pass 3 bước: `typecheck`, `lint`, `build`.

---

## Roadmap tổng hợp TOÀN BỘ DỰ ÁN (Phase 0 — Phase 21)

```markdown
## ĐÃ HOÀN THÀNH VÀ DỰNG XONG (Xác minh bằng code thực tế & lệnh test)

- [x] Phase 0 — Vá regression tải file
- [x] Phase 1 — Wiring API/hooks vào UI
- [x] Phase 2 — Schema Supabase + RLS + mapper layer
- [x] Phase 3 — Upload file thật lên Storage
- [x] Phase 4 — Realtime tin nhắn
- [x] Phase 5 — 5.1 Chọn thành viên thật khi tạo nhóm
- [x] Phase 7 — 7.1 (1 lockfile package-lock.json), 7.4 (CI cơ bản)
- [x] Phase 9 — Vá định danh "me" -> session.id
- [x] Phase 10 — Rời nhóm / Tham gia nhóm qua mã mời
- [x] Phase 11 — Sửa chữ ký SQL message_reads
- [x] Phase 12 — 12.1-12.4 (FolderCard, try/catch, nhãn UI, dọn any cũ)
- [x] Phase 13 — Chuyển sang @supabase/ssr (đọc cookie server & client)
- [x] Phase 14 — Vá Storage Privacy: bucket `attachments` chuyển private, RLS member restriction, signed URL generator `useAttachmentUrl`
- [x] Phase 15 — Dọn dữ liệu rác, sửa `smoke-test.cjs` đúng schema
- [x] Phase 16 — Hoàn thiện lời mời kết bạn (`fetchIncomingFriendRequests`, `respondToFriendRequest`)
- [x] Phase 17 — Vá silent-failure: bỏ `"them"` ID, mở rộng lookup thành viên `fetchProfilesByIds`
- [x] Phase 18 — Cookie refresh write-back phía SSR trong `getServerUser()`
- [x] Phase 19 — RPC atomic `increment_invite_uses`, dọn file trùng `verify-supabase.js`
- [x] Phase 20 — Sửa 7 lỗi ESLint/Prettier & React Hook warnings (`npm run lint` đạt 0 errors)

## CẦN XỬ LÝ TIẾP THEO (Phase 21)

- [ ] Phase 21 — Nâng cấp CI/CD GitHub Actions Workflow (deploy tự động)
```
