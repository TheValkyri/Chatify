# Chatify — Kế hoạch Bổ sung Phase 14+ & Roadmap Tổng hợp (Master Plan — Part 3)

> Tiếp nối `Chatify-Backend-Master-Plan.md` (Phase 0-8) và `Chatify-Backend-Master-Plan-v2.md` (Phase 9-13). Tài liệu này xử lý các phát hiện MỚI từ lần audit trên backend Supabase **thật đang chạy** (project `vdpzrciejkmujagkmmrg`). Đã xác nhận qua `tsc --noEmit` (0 lỗi), `npm run build` (thành công), `eslint` (109 vấn đề, chi tiết bên dưới).

**Việc đầu tiên khi đọc file này: làm Phase 14 ngay hôm nay, không đợi đọc hết tài liệu.** Đây là lỗ hổng bảo mật đang active trên hệ thống thật.

---

## Phase 14 — VÁ KHẨN CẤP: Bucket Storage đang public + không kiểm tra quyền

**Mức độ:** 🔴 CRITICAL — làm trong ngày hôm nay, trước mọi việc khác.
**Điều kiện tiên quyết:** không có.

### 14.1 — Xác nhận mức độ ảnh hưởng trước khi sửa

Trước khi đổi bất cứ gì, vào **Supabase Dashboard → Storage → attachments → xem danh sách file** — nếu đã có người dùng thật từng gửi file, đây là dữ liệu đã từng ở trạng thái công khai. Không có cách nào "thu hồi" việc đã từng công khai (nếu ai đó đã tải về trong lúc đó), nhưng vá ngay sẽ chặn truy cập tiếp theo.

### 14.2 — Chuyển bucket sang private + policy đúng theo thành viên

Tạo migration mới (không sửa migration cũ đã push — sửa migration đã áp dụng rồi không tự chạy lại):

```bash
npx supabase migration new fix_storage_bucket_privacy
```

```sql
-- supabase/migrations/<timestamp>_fix_storage_bucket_privacy.sql

-- Chuyển bucket về private
UPDATE storage.buckets SET public = false WHERE id = 'attachments';

-- Xoá các policy cũ không kiểm tra quyền
DROP POLICY IF EXISTS "Allow public read access to attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update/delete their own attachments" ON storage.objects;

-- Policy mới: chỉ thành viên của đúng conversation (path = {conversation_id}/{file_id}.{ext})
-- mới đọc/ghi được — dùng lại hàm is_conversation_member() đã có sẵn từ Phase 2.
CREATE POLICY "attachments_select_member"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND public.is_conversation_member(split_part(name, '/', 1))
  );

CREATE POLICY "attachments_insert_member"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND auth.role() = 'authenticated'
    AND public.is_conversation_member(split_part(name, '/', 1))
  );

CREATE POLICY "attachments_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'attachments'
    AND auth.uid() = owner
  );
```

```bash
npx supabase db push
```

Sau khi push, xác nhận thủ công: đăng xuất hoàn toàn (hoặc dùng trình duyệt ẩn danh, không đăng nhập), thử mở trực tiếp 1 URL file cũ đã biết (dạng `https://vdpzrciejkmujagkmmrg.supabase.co/storage/v1/object/public/attachments/...`) — phải nhận lỗi 400/403, không còn xem được ảnh.

### 14.3 — Chuyển `getPublicUrl()` sang `createSignedUrl()` trong `upload.ts`

Vì bucket giờ private, URL công khai không còn phục vụ được nữa. Đổi cách lấy URL lúc upload, và — quan trọng hơn — đổi kiến trúc lưu trữ: **không bake URL đã ký (có hạn dùng) vào `messages.attachment` lúc gửi**, vì URL ký thường có hạn dùng (vài giờ tới vài ngày tuỳ cấu hình), không hợp cho tin nhắn cần xem lại nhiều tháng sau. Thay vào đó, lưu **storage path** (bền vững) và ký URL tại thời điểm hiển thị.

