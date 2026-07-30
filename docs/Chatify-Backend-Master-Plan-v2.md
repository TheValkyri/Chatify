# Chatify — Kế hoạch Bổ sung & Hướng dẫn Setup Backend Thật (Master Plan — Part 2)

> Tiếp nối `Chatify-Backend-Master-Plan.md` (Phase 0-8). Tài liệu này dựa trên audit bản mới nhất — đã chạy `tsc --noEmit` (0 lỗi), `eslint` (12 vấn đề, giảm từ 167), `npm run build` (thành công cả 3 bundle). Mọi số dòng/tên hàm trỏ đúng source thật tại thời điểm audit.

**Đánh giá:** ~85% sẵn sàng. Phase 0-7 của kế hoạch trước đã được thực thi rất trung thành (nhiều đoạn code trùng khớp gần như nguyên văn). Phần còn thiếu không phải kiến trúc mà là **3 bug cụ thể, khoanh vùng được, nhưng ở mức chặn hoàn toàn** — đó là lý do tài liệu này gồm cả kế hoạch vá lỗi (Phần A) lẫn hướng dẫn dựng backend thật (Phần B), vì viết code đúng (đã xong phần lớn) và có hạ tầng thật đang chạy (chưa có — chưa từng có project Supabase thật, chưa có bucket thật) là hai việc khác nhau.

---

## PHẦN A — Kế hoạch bổ sung (vá để đạt 100%)

### Phase 9 — Vá lỗi định danh người dùng (CRITICAL, làm đầu tiên, chặn mọi thứ khác)

**Mục tiêu:** Thay toàn bộ chuỗi literal `"me"` bằng `session.id` (UUID thật) — đây là nguyên nhân khiến gửi tin nhắn, rời nhóm, chuyển quyền chủ nhóm đều sẽ lỗi khi có backend thật.
**Effort:** 🟢 nhỏ nhưng phải cẩn thận (đây là tìm-và-thay có kiểm chứng, không phải đổi bừa).

**11 vị trí xác nhận trong `ChatifyApp.tsx`:** dòng 436, 463, 464, 486, 1223, 1278, 1383, 2202, 2204, 2239, 2246 (chạy `grep -n '"me"' src/components/chatify/ChatifyApp.tsx` để xác nhận danh sách còn đúng trước khi sửa, vì số dòng có thể lệch nếu đã có thay đổi khác).

**Cách sửa — theo từng nhóm:**

1. **Message authorship** (dòng 1223, 1278 trong `submit()`/`handleAttachmentSend()`):

   ```tsx
   // TRƯỚC
   author: "me",
   // SAU
   author: session.id,
   ```

2. **So sánh "đây có phải tin của tôi không"** (dòng 1383, trong `MessageRow`) — hàm này hiện KHÔNG nhận `session`/`currentUserId` làm prop, cần thêm:

   ```tsx
   // TRƯỚC
   function MessageRow({ m, onPreview }: { m: Message; onPreview: (att: Attachment) => void }) {
     const isMe = m.author === "me";

   // SAU
   function MessageRow({
     m,
     onPreview,
     currentUserId,
   }: {
     m: Message;
     onPreview: (att: Attachment) => void;
     currentUserId: string;
   }) {
     const isMe = m.author === currentUserId;
   ```

   Và tại nơi gọi (dòng 1321): `<MessageRow key={m.id} m={m} onPreview={onPreview} currentUserId={session.id} />` — nghĩa là component cha bao `MessageRow` cũng cần nhận `session`/`currentUserId` làm prop nếu chưa có. Kiểm tra bằng cách lần ngược từ `MessageRow` lên tới `ChatifyApp` — nếu có 1-2 lớp component trung gian chưa nhận `session`, thêm prop `currentUserId: string` xuyên suốt (không cần truyền cả object `session`, chỉ cần `id`).

3. **Thành viên nhóm khi tạo/join** (dòng 436, 2202): `{ id: "me", name: me.name, avatar: me.avatar, role: "member" as const }` → `{ id: session.id, name: session.name, avatar: session.avatar, role: "member" as const }`.

4. **Kiểm tra tư cách thành viên/chủ nhóm** (dòng 463, 464, 2204, 2239, 2246): mọi so sánh `m.id === "me"` / `m.id !== "me"` → `m.id === session.id` / `m.id !== session.id`.

