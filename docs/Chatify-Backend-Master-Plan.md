# Chatify — Siêu kế hoạch tích hợp Backend (Master Implementation Plan)

> Tài liệu này là bản kế hoạch thi công đầy đủ, dựa trên audit thực tế đã chạy `tsc --noEmit`, `eslint`, và `npm run build` trên source code Chatify (bản đã có `lib/api.ts`, `lib/auth.ts`, `lib/upload.ts`, `lib/types.ts`, hooks React Query). Mọi số dòng, tên hàm, tên file trong tài liệu này trỏ đúng vào source thật, không suy đoán.

---

## 0. Cách dùng tài liệu này

- Đây là tài liệu **thi công** (execution plan), không phải tài liệu **memory/ngữ cảnh thường trực**. Nó nên nằm trong repo dưới dạng file riêng (`docs/BACKEND-INTEGRATION-PLAN.md`), **không** nhét vào `CLAUDE.md` — lý do kỹ thuật giải thích ở Mục 2.
- 8 phase đánh số 0-8, làm **tuần tự**, mỗi phase có: Mục tiêu / Điều kiện tiên quyết / Effort / Các bước / Code cụ thể / Cách test / Definition of Done / Rủi ro.
- Effort: 🟢 nhỏ (giờ-nửa ngày) · 🟡 vừa (1-3 ngày) · 🔴 lớn (nhiều ngày, chia nhỏ được).
- Checklist tổng hợp tick được nằm ở Phụ lục A — copy bảng đó vào issue tracker hoặc `docs/` để theo dõi tiến độ qua nhiều phiên làm việc.

---

## 1. Cấu trúc repo — "hợp nhất vào đâu"

**Khuyến nghị: giữ nguyên 1 repo Chatify duy nhất, không tách repo backend riêng.**

Lý do: backend ở đây là Supabase (Postgres + Auth + Storage + Realtime + Edge Functions dưới dạng dịch vụ managed), không phải một server Node/Express tự viết. Không có "service backend" nào cần source code riêng để build/deploy độc lập — toàn bộ "backend" là **schema + policy + config**, và Supabase CLI đã có quy ước chuẩn để việc đó sống ngay trong cùng repo frontend:

```
Chatify/
├── src/                              # Frontend hiện có — không đổi vị trí
├── supabase/                         # MỚI — tạo bằng `supabase init`
│   ├── config.toml
│   ├── migrations/                   # File SQL, đặt tên YYYYMMDDHHMMSS_ten.sql
│   │   ├── 20260716120000_init_schema.sql
│   │   ├── 20260716120001_rls_policies.sql
│   │   └── 20260716120002_triggers.sql
│   ├── functions/                    # Edge Functions nếu Phase 6 cần (invite code server-side)
│   └── seed.sql                      # Dữ liệu mẫu cho local dev
├── docs/
│   └── BACKEND-INTEGRATION-PLAN.md   # Chính tài liệu này
├── CLAUDE.md                         # Ngữ cảnh thường trực cho AI agent — xem Mục 2
├── .claude/
│   └── skills/
│       └── chatify-phase/SKILL.md    # Skill thực thi từng phase — xem Mục 2
├── .env.example                      # Đã có sẵn
└── package.json
```

**Khi nào MỚI cần tách repo riêng:** chỉ khi sau này có logic server-side phức tạp vượt quá khả năng của Postgres function/RLS/Edge Function (ví dụ: xử lý video transcoding nặng, một service riêng cho WebRTC signaling ở Phase 8). Lúc đó tách **service đó** ra repo riêng, không tách "backend" nói chung — vẫn giữ Supabase config trong repo Chatify vì nó gắn chặt với schema mà frontend query trực tiếp.

**Cách khởi tạo (làm 1 lần, đầu Phase 2):**

```bash
npm install supabase --save-dev    # pin version trong package.json, không cài global
npx supabase init
npx supabase login
npx supabase link --project-ref <project-ref-từ-dashboard>
```

---

## 2. Thiết lập AI Agent trước khi thi công

Repo này rồi sẽ được một AI coding agent (Claude Code, hoặc Codex như Liem đang dùng cho Universal Converter) thực thi qua nhiều phiên làm việc. Có 2 cơ chế khác nhau, dùng sai cơ chế sẽ khiến agent hoặc quên context hoặc tốn context vô ích — đây là thông tin đã xác minh trực tiếp từ tài liệu Claude Code hiện hành (docs.claude.com), không phải suy đoán:

| Cơ chế                              | Dùng cho                                                                                                     | Đặc điểm                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`CLAUDE.md`**                     | Sự thật ổn định, ít đổi: tech stack, quy ước, lệnh build/test, gotcha đã phát hiện                           | Load ở **mọi** phiên, sống lại sau `/compact`. Nên giữ **20-80 dòng** cho repo cỡ này — dài hơn 200 dòng bắt đầu khó bảo trì và dễ mâu thuẫn. **Không phải chỗ để chứa kế hoạch thi công hay checklist** (plan đổi liên tục, CLAUDE.md cần ổn định). |
| **Skill riêng** (`.claude/skills/`) | Quy trình lặp lại, có nhiều bước, chỉ cần khi thi công — đúng bản chất việc "chạy 1 phase trong 8 phase này" | Chỉ load nội dung đầy đủ **khi được gọi** (`/chatify-phase`), không tốn context ở các phiên không liên quan.                                                                                                                                         |

Nói cách khác: **CLAUDE.md trỏ tới tài liệu này, không sao chép nó.** Tài liệu 8-phase (file bạn đang đọc) nằm ở `docs/BACKEND-INTEGRATION-PLAN.md`, còn quy trình "lấy 1 phase từ đó ra làm" nằm trong Skill.

### 2.1 — `CLAUDE.md` (đặt ở root repo)

```markdown
# Chatify — Ngữ cảnh dự án

## Stack

TanStack Start (SSR) + React 19 + Tailwind v4 + Framer Motion, deploy Cloudflare Workers (Nitro `cloudflare-module`).
Backend: Supabase (Postgres + Auth + Storage + Realtime). Package manager: npm (KHÔNG dùng bun — xem Phase 7).

## Quy ước bắt buộc

- Toàn bộ hàm gọi dữ liệu đi qua `src/lib/api.ts`. KHÔNG gọi `supabase` trực tiếp từ component.
- Mọi hàm trong `api.ts` phải rẽ nhánh theo `IS_DEMO_MODE` (từ `src/lib/config.ts`) — xem pattern có sẵn trong file đó trước khi thêm hàm mới.
- Đọc dữ liệu từ Supabase LUÔN đi qua hàm map trong `src/lib/mappers.ts` (snake_case DB -> camelCase type). KHÔNG ép kiểu thẳng `as Conversation[]`/`as Message[]`.
- Cột `jsonb` (vd `messages.attachment`): truyền thẳng object JS cho supabase-js, KHÔNG `JSON.stringify()` trước khi insert.
- Tên bảng thành viên nhóm: `conversation_members` (không phải `members`) — đồng bộ giữa mọi hàm đọc/ghi.
- Biến `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` được Vite inline TĨNH lúc `npm run build`, không đọc runtime — phải có mặt lúc build (CI hoặc `.env.local`), set trên Cloudflare dashboard KHÔNG đủ.

## Lệnh xác minh trước khi báo cáo hoàn thành

npx tsc --noEmit && npm run build
(build phải qua cả client + SSR + nitro bundle, không chỉ tsc sạch)

## Kế hoạch thi công

Toàn bộ roadmap backend nằm ở `docs/BACKEND-INTEGRATION-PLAN.md`, chia 8 phase, làm tuần tự.
Dùng skill `/chatify-phase <số>` để thực thi từng phase — xem `.claude/skills/chatify-phase/SKILL.md`.
```