```ts
// src/lib/upload.ts

// TRƯỚC (production branch, sau khi upload xong):
const {
  data: { publicUrl },
} = supabase.storage.from("attachments").getPublicUrl(path);
// ... return { ..., url: publicUrl, thumbnailUrl: thumbUrl }

// SAU — lưu path, không lưu URL cố định:
// (path đã có sẵn: `${conversationId}/${id}.${ext}`)
return {
  id,
  url: path, // LƯU PATH, không phải URL — Attachment.url giờ mang ý nghĩa "storage key" ở production mode
  thumbnailUrl: file.type.startsWith("image/") ? path : undefined,
  name: file.name,
  size: file.size,
  contentType: file.type,
};
```

Thêm 1 hàm MỚI để ký URL tại thời điểm hiển thị/tải:

```ts
// src/lib/upload.ts — hàm MỚI
export async function getAttachmentSignedUrl(path: string, expiresInSec = 3600): Promise<string> {
  if (IS_DEMO_MODE) return path; // demo mode: path đã là blob: URL sẵn, dùng thẳng
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, expiresInSec);
  if (error) throw new Error(`Không thể tạo link tải: ${error.message}`);
  return data.signedUrl;
}
```

Ở nơi hiển thị (`TicketStub`, `FileCard`, lightbox) và ở `downloadAttachment()` trong `file-transfer.ts`: gọi `getAttachmentSignedUrl(att.url)` để lấy URL thật ngay trước khi `fetch()`/hiển thị `<img src>`, thay vì dùng thẳng `att.url` như hiện tại. Cân nhắc cache ngắn hạn (React Query, `staleTime` ~50 phút nếu `expiresInSec=3600`) để tránh ký lại URL mỗi lần re-render.

**Đây là thay đổi kiến trúc thật, không phải 1 dòng sửa** — nên tách riêng, test kỹ trên staging (sau khi có, xem Phase 15) trước khi áp dụng lên production.

### Cách test

1. Gửi 1 ảnh mới sau khi vá — mở DevTools Network, xác nhận URL hiển thị có dạng `.../object/sign/attachments/...?token=...` (không phải `/object/public/...`).
2. Thử copy URL đó, mở ở trình duyệt khác (chưa đăng nhập) trong vòng thời hạn ký — vẫn xem được (vì signed URL tự chứa quyền truy cập tạm thời, đây là hành vi ĐÚNG của signed URL, không phải lỗ hổng — khác về bản chất với việc AI CŨNG đoán được URL mà không cần link được cấp).
3. Thử gọi trực tiếp REST API Storage bằng anon key, không có URL đã ký, không đăng nhập — phải bị từ chối.

### Definition of Done

- [ ] Bucket `public = false`.
- [ ] 3 policy mới dựa trên `is_conversation_member()`/`owner` thay thế 3 policy cũ.
- [ ] `upload.ts` lưu path, có hàm `getAttachmentSignedUrl()`.
- [ ] Mọi nơi hiển thị/tải attachment gọi qua hàm ký URL, không dùng path trực tiếp làm `src`/`fetch()`.
- [ ] Test tay bước 1-3 ở trên.

---

## Phase 15 — Dọn dữ liệu rác trên project thật + tách staging

**Mức độ:** 🟠 HIGH — làm ngay sau Phase 14.

### 15.1 — Xoá tài khoản test rác

`scripts/smoke-test.cjs` đã tạo các tài khoản `test_user_1_<timestamp>@example.com`/`test_user_2_<timestamp>@example.com` mỗi lần chạy (dù chạy có thành công hết hay không — Test 1-2 vẫn tạo tài khoản thật trước khi có thể lỗi ở Test 4). Vào **Supabase Dashboard → Authentication → Users**, lọc theo `test_user_` hoặc `@example.com`, xoá thủ công toàn bộ.

### 15.2 — Sửa `smoke-test.cjs` khớp đúng schema thật