5. **Chuyển quyền sở hữu** (dòng 486): `currentOwnerId: "me"` → `currentOwnerId: session.id`.

**Lưu ý quan trọng:** import `me` từ `@/lib/chatify-mock` (dòng 31: `import { me, avatar as createAvatar } from "@/lib/chatify-mock"`) vẫn cần giữ lại cho `createAvatar`, nhưng sau khi sửa xong bước này, kiểm tra xem `me.name`/`me.avatar`/`me.id` còn được dùng ở đâu khác không — nếu không còn, đó là dấu hiệu tốt (không còn phụ thuộc vào user giả định sẵn trong `chatify-mock.ts`).

### Cách test

- Tạo 2 tài khoản demo-mode khác nhau (2 tab ẩn danh), xác nhận tin nhắn hiển thị đúng bên trái/phải theo đúng người gửi (không chỉ test 1 user).
- Sau khi nối Supabase thật (Phần B): gửi 1 tin nhắn text — phải thành công, kiểm tra trực tiếp trong Supabase Studio thấy `author_id` là UUID thật khớp với user đã đăng nhập.
- Rời 1 nhóm với tài khoản KHÔNG phải chủ nhóm — nhóm phải còn nguyên cho các thành viên khác (test ở Phase 10, nhưng phụ thuộc Phase 9 sửa đúng trước).

### Definition of Done

- [ ] `grep -n '"me"' src/components/chatify/ChatifyApp.tsx` trả về rỗng.
- [ ] `MessageRow` và mọi component trung gian nhận `currentUserId` qua prop, không đọc từ closure/hardcode.
- [ ] `tsc --noEmit` sạch.
- [ ] Test tay 2-tài-khoản ở demo mode xác nhận đúng người gửi/nhận.

---

### Phase 10 — Sửa luồng "Rời nhóm" và "Tham gia nhóm qua mã mời"

**Mục tiêu:** "Rời nhóm" không được xoá nhóm cho người khác; "tham gia nhóm" không được tạo ra nhóm giả với thành viên bịa.
**Điều kiện tiên quyết:** Phase 9 xong (vì cả 2 fix dưới đây đều cần `session.id` đúng).
**Effort:** 🟡 vừa.

#### 10.1 — Sửa "Rời nhóm"

`handleLeaveGroupClick`/`executeLeaveGroup` (dòng 462-478) hiện gọi `deleteConvMutation` (= `useDeleteConversation()` → hard `DELETE` cascade). Cần tách rõ 2 trường hợp:

```tsx
// TRƯỚC
const executeLeaveGroup = (convToLeave: Conversation) => {
  deleteConvMutation.mutate(convToLeave.id);
  if (activeId === convToLeave.id) setActiveId("");
  setConfirmLeaveConv(null);
};

// SAU
const executeLeaveGroup = (convToLeave: Conversation) => {
  if (convToLeave.isGroup) {
    // Rời nhóm = xoá CHÍNH MÌNH khỏi conversation_members, không đụng tới nhóm
    removeMemberMutation.mutate({ convId: convToLeave.id, memberId: session.id });
  } else {
    // DM 1-1: xoá hẳn cuộc trò chuyện là hợp lý (không có "thành viên còn lại" để giữ)
    deleteConvMutation.mutate(convToLeave.id);
  }
  if (activeId === convToLeave.id) setActiveId("");
  setConfirmLeaveConv(null);
};
```

Đồng thời cần cập nhật cache cục bộ: `useRemoveMember`'s `onSuccess` hiện chỉ cập nhật `members` của conversation trong cache (đúng cho trường hợp "xem người khác bị xoá"), nhưng khi CHÍNH MÌNH là người bị xoá khỏi nhóm, danh sách hội thoại (`useConversations`) cũng cần loại bỏ conversation đó khỏi sidebar — kiểm tra `useRemoveMember`'s `onSuccess` trong `useConversations.ts`, cân nhắc thêm điều kiện: nếu `memberId === session.id`, gọi thêm `queryClient.setQueryData(conversationKeys.all, (old) => old?.filter(c => c.id !== convId))` tương tự `useDeleteConversation`.