Ghi chú: file trên **cố tình ngắn** — đây là những sự thật sẽ còn đúng qua nhiều tuần, không phải checklist. Khi một quy ước ở đây bị vi phạm nhiều lần bởi AI agent, đó là dấu hiệu cần viết rõ hơn, không phải thêm dài dòng.

### 2.2 — Skill thực thi phase (`.claude/skills/chatify-phase/SKILL.md`)

```yaml
---
name: chatify-phase
description: Thực thi 1 phase trong kế hoạch tích hợp backend Chatify (docs/BACKEND-INTEGRATION-PLAN.md). Dùng khi bắt đầu hoặc tiếp tục 1 phase cụ thể.
disable-model-invocation: true
argument-hint: [số phase, ví dụ: 0]
allowed-tools: Read Grep Glob Bash(npx tsc *) Bash(npm run *) Bash(npx supabase *)
---

Thực thi Phase $ARGUMENTS của kế hoạch backend Chatify.

## Quy trình bắt buộc (không được bỏ bước)

1. Đọc `docs/BACKEND-INTEGRATION-PLAN.md`, tìm đúng mục "Phase $ARGUMENTS" — đọc Mục tiêu, Điều kiện tiên quyết, Các bước, Definition of Done.
2. Kiểm tra Điều kiện tiên quyết đã thoả chưa (phase trước đã Definition of Done chưa). Nếu chưa, DỪNG và báo cho người dùng, không tự ý nhảy phase.
3. Lập kế hoạch chi tiết các file sẽ sửa/tạo, trình bày ngắn gọn trước khi bắt đầu sửa code.
4. Thực thi từng bước, ưu tiên sửa tối thiểu — không refactor thêm phần ngoài phạm vi phase này dù có thấy tiện.
5. Sau khi sửa xong: chạy `npx tsc --noEmit`. Nếu lỗi, tự sửa trước khi tiếp tục.
6. Chạy `npm run build`. Bản build phải thành công (client + SSR + nitro).
7. Đối chiếu lại với "Definition of Done" của phase — liệt kê rõ mục nào đạt, mục nào chưa, không tự nhận "xong" nếu chưa đối chiếu.
8. Cập nhật checkbox tương ứng trong Phụ lục A của `docs/BACKEND-INTEGRATION-PLAN.md` (đổi `[ ]` thành `[x]`).
9. Báo cáo: đã sửa file nào, đã test bằng gì, còn rủi ro/giả định gì cần người dùng xác nhận thủ công (ví dụ: cần test tay trên Supabase project thật).

## Nguyên tắc
- Không tự ý bỏ qua "Cách test" nêu trong phase — nếu 1 bước cần test thủ công trên Supabase Dashboard (không tự động hoá được), nói rõ ràng thay vì im lặng bỏ qua.
- Nếu phát hiện điều kiện thực tế khác với mô tả trong plan (ví dụ dòng code đã đổi so với lúc audit), dừng lại báo cho người dùng thay vì tự suy đoán tiếp.
```

Vì có `disable-model-invocation: true`, skill này **chỉ chạy khi gọi tay** bằng `/chatify-phase 0`, `/chatify-phase 1`, v.v. — hợp lý vì mỗi phase đều có side effect thật (sửa code, đôi khi đổi schema DB), không nên để AI tự quyết định thời điểm chạy.

### 2.3 — Công cụ thực thi

Việc thi công 8 phase dưới đây là sửa code thật trên nhiều file + chạy lệnh thật (`tsc`, `npm run build`, `supabase` CLI) — đây đúng là việc của một coding agent chạy trong terminal/repo thật, không phải chat hỏi-đáp. Khuyến nghị dùng Claude Code ngay trong thư mục repo, trỏ vào `CLAUDE.md` + skill vừa thiết lập ở trên.

---

## 3. Sơ đồ phụ thuộc giữa các phase

```
Phase 0 (vá regression) ──┐
                           ├──> Phase 1 (wiring) ──> Phase 2 (schema thật) ──┬──> Phase 3 (upload)
                           │         [làm được ở demo mode,                  ├──> Phase 4 (realtime)
                           │          không cần chờ Phase 2]                 └──> Phase 6 (hardening)
                           │
                           └─────────────────────────────────────> Phase 5 (hoàn thiện tính năng)
                                                                            │
Phase 7 (CI/CD, dọn dẹp) ── có thể làm song song bất kỳ lúc nào ───────────┘
Phase 8 (WebRTC) ── hoàn toàn độc lập, làm riêng khi nào cần tính năng gọi
```

Điểm quan trọng: **Phase 1 không cần chờ Phase 2.** Vì `api.ts`/hooks đã có nhánh demo-mode tương đương hành vi cũ, có thể wiring toàn bộ UI vào hook trước, giữ app chạy đúng ở demo mode, rồi mới bật Supabase thật ở Phase 2 — giảm rủi ro so với đổi tất cả cùng lúc.

---

## Phase 0 — Vá regression khẩn cấp

**Mục tiêu:** Sửa các lỗi tải file mới phát sinh (video/file/folder không tải được), vì đây là bug thật, không sửa thì Phase 1 trở đi sẽ kế thừa bug này vào toàn bộ luồng mới.
**Điều kiện tiên quyết:** không có — làm trước tiên.
**Effort:** 🟢 nhỏ (2-4 giờ).

### Bước 0.1 — Thêm `url` cho attachment video/file khi tạo draft

File `src/components/chatify/ChatifyApp.tsx`, hàm `addEntries()` — nhánh tạo draft cho file thường (không phải ảnh/video) hiện không tạo object URL. Sửa:

```tsx
// TRƯỚC — nhánh file thường không có url:
return {
  id: crypto.randomUUID(),
  file: f,
  kind: "file",
  name: f.name,
  size: fmtSize(f.size),
};

// SAU:
return {
  id: crypto.randomUUID(),
  file: f,
  kind: "file",
  name: f.name,
  size: fmtSize(f.size),
  url: URL.createObjectURL(f), // THÊM — cần cho download, dọn bằng revokeObjectURL như đã làm với ảnh/video
};
```