```js
// scripts/smoke-test.cjs

// TRƯỚC — Test 4:
const { data: group, error: groupError } = await client1
  .from("conversations")
  .insert({ name: "Smoke Test Group", is_group: true, created_by: user1Id })
  .select()
  .single();

// SAU — thêm id, bỏ created_by (không tồn tại trong schema):
const { randomUUID } = require("crypto");
const groupId = `smoke_${randomUUID()}`;
const { data: group, error: groupError } = await client1
  .from("conversations")
  .insert({ id: groupId, name: "Smoke Test Group", is_group: true })
  .select()
  .single();
```

```js
// TRƯỚC — Test 6:
const { data: message, error: messageError } = await client1
  .from("messages")
  .insert({ conversation_id: group.id, author: user1Id, content: "Hello from Smoke Test User 1!" })
  .select()
  .single();

// SAU — đúng tên cột author_id/text, thêm id:
const messageId = `smoke_msg_${randomUUID()}`;
const { data: message, error: messageError } = await client1
  .from("messages")
  .insert({
    id: messageId,
    conversation_id: group.id,
    author_id: user1Id,
    text: "Hello from Smoke Test User 1!",
  })
  .select()
  .single();
```

```js
// TRƯỚC — Test 7:
const { data: readRec, error: readError } = await client2
  .from("message_reads")
  .insert({ message_id: message.id, conversation_id: group.id, user_id: user2Id })
  .select()
  .single();

// SAU — bỏ conversation_id (không tồn tại trong bảng message_reads):
const { data: readRec, error: readError } = await client2
  .from("message_reads")
  .insert({ message_id: message.id, user_id: user2Id })
  .select()
  .single();
```

Đồng thời thêm bước dọn dẹp tài khoản test thật bằng Admin API (cần `service_role` key — **CHỈ chạy script này ở máy local, KHÔNG BAO GIỜ đưa `service_role` key vào `.env.local`/commit vào repo**, chỉ nhập tay khi chạy script 1 lần):

```js
// Thêm cuối main(), sau phần dọn dữ liệu hiện có — cần biến SUPABASE_SERVICE_ROLE_KEY
// truyền qua biến môi trường khi chạy script, KHÔNG lưu vào file:
// SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/smoke-test.cjs
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const adminClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await adminClient.auth.admin.deleteUser(user1Id);
  await adminClient.auth.admin.deleteUser(user2Id);
  console.log("✅ Đã xoá 2 tài khoản test qua Admin API!");
} else {
  console.warn(
    "⚠️ Không có SUPABASE_SERVICE_ROLE_KEY — tài khoản test KHÔNG được tự động xoá. Xoá thủ công qua Dashboard.",
  );
}
```

### 15.3 — Tách project staging

```bash
npx supabase projects create chatify-staging --org-id qnwtycrsaymlgtilpjsv --region <region-gần-VN>
npx supabase link --project-ref <staging-ref>
npx supabase db push
```

Từ giờ, MỌI lần chạy `smoke-test.cjs`/thử nghiệm tính năng mới đều nhắm vào staging (`.env.local` trỏ `VITE_SUPABASE_URL` của staging), không đụng vào `vdpzrciejkmujagkmmrg` nữa cho tới khi thật sự sẵn sàng go-live.

### Definition of Done

- [ ] Không còn tài khoản `test_user_`/`@example.com`/`smoke_` nào trong Authentication → Users của project `vdpzrciejkmujagkmmrg`.
- [ ] `smoke-test.cjs` chạy hết 8 test không lỗi trên project **staging** mới.
- [ ] `.env.local` (dev hàng ngày) trỏ vào staging, không phải project gốc.

---

## Phase 16 — Hoàn thiện luồng Kết bạn (accept/reject)

**Mức độ:** 🟠 HIGH.

### 16.1 — Thêm hàm API