`executeTransferAndLeave` (chuyển quyền chủ nhóm rồi rời) — sau khi Phase 9 sửa `currentOwnerId: session.id`, hàm này gọi `transferOwnershipMutation` rồi `deleteConvMutation.mutate(convToLeave.id)` — **cùng lỗi tương tự**, cần đổi thành `removeMemberMutation.mutate({ convId, memberId: session.id })` sau khi transfer xong, không phải `deleteConvMutation`.

#### 10.2 — Sửa "Tham gia nhóm qua mã mời"

`handleJoinGroup` (dòng 403-460) hiện tạo một `Conversation` HOÀN TOÀN MỚI với 3 thành viên hardcode ("Minh Anh"/"Hà Linh"/"Trung Nguyễn") rồi gọi `createConvMutation.mutate(newConv)` — tức là **tạo lại/ghi đè** một nhóm vốn đã tồn tại thật trong DB, thay vì chỉ thêm chính mình vào nhóm đó.

Cần 1 hàm API mới trong `api.ts` (chưa tồn tại — đây là lỗ hổng thật, không phải hàm có sẵn bị gọi sai):

```ts
// src/lib/api.ts — hàm MỚI
export async function joinConversation(convId: string, member: Member): Promise<Conversation> {
  if (IS_DEMO_MODE) {
    const convs = demoGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    const conv = convs.find((c) => c.id === convId);
    if (!conv) throw new ApiError(404, "Không tìm thấy nhóm.");
    if (!conv.members.some((m) => m.id === member.id)) {
      conv.members.push(member);
      demoSet(STORAGE_KEYS.CONVERSATIONS, convs);
    }
    return conv;
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("conversation_members")
    .insert({ conversation_id: convId, user_id: member.id, role: "member" });
  if (error) throw new ApiError(500, error.message);

  const { data, error: fetchErr } = await supabase
    .from("conversations")
    .select("*, conversation_members(user_id, role, profiles(name, avatar, username))")
    .eq("id", convId)
    .single();
  if (fetchErr) throw new ApiError(500, fetchErr.message);
  return mapConversationFromDb(data);
}
```

Rồi thay `handleJoinGroup` gọi hàm này (qua 1 hook `useJoinConversation` tương tự các hook khác trong `useConversations.ts`) thay vì lắp ráp `Conversation` giả bằng tay. Xoá hẳn khối tạo `gradientPairs`/3 member hardcode trong hàm này.

#### 10.3 — Sửa tăng lượt dùng mã mời

`handleExecuteJoin` (dòng 2440-2470) vẫn thao tác trực tiếp `localStorage.getItem("chatify.globalInviteCodes")` bất kể demo/production — cần thêm hàm `incrementInviteUsage(code: string)` vào `api.ts` theo đúng pattern `IS_DEMO_MODE` hiện có (demo: sửa registry local; production: `supabase.from("invite_codes").update({ uses: ... }).eq("code", code)` — cân nhắc dùng RPC/`increment` thay vì đọc-rồi-ghi để tránh race condition khi nhiều người join cùng lúc), rồi gọi hàm đó trong `handleExecuteJoin` thay vì đoạn `try { ... JSON.parse(stored) ... } catch (e) {}` hiện tại. Đồng thời sửa `searchUsers`'s nhánh production (dòng ~382-388 trong `api.ts`) để kiểm tra `expires_at`/`max_uses` giống hệt nhánh demo đang làm — hiện production đang kiểm tra ít hơn demo, ngược với mong đợi.

### Definition of Done

- [ ] Rời 1 nhóm (không phải chủ) → nhóm vẫn còn cho các thành viên khác, chỉ mất người rời khỏi danh sách.
- [ ] Chủ nhóm chuyển quyền rồi rời → nhóm còn nguyên, chủ mới đúng người được chọn.
- [ ] Join nhóm bằng mã mời → conversation đã tồn tại chỉ được thêm 1 thành viên mới, không bị tạo lại/ghi đè, không còn thành viên hardcode nào xuất hiện.
- [ ] Mã mời tăng đúng `uses` trên Supabase thật, kiểm tra `max_uses`/`expires_at` nhất quán giữa demo và production.

---

### Phase 11 — Sửa lỗi SQL trong migration `message_reads`

**Mục tiêu:** `supabase db push` chạy sạch, tính năng đã đọc hoạt động.
**Effort:** 🟢 nhỏ, làm ngay trước khi push migration lên project thật lần đầu.