Nhớ thêm URL này vào danh sách `retainedPreviewUrls`/dọn dẹp `URL.revokeObjectURL` đã có sẵn trong file (cùng cơ chế đang dùng cho ảnh/video), để không rò rỉ blob URL.

### Bước 0.2 — Set `url` khi build `Attachment` trong `submit()`

Cùng file, hàm `submit()`:

```tsx
// Video — TRƯỚC:
attachment = {
  kind: "video",
  name: d.name,
  size: d.size,
  duration: "—",
  poster: d.url!,
  source: d.file,
};

// Video — SAU:
attachment = {
  kind: "video",
  name: d.name,
  size: d.size,
  duration: "—",
  url: d.url!, // THÊM — dùng để tải gốc
  poster: d.url!, // GIỮ — vẫn dùng cho thumbnail/preview trong bubble
  source: d.file,
};

// File thường — TRƯỚC:
attachment = {
  kind: "file",
  name: d.name,
  size: d.size,
  ext: d.name.split(".").pop() ?? "file",
  source: d.file,
};

// File thường — SAU:
attachment = {
  kind: "file",
  name: d.name,
  size: d.size,
  ext: d.name.split(".").pop() ?? "file",
  url: d.url, // THÊM — có được nhờ bước 0.1
  source: d.file,
};
```

### Bước 0.3 — Bọc `try/catch` cho mọi nơi gọi `downloadAttachment`

3 vị trí đang gọi thẳng không bắt lỗi: `TicketStub` (nút trong bubble chat), `FileCard` (tab Files trong chi tiết nhóm), lightbox preview ("Tải chất lượng gốc"). `FolderCard` đã có pattern đúng (`downloadError` state) — copy pattern đó.

Trước tiên, mount `Toaster` (đã có sẵn dependency `sonner` + wrapper `src/components/ui/sonner.tsx`, nhưng **chưa được mount ở đâu cả** — xác nhận qua grep, đây là hạ tầng có sẵn nhưng chưa dùng, giống pattern lặp lại nhiều lần trong dự án này):

```tsx
// src/routes/__root.tsx — trong RootComponent, thêm 1 lần duy nhất
import { Toaster } from "@/components/ui/sonner";
// ... trong JSX return, đặt cạnh Outlet:
<Toaster />;
```

Sau đó ở 3 vị trí gọi `downloadAttachment`:

```tsx
import { toast } from "sonner";

// Thay:
onClick={() => downloadAttachment(att)}

// Bằng:
onClick={async () => {
  try {
    await downloadAttachment(att);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Không thể tải file này.");
  }
}}
```

### Bước 0.4 — Xoá nhánh tạo file giả trong `FolderCard`

File `ChatifyApp.tsx`, `FolderCard.handleDownload` — nhánh `else` (khi `att.sourceFiles` rỗng) hiện tạo `File` giả bằng `new File([new Blob(["Thư mục con: ..."])])`. Đây đúng loại bug đã được xoá ở `file-transfer.ts` nhưng bị bỏ sót ở đây vì `FolderCard` có logic download riêng, không dùng lại `downloadAttachment()`. Xoá toàn bộ nhánh sinh nội dung giả, thay bằng:

```tsx
} else {
  setDownloadError("Thư mục này không còn khả dụng để tải (dữ liệu gốc đã mất sau khi tải lại trang).");
  return;
}
```

### Cách test

1. Gửi thử 1 ảnh, 1 video, 1 file bất kỳ (pdf/docx), 1 folder trong cùng 1 phiên trình duyệt.
2. Bấm "Tải gốc" trên cả 4 loại — cả 4 phải tải đúng nội dung gốc (so sánh checksum/kích thước với file gốc).
3. Reload trang (F5), thử tải lại — ảnh/video/file phải báo lỗi rõ ràng qua toast (vì blob URL đã chết, đây là hành vi ĐÚNG cho tới khi Phase 3 xong), folder phải báo lỗi qua `downloadError`, không có trường hợp nào tạo ra file rác.
4. Chạy `npx tsc --noEmit` — phải sạch.

### Definition of Done

- [ ] `addEntries()` tạo `url` cho mọi loại draft, không riêng ảnh/video.
- [ ] `submit()` set `url` cho attachment video và file.
- [ ] `<Toaster />` được mount ở `__root.tsx`.
- [ ] Cả 3 nơi gọi `downloadAttachment` (TicketStub, FileCard, lightbox) có `try/catch` + `toast.error`.
- [ ] `FolderCard` không còn nhánh sinh file giả.
- [ ] Test tay 4 loại attachment tải đúng nội dung trong cùng phiên.
- [ ] `tsc --noEmit` sạch, `npm run build` thành công.

### Rủi ro / lưu ý

Đây vẫn là fix ở tầng demo-mode (blob URL) — bản chất "download sau khi reload trang vẫn mất dữ liệu" chỉ được giải quyết triệt để ở Phase 3 (upload thật lên Supabase Storage). Phase 0 chỉ đảm bảo không còn app **âm thầm tạo file rác** hoặc **im lặng không phản hồi** khi bấm tải.

---

## Phase 1 — Lắp ráp lớp API/hooks vào UI chính

**Mục tiêu:** Thay toàn bộ `useState` + `localStorage` trực tiếp trong `ChatifyApp.tsx`/`Modals.tsx` bằng các hook đã viết sẵn (`useConversations`, `useMessages`, v.v.) và các hàm trong `api.ts`. Sau phase này, hành vi ở demo mode phải **giữ nguyên** (đây là refactor giữ-hành-vi, không phải thêm tính năng).
**Điều kiện tiên quyết:** Phase 0 xong.
**Effort:** 🔴 lớn — đây là phase trọng tâm, nên chia nhỏ theo bảng mapping dưới, làm và test từng mục một, không đổi hết 1 lần.

### Bảng mapping — thay gì bằng gì

| Chỗ cũ (ChatifyApp.tsx)                                                     | Thay bằng                                                                     | Ghi chú                                                                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `useState<Conversation[]>` + `useEffect` ghi `localStorage`                 | `useConversations()` (từ `hooks/useConversations.ts`)                         | Xoá luôn `useEffect` persist thủ công — hook tự quản lý qua React Query + demo-mode localStorage bên trong `api.ts`.            |
| `handleCreateConversation` (set state trực tiếp, hardcode 3 member giả)     | `useCreateConversation().mutate(...)`                                         | Kết hợp sửa luôn Phase 5.1 (bỏ hardcode) tại đây cho tiện, hoặc để riêng — tuỳ độ rủi ro bạn muốn nhận mỗi lần đổi.             |
| `messagesByConv` state + `sendMessage()`                                    | `useMessages(activeId)` để đọc, `useSendMessage(activeId).mutate(...)` để gửi | `useSendMessage` đã có optimistic update + rollback đúng chuẩn — không cần viết lại.                                            |
| `handleSearchOrJoin` (bịa user giả)                                         | gọi `searchUsers()` / hàm join tương ứng từ `api.ts`                          | **Xoá hẳn** logic fabrication cũ, không giữ song song.                                                                          |
| `InviteModal.handleGenerate` (Modals.tsx, `Math.random()`)                  | `generateInviteCode()` từ `api.ts`                                            |                                                                                                                                 |
| `handleSendFriendRequest` (setTimeout giả)                                  | `sendFriendRequest()` từ `api.ts`                                             |                                                                                                                                 |
| Raw string `"chatify.globalInviteCodes"`, `"chatify.conversations"` còn sót | `STORAGE_KEYS.*` từ `config.ts`                                               | Vài chỗ đã đổi, vài chỗ (đặc biệt trong nhánh fabrication cũ) vẫn còn raw string — sẽ tự biến mất khi xoá nhánh cũ ở dòng trên. |