```ts
// src/lib/api.ts — 2 hàm MỚI

export type IncomingFriendRequest = {
  id: string;
  fromUserId: string;
  fromName: string;
  fromAvatar: string;
  message?: string;
  createdAt: string;
};

export async function fetchIncomingFriendRequests(): Promise<IncomingFriendRequest[]> {
  if (IS_DEMO_MODE) return [];

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("friend_requests")
    .select(
      "id, from_user_id, message, created_at, profiles!friend_requests_from_user_id_fkey(name, avatar)",
    )
    .eq("status", "pending");
  if (error) throw new ApiError(500, error.message);

  return (data ?? []).map((r: any) => ({
    id: r.id,
    fromUserId: r.from_user_id,
    fromName: r.profiles?.name ?? "Người dùng",
    fromAvatar: r.profiles?.avatar ?? "",
    message: r.message ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function respondToFriendRequest(
  requestId: string,
  action: "accept" | "reject",
): Promise<void> {
  if (IS_DEMO_MODE) return;

  const supabase = getSupabase();
  const { error } = await supabase
    .from("friend_requests")
    .update({ status: action === "accept" ? "accepted" : "rejected" })
    .eq("id", requestId);
  if (error) throw new ApiError(500, error.message);
}
```

Lưu ý: tên constraint `friend_requests_from_user_id_fkey` là tên PostgREST tự sinh theo quy ước `{table}_{column}_fkey` — xác nhận lại tên chính xác qua Supabase Studio (**Database → Tables → friend_requests → xem tên foreign key**) trước khi dùng, vì nếu migration được áp dụng qua đường khác (không đúng thứ tự), tên constraint có thể khác.

### 16.2 — Thêm UI tối thiểu