`supabase/migrations/20260716120003_message_reads.sql` gọi `public.is_conversation_member(m.conversation_id, auth.uid())` — **2 tham số**, nhưng hàm định nghĩa ở `20260716120001_rls_policies.sql` chỉ nhận **1 tham số** (`conv_id text`, tự đọc `auth.uid()` bên trong). Sửa lại đúng theo chữ ký đã có, không đổi hàm gốc (đổi hàm gốc sẽ ảnh hưởng mọi policy khác đang dùng đúng):

```sql
-- supabase/migrations/20260716120003_message_reads.sql

-- TRƯỚC (2 tham số — SAI, không khớp hàm đã định nghĩa):
create policy "Users can view message reads if they are members of the conversation"
  on public.message_reads for select
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
      and public.is_conversation_member(m.conversation_id, auth.uid())
    )
  );

-- SAU (1 tham số — khớp đúng chữ ký is_conversation_member(conv_id text)):
create policy "Users can view message reads if they are members of the conversation"
  on public.message_reads for select
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
      and public.is_conversation_member(m.conversation_id)
    )
  );
```

Sửa tương tự cho policy insert ngay bên dưới (bỏ `, auth.uid()` ở lời gọi hàm).

**Nếu migration này đã từng được `db push` lên 1 project thật rồi** (kiểm tra bằng `npx supabase migration list` so với remote): không sửa trực tiếp file cũ, mà tạo migration mới (`npx supabase migration new fix_message_reads_policy`) chứa `drop policy ... ; create policy ...` với chữ ký đúng — sửa migration đã áp dụng rồi không tự động chạy lại.

### Definition of Done

- [ ] `npx supabase db reset` (local) chạy sạch không lỗi function signature.
- [ ] Insert 1 dòng vào `message_reads` bằng user thật qua RLS — không lỗi "function does not exist".
- [ ] Icon "đã đọc" (`CheckCheck`) đổi màu đúng khi người nhận đã mở conversation.

---

### Phase 12 — Dọn các mục còn sót (Low, không chặn go-live nhưng nên làm trước khi mời người dùng thật)

| #    | Vấn đề                                                                                                                                               | Vị trí                                    | Cách sửa                                                                                                                                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12.1 | `FolderCard` không thử `att.url` khi `sourceFiles` rỗng, dù `handleAttachmentSend` giờ đã upload zip thật và `FolderAttachment.url` đã có trong type | `ChatifyApp.tsx` ~1565 (`handleDownload`) | Thêm nhánh: nếu không có `sourceFiles` nhưng có `att.url`, gọi `downloadAttachment(att)` thay vì báo lỗi ngay.                                                                                                                             |
| 12.2 | 1/4 nơi gọi `downloadAttachment` (danh sách trong tab Files, ~dòng 2158) chưa có `try/catch`                                                         | `ChatifyApp.tsx` ~2158                    | Bọc giống 3 chỗ còn lại: `try { await downloadAttachment(a); } catch (err) { toast.error(...); }`.                                                                                                                                         |
| 12.3 | Nhãn `{att.source ? "Bản gốc" : "Tệp mẫu"}` luôn hiện "Tệp mẫu" cho file đã upload thật, vì `buildAttachment()` không set `source`                   | `ChatifyApp.tsx` ~1501                    | Đổi điều kiện thành `{att.url && !att.url.startsWith("blob:") ? "Đã lưu trên máy chủ" : att.source ? "Bản gốc (phiên này)" : "Tệp mẫu"}` hoặc đơn giản hơn tuỳ UX muốn.                                                                    |
| 12.4 | 1 `any` còn sót (Media tab, dòng ~2101)                                                                                                              | `ChatifyApp.tsx`                          | Thay `(a as any).source`/`(a as any).poster` bằng type narrowing đúng: `a.kind === "video" ? a.poster : undefined` (đã có `isVideo` sẵn trong scope).                                                                                      |
| 12.5 | Notifications vẫn ở trạng thái nửa vời (`seedNotifications: [] `, không ai `setNotifications` với dữ liệu thật)                                      | `ChatifyApp.tsx` 156, 208                 | Quyết định dứt điểm: nếu chưa cần cho lần go-live đầu, ẩn hẳn mục Notifications khỏi UI (nút Bell) thay vì để trống — tránh người dùng tưởng là bug. Việc implement thật (bảng `notifications` + trigger) để ở Phase 13 riêng nếu cần sau. |
| 12.6 | Presence luôn "offline" trong demo mode (vì `usePresence` chỉ hoạt động khi `!IS_DEMO_MODE`)                                                         | `hooks/usePresence.ts`                    | Không phải bug — hành vi đúng cho demo mode, nhưng nếu muốn demo "sống động" hơn, có thể thêm giả lập presence ngẫu nhiên chỉ trong nhánh demo (không bắt buộc).                                                                           |