### Bước thực hiện

1. **Bắt đầu từ đọc, không phải ghi.** Thay `useState<Conversation[]>` bằng `useConversations()` trước, giữ nguyên mọi hàm ghi tạm thời (vẫn `setConvs` cũ) — kiểm tra app render đúng danh sách hội thoại. Vì hook đọc từ `localStorage` qua `api.ts` ở demo mode với cùng `STORAGE_KEYS.CONVERSATIONS`, dữ liệu cũ trong trình duyệt vẫn hiển thị được (không mất dữ liệu demo hiện có).
2. **Chuyển từng hàm ghi một**, theo thứ tự rủi ro thấp → cao: `handleCreateConversation` → `sendMessage` → các hàm quản lý thành viên (đổi role, xoá thành viên, chuyển quyền owner) → cuối cùng là cụm search/invite/friend-request (rủi ro cao nhất vì đang xoá hẳn 1 luồng fabrication, không phải map 1-1).
3. Với `sendMessage`: cần thêm khả năng "cập nhật 1 message đã gửi" (patch theo `id`) vì Phase 3 (upload) sẽ cần trạng thái `sending → sent/failed`. Nếu `useSendMessage` chưa expose việc này rõ ràng, thêm 1 hàm nhỏ trong `useMessages.ts`:
   ```ts
   export function useUpdateMessage(convId: string) {
     const queryClient = useQueryClient();
     return (messageId: string, patch: Partial<Message>) => {
       queryClient.setQueryData(messageKeys.all(convId), (old?: Message[]) =>
         old?.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
       );
     };
   }
   ```
4. **Sau mỗi hàm chuyển xong, chạy lại toàn bộ luồng liên quan bằng tay** (không chỉ tsc) — vì đây là refactor hành vi, lỗi kiểu compile sẽ không bắt được lỗi logic (ví dụ quên gọi `.mutate()` mà chỉ định nghĩa nó).
5. Sau khi chuyển hết, xoá code chết: `useState` cũ không còn dùng, `useEffect` persist thủ công, toàn bộ khối fabrication trong `handleSearchOrJoin`.

### Cách test

- Test ở demo mode (không set `.env.local`) trước — checklist: tạo hội thoại mới, gửi tin nhắn text, đính kèm ảnh, tạo nhóm, đổi role thành viên, rời nhóm, tìm kiếm (giờ phải trả về **không tìm thấy** thay vì bịa user, vì `searchUsers` production-style logic không còn fabrication — xác nhận đúng là hành vi mới mong muốn, không phải bug).
- So sánh trực tiếp với hành vi bản trước Phase 1 (dùng bản audit đã lưu hoặc git diff) để chắc chắn không có hồi quy ở demo mode.

### Definition of Done

- [ ] `ChatifyApp.tsx`/`Modals.tsx` import từ `@/lib/api`, `@/hooks/useConversations`, `@/hooks/useMessages` — xác nhận bằng `grep -n "from \"@/lib/api\"\|from \"@/hooks/use"`.
- [ ] Không còn `useEffect` nào tự tay đọc/ghi `localStorage` cho conversations/messages trong `ChatifyApp.tsx` (việc đó nay nằm trong `api.ts`).
- [ ] `handleSearchOrJoin`/`InviteModal.handleGenerate`/`handleSendFriendRequest` không còn logic fabrication — gọi thẳng hàm từ `api.ts`.
- [ ] Toàn bộ checklist test tay ở demo mode pass, hành vi khớp bản trước Phase 1.
- [ ] `tsc --noEmit` sạch, `npm run build` thành công.

### Rủi ro

Đây là phase dễ gây hồi quy nhất vì khối lượng thay đổi lớn trên file 2700 dòng. Khuyến nghị commit sau mỗi mục nhỏ trong bảng mapping (không gộp thành 1 commit khổng lồ), để có thể `git revert` từng phần nếu phát hiện vấn đề.

---

## Phase 2 — Schema Supabase thật + sửa mismatch

**Mục tiêu:** Có 1 Supabase project thật, schema khớp chính xác với những gì `api.ts` giả định — và sửa 2 lỗi tự thân đã phát hiện trong `api.ts` (tên bảng `members` vs `conversation_members`, thiếu mapping layer, double-stringify jsonb).
**Điều kiện tiên quyết:** Có thể làm song song Phase 1, nhưng phải xong **trước khi** set `VITE_SUPABASE_URL` thật lần đầu.
**Effort:** 🟡 vừa (1-2 ngày, phần lớn là viết + test SQL).

### Bước 2.1 — Khởi tạo Supabase project + CLI

```bash
npm install supabase --save-dev
npx supabase init
npx supabase login
# Tạo project mới trên supabase.com/dashboard trước, lấy project-ref
npx supabase link --project-ref <project-ref>
```

### Bước 2.2 — Migration: bảng `profiles` + trigger đồng bộ `auth.users`

**Phát hiện quan trọng cần sửa ở đây:** `src/lib/auth.ts` (`getCurrentUser`/`login`) đọc thông tin người dùng (`name`, `username`, `avatar`) từ `user_metadata` của Supabase Auth. Nhưng `src/lib/api.ts` (`searchUsers` production) lại query 1 bảng `profiles` riêng với các cột tương tự. Đây là **2 nguồn sự thật khác nhau cho cùng 1 khái niệm** — nếu không đồng bộ, tìm kiếm user sẽ luôn rỗng dù người dùng đã đăng ký thật. Cách sửa chuẩn (pattern phổ biến của Supabase): trigger tự tạo `profiles` khi có user mới trong `auth.users`.

`supabase/migrations/20260716120000_init_schema.sql`:

```sql
-- ═══ PROFILES ═══
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text unique not null,
  phone text,
  avatar text default '',
  bio text,
  cover text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
as $$
begin
  insert into public.profiles (id, name, username, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 4)),
    coalesce(new.raw_user_meta_data->>'avatar', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══ CONVERSATIONS ═══
create table public.conversations (
  id text primary key,                 -- giữ dạng text để tương thích id client hiện có (c_xxx / g_xxx)
  name text not null,
  avatar text default '',
  description text,
  is_group boolean not null default false,
  preview text default '',
  unread integer not null default 0,
  presence text default 'offline',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══ CONVERSATION_MEMBERS ═══
-- LƯU Ý: tên bảng là conversation_members — phải khớp với select ở fetchConversations (xem Bước 2.4)
create table public.conversation_members (
  conversation_id text not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ═══ MESSAGES ═══
create table public.messages (
  id text primary key,
  conversation_id text not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  text text,
  attachment jsonb,
  created_at timestamptz not null default now()
);

-- ═══ FRIEND REQUESTS (bảng "friends" suy ra từ đây, xem view ở dưới) ═══
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) default auth.uid(),
  to_user_id uuid not null references public.profiles(id),
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id)
);

create view public.friends as
select
  p.id, p.name, p.avatar, p.username,
  fr.id as friend_request_id
from public.friend_requests fr
join public.profiles p
  on p.id = (case when fr.from_user_id = auth.uid() then fr.to_user_id else fr.from_user_id end)
where fr.status = 'accepted'
  and (fr.from_user_id = auth.uid() or fr.to_user_id = auth.uid());

-- ═══ INVITE CODES ═══
create table public.invite_codes (
  code text primary key,
  group_id text not null references public.conversations(id) on delete cascade,
  group_name text not null,
  created_by uuid references public.profiles(id) default auth.uid(),
  expires_at timestamptz,
  max_uses integer,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);
```

### Bước 2.3 — Trigger tự cập nhật `preview`/`updated_at` khi có tin nhắn mới

**Phát hiện quan trọng:** nhánh production của `sendMessage` trong `api.ts` chỉ `insert` vào `messages`, **không** cập nhật `conversations.preview`/`updated_at` (chỉ nhánh demo-mode làm việc này). Nếu để nguyên, danh sách hội thoại sẽ không tự sắp xếp theo tin nhắn mới nhất và không hiện preview khi dùng backend thật. Giải pháp đúng đắn hơn là xử lý bằng trigger DB (đúng bất kể client nào gửi, kể cả từ thiết bị khác qua realtime), thay vì thêm 1 lệnh update phía client (dễ quên, dễ race condition):

`supabase/migrations/20260716120002_triggers.sql`:

```sql
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql security definer
as $$
begin
  update public.conversations
  set
    preview = coalesce(
      left(new.text, 120),
      case when new.attachment is not null then '[' || (new.attachment->>'kind') || ']' else '' end
    ),
    updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger on_message_created
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();
```

### Bước 2.4 — RLS Policies (kèm cách né lỗi đệ quy thường gặp)

Bật RLS cho mọi bảng. **Lưu ý kỹ thuật quan trọng:** viết policy cho `conversation_members` mà tự query lại chính bảng `conversation_members` trong điều kiện `using(...)` sẽ gây lỗi `infinite recursion detected in policy` — đây là lỗi rất phổ biến khi mới làm RLS cho bảng many-to-many kiểu này. Cách né: bọc kiểm tra quyền trong 1 hàm `security definer`.

`supabase/migrations/20260716120001_rls_policies.sql`:

```sql
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.friend_requests enable row level security;
alter table public.invite_codes enable row level security;

-- Hàm helper — TRÁNH đệ quy khi policy trên conversation_members cần tự kiểm tra conversation_members
create or replace function public.is_conversation_member(conv_id text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_admin(conv_id text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = auth.uid() and role in ('owner','admin')
  );
$$;

-- profiles: đọc công khai cho user đã đăng nhập (cần cho search), chỉ chủ mới sửa
create policy "profiles_select_all" on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- conversations
create policy "conversations_select_member" on public.conversations for select using (public.is_conversation_member(id));
create policy "conversations_insert_authenticated" on public.conversations for insert with check (auth.role() = 'authenticated');
create policy "conversations_update_admin" on public.conversations for update using (public.is_conversation_admin(id));

-- conversation_members — dùng hàm helper, KHÔNG query trực tiếp bảng này trong using()
create policy "members_select_own_convs" on public.conversation_members for select using (public.is_conversation_member(conversation_id));
create policy "members_insert_self_or_admin" on public.conversation_members for insert with check (
  user_id = auth.uid() or public.is_conversation_admin(conversation_id)
);
create policy "members_manage_admin" on public.conversation_members for update using (public.is_conversation_admin(conversation_id));
create policy "members_delete_admin_or_self" on public.conversation_members for delete using (
  user_id = auth.uid() or public.is_conversation_admin(conversation_id)
);

-- messages
create policy "messages_select_member" on public.messages for select using (public.is_conversation_member(conversation_id));
create policy "messages_insert_member" on public.messages for insert with check (
  auth.uid() = author_id and public.is_conversation_member(conversation_id)
);

-- friend_requests
create policy "friend_requests_select_own" on public.friend_requests for select using (
  auth.uid() = from_user_id or auth.uid() = to_user_id
);
create policy "friend_requests_insert_own" on public.friend_requests for insert with check (auth.uid() = from_user_id);
create policy "friend_requests_update_recipient" on public.friend_requests for update using (auth.uid() = to_user_id);

-- invite_codes: đọc được nếu biết mã (join flow), chỉ admin nhóm mới tạo
create policy "invite_codes_select_any_authenticated" on public.invite_codes for select using (auth.role() = 'authenticated');
create policy "invite_codes_insert_admin" on public.invite_codes for insert with check (public.is_conversation_admin(group_id));
```

### Bước 2.5 — Viết mapping layer (file mới `src/lib/mappers.ts`)

Đây là phần **bắt buộc phải có** trước khi rời demo mode — thiếu nó, `conv.isGroup` sẽ luôn `undefined` khi đọc từ Supabase thật (vì cột DB là `is_group`), và `message.attachment` sẽ là chuỗi JSON thay vì object nếu giữ nguyên `JSON.stringify()` hiện tại trong `sendMessage`.