Có thể tận dụng luôn khu vực Notifications đang bị bỏ trống (`seedNotifications = []`, xem Phase 12.5/#27) thay vì làm màn hình riêng — biến nó thành nơi hiển thị lời mời kết bạn đang chờ:

```tsx
// Trong component Notifications hiện có, thay nội dung rỗng bằng:
const { data: incomingRequests = [] } = useQuery({
  queryKey: ["friend-requests", "incoming"],
  queryFn: fetchIncomingFriendRequests,
  enabled: !IS_DEMO_MODE,
});

// render mỗi request: tên + 2 nút Chấp nhận/Từ chối gọi respondToFriendRequest(id, "accept"|"reject")
// sau khi thành công: queryClient.invalidateQueries({ queryKey: ["friend-requests", "incoming"] })
// và queryClient.invalidateQueries({ queryKey: ["friends"] }) để danh sách bạn bè cập nhật ngay
```

### Definition of Done

- [ ] Tài khoản A gửi lời mời tới B → B thấy lời mời trong mục Notifications.
- [ ] B bấm Chấp nhận → `fetchFriends()` của cả A và B đều trả về nhau.
- [ ] B bấm Từ chối → request biến mất, không xuất hiện trong `friends` view.

---

## Phase 17 — Sửa 2 lỗi silent-failure còn lại

**Mức độ:** 🟠 HIGH, effort nhỏ.

### 17.1 — Bỏ fabrication `id: "them"` khi tạo DM mới

```tsx
// ChatifyApp.tsx, trong handleCreateConversation, nhánh else (!isGroup, không tìm thấy otherId)

// TRƯỚC:
} else {
  selectedMembers.push({ id: "them", name, avatar: newAvatar, role: "member" as const });
}

// SAU:
} else {
  toast.error("Không thể bắt đầu trò chuyện — không tìm thấy người dùng này.");
  return; // KHÔNG tạo conversation với thành viên giả
}
```

Và thêm `onError` cho `createConvMutation` ở dòng gọi (`createConvMutation.mutate(newConv)`):

```tsx
createConvMutation.mutate(newConv, {
  onError: (err) => {
    toast.error(err instanceof Error ? err.message : "Không thể tạo cuộc trò chuyện.");
  },
});
```

### 17.2 — Mở rộng lookup thành viên khi tạo nhóm (vá #18)

Thêm hàm tra cứu trực tiếp bảng `profiles` làm fallback khi không tìm thấy qua `mappedConvs`:

```ts
// src/lib/api.ts — hàm MỚI
export async function fetchProfilesByIds(ids: string[]): Promise<Member[]> {
  if (ids.length === 0) return [];
  if (IS_DEMO_MODE) return []; // demo mode không có bảng profiles thật để tra

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, avatar, username")
    .in("id", ids);
  if (error) throw new ApiError(500, error.message);
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    role: "member" as const,
  }));
}
```

Trong `handleCreateConversation`, sau vòng lặp `memberIds.forEach(...)` hiện tại, thu thập những `id` không tìm thấy qua `mappedConvs`, gọi `fetchProfilesByIds()` cho phần còn thiếu, gộp kết quả vào `selectedMembers` trước khi `createConvMutation.mutate()`.

### Definition of Done

- [ ] Bấm "Nhắn tin" với người chưa từng DM → hoặc thành công tạo DM thật, hoặc báo lỗi rõ ràng — không còn im lặng.
- [ ] Tạo nhóm mời người chưa từng DM riêng → người đó vẫn xuất hiện đúng trong nhóm mới.

---

## Phase 18 — Hoàn thiện cookie refresh phía server

**Mức độ:** 🟠 HIGH (không khẩn cấp bằng Phase 14 vì chưa gây lỗi hiển nhiên ngay, nhưng nên làm sớm).

Cần nghiên cứu API chính xác của phiên bản `@tanstack/react-start` đang dùng để set response header từ trong 1 `createServerFn` handler (thường có dạng `setResponseHeader`/tương tự export từ `@tanstack/react-start/server`, cạnh `getRequest`). Việc cần làm về nguyên tắc:

```ts
// src/lib/auth.ts — getServerUser, ý tưởng sửa (xác nhận đúng tên API set-header hiện hành trước khi áp dụng)
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
      if (key.toLowerCase() === "set-cookie") setResponseHeader("Set-Cookie", value);
    });

    if (error || !user) return null;
    // ... phần còn lại giữ nguyên
  } catch (e) {
    console.error("Lỗi auth server-side:", e);
    return null;
  }
});
```

**Lưu ý quan trọng:** tên hàm `setResponseHeader` ở trên là ĐẠI DIỆN cho ý tưởng, không phải tên API đã xác minh — vì đây là chi tiết phụ thuộc phiên bản `@tanstack/react-start` cụ thể đang được dùng trong `package.json`, cần tra đúng tài liệu/type definition tại thời điểm sửa (`node_modules/@tanstack/react-start/server` để xem export thật) thay vì tin theo tên gọi ở đây.

### Cách test

Khó test bằng tay trong thời gian ngắn (cần đợi access token hết hạn, mặc định ~1 giờ) — cách test nhanh hơn: vào Supabase Dashboard → Authentication → Settings, tạm thời hạ `JWT expiry` xuống ~60 giây cho môi trường **staging**, đăng nhập, đợi hơn 60 giây, F5 lại trang — xác nhận vẫn ở trạng thái đăng nhập VÀ cookie trong DevTools → Application → Cookies có giá trị mới (khác trước khi F5). Nhớ trả `JWT expiry` về giá trị mặc định sau khi test xong.

### Definition of Done

- [ ] Xác nhận đúng API set-response-header hiện hành của `@tanstack/react-start` (đọc trong `node_modules`, không đoán).
- [ ] Test bằng cách hạ JWT expiry tạm thời trên staging — session sống sót qua F5 sau khi access token hết hạn.

---

## Phase 19 — Dọn nhỏ còn lại

**Mức độ:** 🟡/🟢, làm khi rảnh, không chặn gì.

- [ ] 19.1 — `npm run format` toàn repo, commit riêng (giải quyết 96/100 lỗi eslint hiện tại).
- [ ] 19.2 — Gõ kiểu rõ cho `supabase.ts` (`_supabaseBrowser: SupabaseClient | null`, bỏ 3 chỗ `any`) và `useRealtimeMessages.ts` (dòng 26).
- [ ] 19.3 — Escape ký tự đặc biệt trong `searchUsers()`'s `.or()` filter (#20) — ví dụ hàm nhỏ `escapePostgrestValue(s: string) { return s.replace(/[,.()]/g, "\\$&"); }` áp dụng cho `query` trước khi nội suy.
- [ ] 19.4 — Chuyển `incrementInviteUsage` sang RPC atomic (#23):
  ```sql
  create or replace function public.increment_invite_uses(invite_code text)
  returns void language sql security definer as $$
    update public.invite_codes set uses = uses + 1 where code = invite_code;
  $$;
  ```
  rồi `api.ts` gọi `supabase.rpc("increment_invite_uses", { invite_code: code })` thay vì đọc-rồi-ghi.
- [ ] 19.5 — Xoá `scripts/verify-supabase.js` (giữ lại `.cjs`, xoá bản trùng).
- [ ] 19.6 — Thêm `supabase/.temp` vào `.gitignore`.
- [ ] 19.7 — Quyết định dứt điểm Notifications: giờ đã có nội dung thật để hiển thị (lời mời kết bạn từ Phase 16) — không còn lý do để ẩn, nên hoàn thiện luôn thay vì để nửa vời.
- [ ] 19.8 — Viết `.github/workflows/deploy.yml` với secret thật (xem Phần B.4 của Master Plan Part 2) — hiện vẫn đang deploy tay.
- [ ] 19.9 — Chuyển 2 file kế hoạch vào `docs/` (`Chatify-Backend-Master-Plan.md`, `-v2.md`, `-v3.md` này) thay vì để ở root cho gọn cấu trúc.

---

## Roadmap tổng hợp CUỐI CÙNG (toàn bộ 19 phase, trạng thái tính đến audit này)

```markdown
## ĐÃ XONG (xác nhận bằng code, không phải tự khai)

- [x] Phase 0 — Vá regression tải file
- [x] Phase 1 — Wiring API/hooks vào UI
- [x] Phase 2 — Schema Supabase + RLS + mapper layer
- [x] Phase 3 — Upload file thật lên Storage
- [x] Phase 4 — Realtime tin nhắn
- [x] Phase 5 — 5.1 (chọn thành viên thật khi tạo nhóm — 1 phần, xem #18/17.2)
- [x] Phase 7 — 7.1 (1 lockfile), 7.4 (CI cơ bản)
- [x] Phase 9 — Vá định danh "me" → session.id
- [x] Phase 10 — Rời nhóm / Tham gia nhóm qua mã mời
- [x] Phase 11 — Sửa chữ ký SQL message_reads
- [x] Phase 12 — 12.1, 12.2, 12.3, 12.4 (FolderCard, try/catch, nhãn, xoá any cũ)
- [x] Phase 13 — Chuyển sang @supabase/ssr (đọc cookie phía server) — MỘT PHẦN, xem Phase 18

## ĐANG LÀM DỞ / MỚI PHÁT HIỆN — thứ tự làm tiếp

- [ ] Phase 14 — 🔴 VÁ NGAY: bucket public + policy storage rỗng
- [ ] Phase 15 — Dọn tài khoản test rác + tách staging
- [ ] Phase 16 — Hoàn thiện accept/reject kết bạn
- [ ] Phase 17 — Bỏ fabrication "them", mở rộng lookup thành viên nhóm
- [ ] Phase 18 — Hoàn thiện ghi lại cookie khi refresh token
- [ ] Phase 19 — Dọn nhỏ (format, any, escape filter, RPC atomic, xoá file trùng, gitignore, notifications, deploy workflow, tổ chức lại docs/)

## CHƯA LÀM, VẪN CÒN TỪ KẾ HOẠCH TRƯỚC

- [ ] Phase 5.2-5.4 — Profile/theme persistence (chưa audit lại lần này, ưu tiên thấp)
- [ ] Phase 6 — Hardening bảo mật khác ngoài Storage (audit RLS còn lại qua Supabase Advisor — cần bạn tự chạy vì tôi không có quyền truy cập Dashboard)
- [ ] Phase 8 — WebRTC cho tính năng gọi (ngoài phạm vi, làm riêng khi cần)
```

---

## Cập nhật hướng dẫn Skill / Cấu trúc AI Agent

Xác nhận qua audit: repo hiện có `CLAUDE.md` (đã cập nhật tốt, mô tả đúng mapper layer + yêu cầu env-at-build-time), `AGENTS.md` (vẫn chỉ có banner Lovable gốc, chưa từng được bổ sung phần trỏ tới kế hoạch backend như tôi gợi ý ở Part 2), `.agents/skills/` (2 skill Codex không đổi), và **chưa có `.claude/skills/chatify-phase/`**. Cả 3 file kế hoạch (Part 1, 2, và giờ Part 3 này) đang nằm ở root repo.

**Điều này cho thấy: công cụ thực thi 2 lần vừa qua nhiều khả năng là Claude Code (hoặc tương đương) được cung cấp trực tiếp nội dung file kế hoạch làm ngữ cảnh, KHÔNG thông qua cơ chế Skill chính thức** — và cách này vẫn đang hoạt động hiệu quả (bằng chứng: Phase 9-13 được thực thi rất trung thành). Vì vậy tôi không đề xuất thay đổi lớn về quy trình — chỉ 2 điều chỉnh nhỏ, thực tế, dựa trên bằng chứng đã thấy chứ không phải lý thuyết:

### 1. Cập nhật `CLAUDE.md` — thêm đúng 2 dòng, không viết lại toàn bộ

Bản `CLAUDE.md` hiện tại đã tốt — chỉ thiếu 2 điều mà chính lần audit này phát hiện ra là chỗ hổng thực sự (không phải suy đoán): storage bucket phải private, và có tài liệu kế hoạch cần đọc trước khi tự ý thêm tính năng mới. Thêm vào cuối file hiện có:

```markdown
## Bảo mật Storage (quan trọng — đã từng bị cấu hình sai)

Bucket `attachments` PHẢI là private (`public: false`), mọi policy PHẢI dựa trên
`is_conversation_member()`. KHÔNG dùng `getPublicUrl()` — dùng `createSignedUrl()`
qua `getAttachmentSignedUrl()` trong `lib/upload.ts`. Nếu thấy `public: true` ở bất
kỳ đâu trong migration mới, đó là lỗi, không phải tính năng.

## Trước khi thêm phase mới

Đọc `Chatify-Backend-Master-Plan*.md` (Part 1/2/3) để biết phase nào đã xong,
đang làm dở, hay đã bị phát hiện có vấn đề — tránh làm lại việc đã xong hoặc
lặp lại lỗi đã từng vá.
```

### 2. Với `AGENTS.md` (nếu Codex/công cụ khác cũng chạm vào repo)

Vẫn giữ nguyên khuyến nghị từ Part 2 — thêm đoạn trỏ tới các file kế hoạch, vì hiện tại `AGENTS.md` sau 3 lần audit vẫn y nguyên banner gốc, nghĩa là công cụ đọc `AGENTS.md` (nếu có) chưa từng được cung cấp ngữ cảnh về kế hoạch backend này.

### 3. KHÔNG cần tạo `.claude/skills/chatify-phase/` nữa

Ở Part 1 tôi có đề xuất formalize thành 1 Skill riêng. Sau khi thấy quy trình "đưa thẳng file .md làm ngữ cảnh" đã chạy tốt qua 2 vòng thực thi liên tiếp (bằng chứng cụ thể: Phase 9-13 khớp gần như nguyên văn với những gì tôi viết), tôi rút lại khuyến nghị đó — **thêm nghi lễ (ceremony) không cần thiết khi cách hiện tại đã chứng minh hiệu quả**. Việc quan trọng hơn nhiều là: mỗi lần giao việc cho agent, hãy **đính kèm rõ "đọc kỹ file kế hoạch mới nhất trước, đối chiếu Definition of Done, và đặc biệt: sau khi sửa 1 hàm, tìm mọi nơi gọi hàm liên quan để không bỏ sót đường code cũ song song"** — đây là loại lỗi đã lặp lại nhiều lần nhất qua các vòng audit (FolderCard bị bỏ sót lần 1, handleJoinGroup bị bỏ sót lần 2, và lần này là bucket storage được tạo mới nhưng không đối chiếu với nguyên tắc bảo mật đã ghi trong Part 2's Phần B.3).

### 4. Tổ chức lại vị trí file (19.9, nhắc lại ở đây vì liên quan)

Chuyển cả 3 file kế hoạch vào `docs/`:

```bash
mkdir -p docs
git mv Chatify-Backend-Master-Plan.md docs/
git mv Chatify-Backend-Master-Plan-v2.md docs/
git mv Chatify-Backend-Master-Plan-v3.md docs/   # file này, sau khi tải về và thêm vào repo
```

Và sửa dòng trỏ trong `CLAUDE.md` (`docs/Chatify-Backend-Master-Plan*.md`) cho khớp.

---

## Phụ lục — Checklist Phase 14-19

```markdown
## Phase 14 — CRITICAL: Storage bucket

- [ ] Kiểm tra mức độ ảnh hưởng qua Dashboard trước khi sửa
- [ ] Migration mới: public=false, xoá 3 policy cũ, thêm 3 policy mới dựa trên is_conversation_member
- [ ] db push, test bằng trình duyệt ẩn danh không đăng nhập
- [ ] upload.ts lưu path thay vì getPublicUrl, thêm getAttachmentSignedUrl()
- [ ] Mọi nơi hiển thị/tải attachment gọi qua hàm ký URL mới

## Phase 15 — Dọn dữ liệu + tách staging

- [ ] Xoá tài khoản test*user*/@example.com/smoke\_ qua Dashboard
- [ ] Sửa smoke-test.cjs khớp author_id/text, thêm id, bỏ conversation_id thừa
- [ ] Thêm bước xoá qua Admin API (service_role, chỉ nhập tay lúc chạy)
- [ ] Tạo project chatify-staging, chuyển .env.local sang đó

## Phase 16 — Kết bạn hoàn chỉnh

- [ ] fetchIncomingFriendRequests() + respondToFriendRequest()
- [ ] UI hiển thị + chấp nhận/từ chối trong Notifications
- [ ] Test 2 tài khoản: gửi → chấp nhận → cả 2 thấy nhau trong friends

## Phase 17 — Vá 2 silent-failure

- [ ] Bỏ id: "them", thêm toast lỗi rõ ràng
- [ ] onError cho createConvMutation
- [ ] fetchProfilesByIds() làm fallback lookup thành viên nhóm

## Phase 18 — Cookie refresh write-back

- [ ] Xác nhận đúng API set-response-header của @tanstack/react-start đang dùng
- [ ] Nối resHeaders thật vào getSupabaseServer() trong getServerUser()
- [ ] Test bằng cách hạ JWT expiry tạm thời trên staging

## Phase 19 — Dọn nhỏ

- [ ] 19.1 npm run format
- [ ] 19.2 Xoá 4 any mới (supabase.ts x3, useRealtimeMessages.ts x1)
- [ ] 19.3 Escape ký tự đặc biệt trong searchUsers .or() filter
- [ ] 19.4 incrementInviteUsage → RPC atomic
- [ ] 19.5 Xoá verify-supabase.js (giữ .cjs)
- [ ] 19.6 Thêm supabase/.temp vào .gitignore
- [ ] 19.7 Hoàn thiện Notifications (giờ có nội dung thật từ Phase 16)
- [ ] 19.8 .github/workflows/deploy.yml với secret thật
- [ ] 19.9 Chuyển 3 file kế hoạch vào docs/
```