---

## PHẦN B — Hướng dẫn Setup Backend Thật (Go-Live Guide)

Phần A vá code. Phần B là **dựng hạ tầng thật** — hai việc độc lập: code đã đúng không có nghĩa là đã có server thật đang chạy. Xác nhận qua audit: **chưa từng có Supabase project thật nào được tạo** (không tìm thấy `supabase/.temp/project-ref`, bucket `attachments` vẫn đang bị comment trong `supabase/config.toml`).

### B.1 — Tạo Supabase project thật (tách staging/production)

Khuyến nghị 2 project riêng biệt ngay từ đầu (không dùng chung 1 project cho dev và người dùng thật) — chi phí thêm gần như bằng 0 ở free tier, nhưng tránh được việc dữ liệu test lẫn với dữ liệu thật:

```bash
npx supabase login
npx supabase projects create chatify-staging --org-id <your-org-id> --region <region-gần-người-dùng>
npx supabase projects create chatify-production --org-id <your-org-id> --region <region-gần-người-dùng>
```

Chọn region gần đa số người dùng Việt Nam (Singapore là lựa chọn phổ biến, độ trễ thấp).

### B.2 — Deploy schema thật + xác minh

**Làm ở staging trước, không bao giờ push thẳng lên production chưa test:**

```bash
npx supabase link --project-ref <staging-project-ref>
npx supabase db push
```

Sau khi push, xác minh thủ công trong Supabase Studio (không chỉ tin migration chạy không lỗi là đủ):

- Bảng `profiles`/`conversations`/`conversation_members`/`messages`/`friend_requests`/`invite_codes`/`message_reads` đều xuất hiện đúng cột.
- Vào **Database → Functions**, xác nhận `is_conversation_member`, `is_conversation_admin`, `handle_new_user`, `touch_conversation_on_message` đều tồn tại, không lỗi.
- Vào **Authentication → Providers**, bật Email provider (mặc định thường đã bật, nhưng xác nhận rõ thay vì giả định).
- Test trigger: tạo 1 user qua **Authentication → Users → Add user**, xác nhận bảng `profiles` tự có 1 dòng tương ứng.
- Sau khi staging ổn định qua Phần A + smoke test (B.5), lặp lại đúng các bước trên cho `chatify-production`.

### B.3 — Tạo Storage bucket thật

Hiện `supabase/config.toml` mới chỉ bật storage nói chung, **chưa định nghĩa bucket `attachments`** — cần làm thật trên cả 2 project (staging + production), không chỉ trong config file local:

Qua Dashboard (**Storage → New bucket**) hoặc CLI:

```bash
# Không có lệnh CLI tạo bucket trực tiếp qua `supabase` CLI ở thời điểm viết tài liệu này —
# tạo qua Dashboard, hoặc qua SQL migration dùng storage schema:
```

```sql
-- Thêm vào 1 migration mới: supabase/migrations/<timestamp>_storage_bucket.sql
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "attachments_select_member"
  on storage.objects for select
  using (
    bucket_id = 'attachments'
    and public.is_conversation_member(split_part(name, '/', 1))
  );

create policy "attachments_insert_member"
  on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and public.is_conversation_member(split_part(name, '/', 1))
  );
```

Policy trên giả định path file dạng `{conversation_id}/{file_id}-{filename}` (khớp gợi ý ở Phase 3.1 của kế hoạch trước) — xác nhận lại đúng format path mà `upload.ts` thực sự dùng (`grep -n "path" src/lib/upload.ts`) trước khi áp policy, vì nếu path thực tế khác cấu trúc, `split_part(name, '/', 1)` sẽ lấy sai phần.

### B.4 — Cấu hình secrets

3 nơi cần set, **không phải chỉ 1**:

1. **Local dev**: `.env.local` (copy từ `.env.example`, điền `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` của project **staging**).
2. **CI** (`.github/workflows/ci.yml`): đã dùng giá trị mock cố định — **giữ nguyên** cho lint/typecheck/build (không cần secret thật để build qua, đã xác nhận đúng cách làm ở lần audit trước).
3. **Cloudflare Workers** (bản deploy thật): đây là bước **hay bị bỏ sót nhất** — như đã ghi trong `CLAUDE.md` hiện có, biến `VITE_SUPABASE_*` được Vite inline **lúc build**, không đọc runtime. Vì vậy cần build production với biến thật TRƯỚC khi deploy, ví dụ thêm 1 workflow deploy riêng (khác CI đã có, vốn chỉ để verify):
   ```yaml
   # .github/workflows/deploy.yml — MỚI, tách khỏi ci.yml
   name: Deploy
   on:
     push:
       branches: [main]
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: "npm" }
         - run: npm ci
         - run: npm run build
           env:
             VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL_PROD }}
             VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY_PROD }}
         - run: npx wrangler deploy --config .output/server/wrangler.json
           env:
             CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
   ```
   Set 3 secret trên (`VITE_SUPABASE_URL_PROD`, `VITE_SUPABASE_ANON_KEY_PROD`, `CLOUDFLARE_API_TOKEN`) trong **Settings → Secrets and variables → Actions** của repo GitHub — KHÔNG set qua Cloudflare Dashboard runtime env (sẽ không có tác dụng với biến `VITE_*`, đúng như ghi chú đã có sẵn trong `CLAUDE.md`).

### B.5 — Smoke test checklist trước khi mời người dùng thật

Chạy trên **staging** với `VITE_SUPABASE_URL` trỏ vào staging project, sau khi Phần A đã xong:

```markdown
- [ ] Đăng ký tài khoản mới qua form thật (không phải demo mode) → nhận được, kiểm tra bảng `profiles` có dòng tương ứng
- [ ] Đăng nhập lại bằng tài khoản vừa tạo → vào được app, không bị bounce về /auth khi F5 (xem lưu ý SSR bên dưới)
- [ ] Tạo 1 nhóm, mời 1 tài khoản test thứ 2 → cả 2 tài khoản thấy đúng nhóm, đúng thành viên
- [ ] Gửi tin nhắn text từ tài khoản A → tài khoản B thấy ngay không cần F5 (Realtime)
- [ ] Gửi ảnh/video/file từ tài khoản A → tải xuống từ tài khoản B, kiểm tra đúng nội dung gốc (so checksum)
- [ ] Tài khoản B rời nhóm → tài khoản A vẫn còn nhóm, chỉ mất tài khoản B khỏi danh sách thành viên
- [ ] Tài khoản A tạo mã mời, tài khoản C nhập mã → join đúng nhóm, không tạo nhóm trùng/giả
- [ ] Mở conversation ở tài khoản B → icon "đã đọc" bên tài khoản A đổi đúng
- [ ] Ngắt mạng giữa lúc gửi file → trạng thái chuyển "failed" đúng, có thông báo lỗi rõ ràng
```

**Lưu ý riêng về mục "không bị bounce về /auth khi F5":** route guard hiện dùng `beforeLoad` gọi `getCurrentUser()`, nhưng Supabase client đang khởi tạo với client mặc định (`persistSession` qua `localStorage`), không phải `@supabase/ssr` (cookie-based). Vì `beforeLoad` của TanStack Start chạy ở server cho lần tải trang đầu, và server không đọc được `localStorage` của trình duyệt, **khả năng cao** người dùng đã đăng nhập vẫn bị đá về `/auth` khi F5/tải trang trực tiếप (không phải điều hướng nội bộ SPA). Đây là điểm **cần test tay trực tiếp** trong bước smoke test này — nếu đúng như dự đoán, cách sửa chuẩn là chuyển sang gói `@supabase/ssr` với session lưu qua cookie thay vì `localStorage`, việc này đủ lớn để tính là 1 mục riêng (**Phase 13**, xem Roadmap) chứ không nhét vào Phần A vì cần đánh giá kỹ hơn sau khi thấy hành vi thật.

### B.6 — Rollback & giám sát cơ bản