```ts
// src/lib/mappers.ts
import type { Conversation, Member, Message, Attachment, MemberRole } from "./types";

type DbMember = {
  user_id: string;
  role: MemberRole;
  profiles?: { name: string; avatar: string; username: string } | null;
};

type DbConversation = {
  id: string;
  name: string;
  avatar: string | null;
  description: string | null;
  is_group: boolean;
  preview: string | null;
  unread: number;
  presence: string;
  conversation_members?: DbMember[];
};

type DbMessage = {
  id: string;
  conversation_id: string;
  author_id: string;
  text: string | null;
  attachment: unknown;
  created_at: string;
};

export function mapMemberFromDb(row: DbMember): Member {
  return {
    id: row.user_id,
    name: row.profiles?.name ?? "Người dùng",
    avatar: row.profiles?.avatar ?? "",
    username: row.profiles?.username,
    role: row.role,
  };
}

export function mapConversationFromDb(row: DbConversation): Conversation {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar ?? "",
    preview: row.preview ?? "",
    time: "",
    unread: row.unread ?? 0,
    presence: (row.presence as Conversation["presence"]) ?? "offline",
    isGroup: row.is_group,
    description: row.description ?? undefined,
    members: (row.conversation_members ?? []).map(mapMemberFromDb),
  };
}

export function mapMessageFromDb(row: DbMessage): Message {
  // attachment là jsonb — nếu sendMessage KHÔNG còn JSON.stringify() (xem Bước 2.6),
  // supabase-js đã trả về object sẵn, không cần JSON.parse ở đây.
  return {
    id: row.id,
    author: row.author_id,
    text: row.text ?? undefined,
    attachment: (row.attachment as Attachment) ?? undefined,
    time: new Date(row.created_at).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    status: "sent",
  };
}
```

### Bước 2.6 — Sửa 2 lỗi trong `api.ts`

```ts
// src/lib/api.ts — fetchConversations(), production branch

// TRƯỚC — tên bảng "members" không khớp với schema thật (conversation_members):
const { data, error } = await supabase.from("conversations").select("*, members(*)");
// ...
return data as Conversation[];

// SAU:
import { mapConversationFromDb } from "./mappers";
const { data, error } = await supabase
  .from("conversations")
  .select("*, conversation_members(user_id, role, profiles(name, avatar, username))")
  .order("updated_at", { ascending: false });
if (error) throw new ApiError(500, error.message);
return (data ?? []).map(mapConversationFromDb);
```

```ts
// src/lib/api.ts — sendMessage(), production branch

// TRƯỚC — double-stringify: cột jsonb nhận 1 CHUỖI chứa JSON thay vì object:
attachment: msg.attachment ? JSON.stringify(msg.attachment) : null,

// SAU — để supabase-js tự serialize object thành jsonb đúng cách:
attachment: msg.attachment ?? null,
```

```ts
// src/lib/api.ts — fetchMessages(), production branch

// TRƯỚC:
return data as Message[];

// SAU:
import { mapMessageFromDb } from "./mappers";
return (data ?? []).map(mapMessageFromDb);
```

### Cách test

1. `npx supabase db reset` (local) — migration phải chạy sạch không lỗi, kể cả trigger.
2. Tạo 2 user test qua `supabase.auth.signUp()` (script nhỏ hoặc qua UI thật ở Phase 1 đã wiring) — xác nhận `profiles` tự có 2 dòng tương ứng nhờ trigger.
3. Tạo 1 conversation, thêm 2 thành viên, gửi 1 tin nhắn có `text` và 1 tin có `attachment` — kiểm tra trực tiếp trong Supabase Studio: `messages.attachment` phải là **object jsonb**, không phải chuỗi có dấu `\"` escape. `conversations.preview`/`updated_at` phải tự cập nhật sau khi gửi.
4. Gọi `fetchConversations()` từ code thật (qua Phase 1 đã wiring) — `conv.isGroup` phải đúng kiểu `boolean`, không phải `undefined`.
5. Thử policy: đăng nhập user A, cố đọc conversation mà A không phải thành viên — phải trả về rỗng, không lỗi 500 (nếu lỗi 500 "infinite recursion", kiểm tra lại đã dùng hàm helper `is_conversation_member`/`is_conversation_admin` đúng chưa thay vì query trực tiếp).

### Definition of Done

- [ ] `npx supabase db push` chạy thành công lên project thật.
- [ ] Trigger `on_auth_user_created` xác nhận hoạt động (test bằng signup thật).
- [ ] Trigger `on_message_created` xác nhận cập nhật đúng `preview`/`updated_at`.
- [ ] `src/lib/mappers.ts` tồn tại, được dùng trong `fetchConversations`/`fetchMessages`.
- [ ] Không còn `JSON.stringify(msg.attachment)` trong `sendMessage`.
- [ ] Select trong `fetchConversations` dùng đúng tên `conversation_members`.
- [ ] Test tay bước 3-5 ở trên pass.

### Rủi ro

Đây là phase duy nhất có thao tác **không thể tự động rollback dễ dàng** nếu đã có dữ liệu thật (đổi schema sau khi có data thật cần migration cẩn thận hơn) — nên làm kỹ ở giai đoạn chưa có người dùng thật, và luôn `supabase db diff` trước khi `db push` lên production project.

---

## Phase 3 — Upload file thật

**Mục tiêu:** File đính kèm được upload lên Supabase Storage thật, không còn phụ thuộc `File` object sống trong bộ nhớ trình duyệt.
**Điều kiện tiên quyết:** Phase 1 (wiring) + Phase 2 (schema, đặc biệt để biết `conversation_id` hợp lệ) xong.
**Effort:** 🟡 vừa (1-2 ngày).

### Bước 3.1 — Tạo bucket + policy Storage

Trong Supabase Dashboard (hoặc `supabase/config.toml` nếu quản lý bằng CLI): tạo bucket `attachments`, **không public toàn bộ** — dùng policy giới hạn theo `conversation_id` nằm trong path file (ví dụ path `attachments/{conversation_id}/{file_id}-{filename}`), kiểm tra người tải lên là thành viên conversation đó qua policy tương tự `is_conversation_member()` đã viết ở Phase 2.

### Bước 3.2 — Nối `lib/upload.ts` vào luồng gửi tin nhắn

Thay đoạn xây `Attachment` đồng bộ trong `submit()` (ChatifyApp.tsx) bằng luồng bất đồng bộ dùng `uploadFile`/`buildAttachment` đã có sẵn trong `lib/upload.ts`, kết hợp `useUpdateMessage` đã thêm ở Phase 1:

```tsx
import { uploadFile, buildAttachment } from "@/lib/upload";

const handleAttachmentSend = async (d: Draft) => {
  const tempId = crypto.randomUUID();
  const optimisticAttachment: Attachment = {
    kind: d.kind,
    name: d.name,
    size: d.size,
    url: d.url, // blob: tạm, hiện ngay cho mượt
  } as Attachment;

  sendMessage({
    id: tempId,
    author: "me",
    time: nowLabel(),
    status: "sending", // trạng thái mới đã có sẵn trong types.ts, giờ mới thực sự dùng
    attachment: optimisticAttachment,
  });

  try {
    const uploaded = await uploadFile(d.file!, activeId!, (progress) => {
      updateMessage(tempId, {
        attachment: { ...optimisticAttachment, uploadProgress: progress.percent } as Attachment,
      });
    });
    const finalAttachment = buildAttachment(uploaded, d.file!);
    updateMessage(tempId, { attachment: finalAttachment, status: "sent" });
  } catch (err) {
    updateMessage(tempId, { status: "failed" });
    toast.error("Không thể tải file lên. Thử gửi lại.");
  }
};
```

Hiện UI progress bar dùng `attachment.uploadProgress` (field đã tồn tại sẵn trong `types.ts` từ trước, chỉ chưa có nơi nào đọc nó) — thêm 1 thanh progress đơn giản trong `TicketStub` khi `status === "sending"`.

### Bước 3.3 — Tải folder từ dữ liệu backend

`file-transfer.ts` đã có sẵn ghi chú (comment) rằng tải folder từ dữ liệu backend cần fetch từng file con về trước rồi mới zip client-side — hiện phần đó chưa viết. Cần thêm hàm fetch song song danh sách file con (qua URL Storage đã lưu trong `att.children`) trước khi gọi hàm zip hiện có.

### Cách test

- Gửi ảnh/video/file, quan sát progress bar chạy đúng %, trạng thái chuyển `sending → sent`.
- Reload trang **sau khi** đã gửi qua Storage thật — ảnh/video phải hiển thị lại đúng (khác hẳn hành vi trước Phase 3, đây chính là điểm khác biệt cần xác nhận).
- Ngắt mạng giữa chừng lúc upload — trạng thái phải chuyển `failed`, có nút gửi lại (nếu UI đã có, hoặc note lại nếu cần thêm ở Phase 5).

### Definition of Done

- [ ] Bucket `attachments` + policy tồn tại trên Supabase project.
- [ ] `submit()` gọi `uploadFile`/`buildAttachment`, không còn set `source: d.file` trực tiếp vào message state.
- [ ] Progress bar hiển thị đúng trong lúc upload.
- [ ] Ảnh/video/file sống sót qua F5 khi đã upload xong (test tay xác nhận).

---

## Phase 4 — Realtime

**Mục tiêu:** Tin nhắn từ người khác/thiết bị khác xuất hiện không cần reload; trạng thái "đã nhận"/"đã đọc" hoạt động thật.
**Điều kiện tiên quyết:** Phase 2 xong (cần bảng `messages` thật để subscribe).
**Effort:** 🟡 vừa.

### Bước 4.1 — Subscribe Realtime cho tin nhắn

File mới `src/hooks/useRealtimeMessages.ts`:

```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { IS_DEMO_MODE } from "@/lib/config";
import { messageKeys } from "./useMessages";
import { mapMessageFromDb } from "@/lib/mappers";
import type { Message } from "@/lib/types";

export function useRealtimeMessages(convId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (IS_DEMO_MODE || !convId) return;
    const supabase = getSupabase();

    const channel = supabase
      .channel(`messages:${convId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const incoming = mapMessageFromDb(payload.new as Parameters<typeof mapMessageFromDb>[0]);
          queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) => {
            if (!old) return [incoming];
            if (old.some((m) => m.id === incoming.id)) return old; // tránh trùng với optimistic update của chính mình
            return [...old, incoming];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [convId, queryClient]);
}
```

Gọi hook này trong `ChatifyApp.tsx` ngay chỗ `activeId` được xác định.

### Bước 4.2 — Read receipts (`delivered`/`read`)

UI đã có sẵn icon cho `delivered`/`read` (chưa từng được set) — thay vì thêm cột `status` trên `messages` (không tự nhiên cho group chat vì mỗi thành viên đọc ở thời điểm khác nhau), dùng bảng riêng:

```sql
create table public.message_reads (
  message_id text not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
```

Client insert vào bảng này khi tin nhắn hiển thị trên màn hình (Intersection Observer hoặc đơn giản là khi mở conversation). UI suy ra "read" khi tồn tại dòng `message_reads` của người nhận, "delivered" khi Realtime đã đẩy tới nhưng chưa có `message_reads`.

### Bước 4.3 — Presence

Dùng Supabase Presence (`channel.track()`) thay cho field `presence` tĩnh hiện gán lúc tạo conversation.

### Definition of Done

- [ ] Mở 2 trình duyệt (hoặc 1 trình duyệt ẩn danh) đăng nhập 2 user khác nhau trong cùng conversation — tin nhắn từ bên này hiện ngay bên kia không cần F5.
- [ ] Icon `delivered`/`read` đổi đúng theo tương tác thật, không còn là dead code.
- [ ] `useEffect` cleanup gọi `removeChannel` đúng khi đổi conversation (kiểm tra không rò rỉ subscription qua tab Network/WS của DevTools).

---

## Phase 5 — Hoàn thiện các tính năng còn "chết"

**Mục tiêu:** Dọn các phần còn hardcode/không hoạt động, độc lập với nhau — có thể làm xen kẽ, không bắt buộc thứ tự nội bộ.
**Điều kiện tiên quyết:** Phase 1 xong (cần có `api.ts` đã wiring để mở rộng thêm hàm).
**Effort:** 🟢 nhỏ mỗi mục.

- **5.1 — Chọn thành viên thật khi tạo nhóm.** Bỏ mảng hardcode "Minh Anh/Hà Linh/Trung Nguyễn" trong `handleCreateConversation`. Thêm bước chọn từ danh sách bạn bè thật (giờ đã có qua `fetchFriends()`/view `friends` ở Phase 2) trong modal tạo nhóm.
- **5.2 — Profile persistence.** Thêm hàm `updateProfile()` vào `api.ts` (chưa tồn tại), update bảng `profiles`. Nối `onSave={setProfile}` hiện tại thành `onSave={(p) => updateProfileMutation.mutate(p)}`.
- **5.3 — Theme/mode persistence.** `STORAGE_KEYS.THEME`/`STORAGE_KEYS.MODE` đã khai báo trong `config.ts` nhưng chưa dùng — nối `handleThemeChange`/`handleModeChange` để ghi vào đó (demo mode: localStorage là đủ, không cần lên bảng `profiles`, đây là sở thích UI thuần tuý).
- **5.4 — Notifications thật.** Quyết định trước: tính năng này có thật sự cần cho v1 không? Nếu có: thêm bảng `notifications` + trigger tạo dòng mới khi có tin nhắn/lời mời kết bạn tới; nếu không cần ngay, ẩn hẳn mục Notifications khỏi UI thay vì để trống gây hiểu lầm là bug.

### Definition of Done (áp dụng cho từng mục 5.1-5.4 riêng)

- [ ] 5.1: tạo nhóm với danh sách thành viên do người dùng chọn thật, không còn tên hardcode nào trong code.
- [ ] 5.2: đổi tên/avatar/bio trong ProfileModal, F5 vẫn giữ nguyên.
- [ ] 5.3: đổi theme, F5 vẫn giữ nguyên.
- [ ] 5.4: hoặc notifications hoạt động thật, hoặc mục này bị ẩn khỏi UI có chủ đích (không để ở trạng thái nửa vời).

---

## Phase 6 — Hardening bảo mật & routing

**Mục tiêu:** Thu hẹp khoảng cách giữa "chạy được" và "an toàn khi có người dùng thật".
**Điều kiện tiên quyết:** Phase 2 (RLS) xong.
**Effort:** 🟡 vừa.

- **6.1 — Route guard server-side.** `routes/index.tsx` hiện chỉ check auth trong `useEffect` (client-only, có flash trắng, không chặn SSR). Chuyển sang `beforeLoad` của TanStack Router hoặc middleware trong `start.ts` (đã có cơ chế `createMiddleware` sẵn trong file này) — đọc cookie session phía server trước khi render.
- **6.2 — Invite code sinh ở server.** Hiện `generateInviteCode()` (kể cả bản mới trong `api.ts`) vẫn để client tự sinh mã rồi insert — dưới tải cao có thể trùng (dù đã dùng `crypto.randomUUID()` thay `Math.random()`, rủi ro thấp nhưng không phải zero). Chuyển sang Supabase Edge Function nếu cần chuẩn hoá tuyệt đối; với quy mô nhỏ, thêm `unique` constraint (đã có trong schema Phase 2) + retry-on-conflict ở client là đủ cho v1.
- **6.3 — Audit RLS toàn bộ bảng.** Dùng Supabase Dashboard → Advisor để quét cảnh báo RLS tự động, đối chiếu với danh sách policy đã viết ở Phase 2.

### Definition of Done

- [ ] Người chưa đăng nhập truy cập `/` bị redirect ở tầng server, không thấy nội dung SSR của trang chat dù chỉ trong 1 frame.
- [ ] Supabase Advisor không còn cảnh báo "RLS disabled" cho bảng nào.
- [ ] Thử trực tiếp gọi REST API Supabase bằng anon key + không đăng nhập — mọi request tới `messages`/`conversations` phải bị RLS chặn.

---

## Phase 7 — CI/CD & dọn dẹp

**Mục tiêu:** Giảm nợ kỹ thuật vận hành, không liên quan tính năng.
**Điều kiện tiên quyết:** không có — làm song song bất kỳ lúc nào.
**Effort:** 🟢 nhỏ.

- **7.1** Chọn 1 package manager. Xoá `bun.lock` **hoặc** `package-lock.json` (không giữ cả 2 — hiện đang có cả 2 lockfile sinh cách nhau ~19 tiếng, dấu hiệu ai đó lỡ dùng `npm install` thay vì `bun add`).
- **7.2** `npm run format` (Prettier) toàn repo 1 lần, commit riêng (không lẫn với commit sửa logic, để diff review dễ).
- **7.3** Thêm script `"typecheck": "tsc --noEmit"` vào `package.json`.
- **7.4** Thêm GitHub Actions workflow chạy `typecheck` + `lint` + `build` trên mỗi PR — hiện chưa có CI nào.
- **7.5** Ghi rõ trong `README.md`/`CLAUDE.md`: biến `VITE_SUPABASE_*` phải có mặt **lúc build** (CI hoặc `.env.local`), không phải chỉ set secret runtime trên Cloudflare — đã xác minh bằng cách build thật và grep vào bundle, đây là hành vi tĩnh của Vite, không phải giả định.

### Definition of Done

- [ ] Chỉ còn 1 lockfile trong repo.
- [ ] `npm run lint` không còn lỗi formatting hàng loạt (chỉ còn cảnh báo logic thật sự nếu có).
- [ ] CI chạy xanh trên PR test.
- [ ] README có đoạn hướng dẫn build với env thật rõ ràng.

---

## Phase 8 — WebRTC cho tính năng gọi (ngoài phạm vi, làm riêng)

`CallModal` hiện là UI thuần (không `getUserMedia`/`RTCPeerConnection`), có cờ `FEATURE_CALLS = false` trong `config.ts` (khai báo nhưng chưa gate UI thật). Đây là hạng mục **độc lập hoàn toàn** với 7 phase trên — cần: signaling server (Supabase Realtime broadcast có thể dùng tạm cho signaling, nhưng media relay/TURN cần dịch vụ riêng như một STUN/TURN server hoặc dịch vụ bên thứ 3), xin quyền camera/mic, xử lý NAT traversal. Khuyến nghị tách thành 1 kế hoạch riêng, không gộp vào lần tích hợp backend chat cơ bản này — chỉ nêu ở đây để không quên, không đi sâu.

---

## Phụ lục A — Checklist tổng hợp

```markdown
## Phase 0 — Vá regression

- [x] 0.1 addEntries() tạo url cho file thường
- [x] 0.2 submit() set url cho video/file attachment
- [x] 0.3 Toaster mounted + try/catch ở 3 nơi gọi downloadAttachment
- [x] 0.4 FolderCard không còn tạo file giả
- [x] Test tay 4 loại attachment + tsc/build sạch

## Phase 1 — Wiring

- [x] Conversations qua useConversations()
- [x] Messages qua useMessages()/useSendMessage()
- [x] Search/Invite/Friend request qua api.ts, xoá fabrication cũ
- [x] Test hành vi demo mode khớp bản trước Phase 1

## Phase 2 — Schema thật

- [x] Supabase project + CLI init/link
- [x] Migration init_schema + rls_policies + triggers chạy sạch
- [x] src/lib/mappers.ts + nối vào fetchConversations/fetchMessages
- [x] Xoá JSON.stringify() double-encode trong sendMessage
- [x] Test tay signup → profiles tự tạo, gửi tin → preview tự cập nhật

## Phase 3 — Upload thật

- [x] Bucket attachments + policy
- [x] submit() dùng uploadFile/buildAttachment + progress bar
- [x] Test ảnh/video/file sống sót qua F5

## Phase 4 — Realtime

- [x] useRealtimeMessages subscribe INSERT
- [x] Bảng message_reads + logic delivered/read
- [x] Presence qua Supabase Presence

## Phase 5 — Hoàn thiện tính năng

- [x] 5.1 Chọn thành viên thật khi tạo nhóm
- [x] 5.2 Profile persistence
- [x] 5.3 Theme/mode persistence
- [x] 5.4 Notifications thật hoặc ẩn hẳn

## Phase 6 — Hardening

- [ ] 6.1 Route guard server-side
- [ ] 6.2 Invite code chống trùng
- [ ] 6.3 Audit RLS qua Supabase Advisor

## Phase 7 — CI/CD

- [ ] 7.1 Xoá 1 trong 2 lockfile
- [ ] 7.2 Prettier toàn repo
- [ ] 7.3 Script typecheck
- [ ] 7.4 GitHub Actions CI
- [ ] 7.5 README env-at-build-time

## Phase 8 — WebRTC (riêng, không gấp)

- [ ] Lên kế hoạch riêng khi cần
```

---

## Phụ lục B — `CLAUDE.md` đầy đủ (copy nguyên vào root repo)

_(nội dung giống Mục 2.1 ở trên — copy trực tiếp)_

## Phụ lục C — `SKILL.md` đầy đủ (copy nguyên vào `.claude/skills/chatify-phase/SKILL.md`)

_(nội dung giống Mục 2.2 ở trên — copy trực tiếp)_