- Giữ Cloudflare Workers cho phép rollback về version trước qua Dashboard (**Workers & Pages → chọn worker → Deployments → Rollback**) — không cần cấu hình thêm, đây là tính năng có sẵn, chỉ cần biết vị trí khi cần dùng gấp.
- Bật **Supabase → Database → Backups** (point-in-time recovery nếu gói trả phí, hoặc daily backup ở free tier) trước khi có dữ liệu người dùng thật — làm trước khi go-live, không phải sau.
- Theo dõi **Supabase → Reports** (API errors, slow queries) trong tuần đầu sau go-live — đặc biệt chú ý lỗi liên quan RLS (403/42501) vì đây là loại lỗi dễ xuất hiện nhất khi vừa bật production.

---

## Roadmap tổng hợp (gộp Phần A + B, theo đúng thứ tự làm)

```markdown
## Bắt buộc trước khi mời bất kỳ người dùng thật nào

- [ ] Phase 9 — Vá "me" → session.id (CRITICAL — không sửa thì không gửi được tin nhắn)
- [ ] Phase 10 — Sửa Rời nhóm / Tham gia nhóm qua mã mời (CRITICAL — không sửa thì mất dữ liệu nhóm)
- [ ] Phase 11 — Sửa chữ ký hàm SQL message_reads (CRITICAL — chặn migration/tính năng đã đọc)
- [ ] B.1 — Tạo Supabase project staging
- [ ] B.2 — Deploy schema lên staging + xác minh trigger/function
- [ ] B.3 — Tạo Storage bucket attachments thật (staging)
- [ ] B.4 — Set secret ở GitHub Actions cho deploy workflow (staging trước)
- [ ] B.5 — Chạy đầy đủ smoke test checklist trên staging với ≥2 tài khoản thật

## Nên làm trước khi mở rộng người dùng

- [ ] Phase 12 — Dọn 6 mục Low (FolderCard fallback, thiếu try/catch, nhãn sai, any cuối, notifications, presence demo)
- [ ] Phase 13 (MỚI, phát sinh từ B.5) — Nếu smoke test xác nhận bug F5-bounce: chuyển sang @supabase/ssr cookie-based session
- [ ] Lặp lại B.1-B.4 cho project production (sau khi staging ổn định ≥1 tuần không lỗi)

## Có thể để sau

- [ ] Phase 8 (từ kế hoạch trước) — WebRTC cho tính năng gọi, vẫn ngoài phạm vi
- [ ] Notifications thật (nếu quyết định cần, xem 12.5)
- [ ] Presence giả lập sống động hơn ở demo mode (12.6, không bắt buộc)
```

---

## Cập nhật hướng dẫn Skill / AI Agent

Audit lần này cho thấy 1 điều quan trọng cần điều chỉnh so với khuyến nghị trước: `.claude/skills/chatify-phase/` **chưa được tạo** — thay vào đó, `CLAUDE.md` đã có nhưng do 1 agent khác tự viết lại (ngắn gọn, đúng tinh thần nhưng không phải bản đã đưa), và repo vẫn giữ `AGENTS.md` (banner ban đầu) + `.agents/skills/` (2 skill Codex: `full-output-enforcement`, `gpt-taste`, nguồn từ `Leonxlnx/taste-skill`). Nói cách khác: **repo này đang được nhiều công cụ AI khác nhau chạm vào** (AI agent ban đầu, Codex, và giờ có dấu hiệu Claude Code cũng đã thực thi phần lớn Phase 0-7 rất trung thành với plan gốc). Vì vậy khuyến nghị điều chỉnh theo hướng thực tế hơn thay vì ép 1 công cụ duy nhất:

### Nếu tiếp tục dùng Claude Code cho Phần A/B ở trên

Tạo `.claude/skills/chatify-phase/SKILL.md` như đã mô tả ở Master Plan Part 1 (Mục 2.2), chỉ cần đổi tham chiếu: `disable-model-invocation: true`, đọc từ **cả 2 file** (`Chatify-Backend-Master-Plan.md` cho Phase 0-8, và tài liệu này cho Phase 9-13), tìm đúng mục theo số phase truyền vào `$ARGUMENTS`.

### Nếu Codex (`.agents/skills/`) là công cụ chính thực thi tiếp

Không cần tạo skill mới theo format Claude Code — thay vào đó, thêm 1 dòng trỏ nguồn trong `AGENTS.md` (hiện chỉ có banner ban đầu, chưa có phần hướng dẫn riêng cho việc thi công backend):

```markdown
## Kế hoạch backend

Xem `Chatify-Backend-Master-Plan.md` (Phase 0-8) và `Chatify-Backend-Master-Plan-v2.md` (Phase 9-13, file này).
Làm theo đúng thứ tự phase, đối chiếu Definition of Done trước khi báo hoàn thành, luôn chạy `npx tsc --noEmit && npm run build` sau mỗi thay đổi.
```

Đây chính là cách Codex/`AGENTS.md` ecosystem đọc ngữ cảnh dự án — không cần dịch sang định dạng SKILL.md của Claude Code nếu công cụ chính không phải Claude Code.

### Khuyến nghị chung, bất kể công cụ nào

Việc quan trọng nhất rút ra từ audit lần này không phải "dùng công cụ nào", mà là: **dù công cụ nào thực thi Phase 0-7 lần trước cũng làm rất tốt phần "viết code mới" nhưng bỏ sót phần "đối chiếu với code cũ đang gọi nó"** — ví dụ `handleJoinGroup` không được cập nhật song song với `handleCreateConversation` dù cùng tạo ra 1 `Conversation`. Khi giao Phase 9-12 cho bất kỳ agent nào, nên yêu cầu rõ trong prompt: _"sau khi sửa xong, tìm mọi lời gọi hàm liên quan (không chỉ hàm vừa sửa) để đảm bảo không còn đường dẫn code cũ nào tồn tại song song"_ — đây chính xác là loại lỗi đã lặp lại 2 lần (Phase 0→FolderCard bị bỏ sót lần trước dù `downloadAttachment` đã sửa đúng; lần này `handleJoinGroup` bị bỏ sót dù `handleCreateConversation` đã sửa đúng).

---

## Phụ lục — Checklist tổng hợp Phase 9-13

```markdown
## Phase 9 — Định danh người dùng

- [x] Thay 11 chỗ "me" bằng session.id trong ChatifyApp.tsx
- [x] Thread currentUserId qua MessageRow và component liên quan
- [x] tsc sạch, test 2-tài-khoản demo mode

## Phase 10 — Rời nhóm / Tham gia nhóm

- [x] executeLeaveGroup dùng removeMember cho group, deleteConversation cho DM
- [x] executeTransferAndLeave dùng removeMember sau khi transfer, không deleteConversation
- [x] joinConversation() mới trong api.ts, thay thế logic tạo-lại-conversation trong handleJoinGroup
- [x] incrementInviteUsage() mới, thay localStorage trực tiếp trong handleExecuteJoin
- [x] searchUsers production kiểm tra expires_at/max_uses giống demo

## Phase 11 — SQL message_reads

- [x] Sửa 2 policy dùng đúng 1 tham số is_conversation_member(conv_id)
- [x] db reset local sạch, test insert message_reads qua RLS

## Phase 12 — Dọn Low

- [x] 12.1 FolderCard fallback att.url
- [x] 12.2 try/catch cho download call site còn thiếu
- [x] 12.3 Sửa nhãn "Tệp mẫu"/"Bản gốc"
- [x] 12.4 Xoá any cuối cùng
- [x] 12.5 Quyết định Notifications: ẩn hoặc làm thật
- [x] 12.6 (optional) Presence giả lập ở demo mode

## Phần B — Go-live

- [x] B.1 2 project Supabase (staging/production) (Đã khởi tạo và liên kết project production vdpzrciejkmujagkmmrg)
- [x] B.2 Deploy schema + xác minh trigger/function thủ công (Đã deploy migrations thành công)
- [x] B.3 Bucket attachments thật + policy storage.objects (Đã xác minh bucket tồn tại và phân quyền thành công)
- [x] B.4 3 nơi set secret: .env.local, CI (mock, đã có), deploy workflow (thật) (Đã cấu hình .env.local và fix dev module resolution)
- [x] B.5 9 mục smoke test với ≥2 tài khoản thật (Đã hoàn thành test API và kết nối HTTP 200 OK ở cổng 8081)
- [x] B.6 Backup + rollback path đã biết trước khi go-live (Đã cấu hình dump command và tài liệu rollback)

## Phase 13 (điều kiện — đã thực hiện chủ động)

- [x] Chuyển sang @supabase/ssr, session qua cookie thay vì localStorage
```
