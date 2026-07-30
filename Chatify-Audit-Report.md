# Audit Kỹ Thuật Toàn Diện — Dự Án Chatify

**Phạm vi:** toàn bộ repo (frontend TanStack Start, backend Supabase/Postgres, migrations, script deploy, CI).
**Phương pháp:** đọc trực tiếp source code + SQL migrations, chạy thật `tsc --noEmit`, `eslint`, `vite build`, `npm audit` trên sandbox để xác minh thay vì suy đoán. Mọi phát hiện dưới đây đều kèm đường dẫn file/dòng cụ thể làm bằng chứng.

---

# 1. Tóm tắt điều hành (Executive Summary)

**Tình trạng chung:** Chatify là một sản phẩm được xây bằng AI code generation tool theo kiểu "vá liên tục" — lịch sử 9 migration cho thấy rõ pattern: phát hiện lỗi bảo mật → vá → phát hiện lỗi khác → vá tiếp. Phần hạ tầng build (TypeScript, ESLint, Vite build) **sạch thật sự** — đã verify bằng cách chạy trực tiếp, không phải tin theo tài liệu dev. Nhưng lớp hạ tầng sạch này che giấu một tầng logic nghiệp vụ có nhiều lỗ hổng bảo mật nghiêm trọng và nhiều tính năng "trông như hoạt động nhưng không hoạt động".

**Có sẵn sàng production không? KHÔNG**, chưa. Có ít nhất 3 lỗ hổng bảo mật mức Critical và 4 lỗi chức năng mức Critical cần sửa trước khi mở cho người dùng thật, đặc biệt là lỗi khiến **tính năng cốt lõi nhất của app (gửi file/ảnh) bị vỡ với người nhận đang online**, và lỗ hổng khiến **số điện thoại của mọi user bị lộ cho bất kỳ ai đã đăng nhập**.

**Rủi ro lớn nhất:**

1. Bản vá bảo mật cho storage bucket (`attachments`) **không bền vững** — hai script vận hành chính thức trong repo (`scripts/deploy-helper.js`, `scripts/verify-supabase.cjs`) đều tạo/hướng dẫn tạo lại bucket ở chế độ **public**, tức là hoàn tác chính bản vá đã có trong migration.
2. RLS của bảng `profiles` cho phép **mọi user đã đăng nhập đọc số điện thoại của mọi user khác** — bản thân migration vá bảo mật đã ghi rõ trong comment là biết vấn đề này nhưng cố tình không sửa RLS gốc.
3. Tính năng gửi ảnh/video/file — tính năng được quảng bá chính ("giữ nguyên chất lượng gốc, không nén") — **hiển thị hỏng cho mọi thành viên khác đang online** trong hội thoại tại thời điểm gửi, do lỗ hổng đồng bộ giữa optimistic update và Realtime subscription.
4. Đổi ảnh đại diện/ảnh bìa **không hề upload lên đâu cả** — chỉ lưu một `blob:` URL cục bộ của trình duyệt thẳng vào cột DB, vỡ ngay cả với chính chủ tài khoản sau khi F5.

**Điểm mạnh thực sự** (không phải khen cho có): kiến trúc RLS nền tảng (helper function `is_conversation_member`/`is_conversation_admin` tránh đệ quy) được thiết kế đúng bài; các RPC atomic gần đây (`transfer_ownership_atomic`, `join_via_invite_code` — dù bị bỏ quên không gọi) cho thấy tác giả/AI agent hiểu đúng vấn đề TOCTOU/race condition; cơ chế cache signed-URL với refresh khi hết hạn (`useAttachmentUrl.ts`) là một chi tiết kỹ thuật làm cẩn thận; build pipeline (typecheck/lint/build) sạch 100% khi chạy thật.

**Một câu kết luận:** Chatify có nền tảng kỹ thuật (routing, RLS cơ bản, build pipeline) khá vững, nhưng lớp logic nghiệp vụ nối frontend↔backend có khoảng cách lớn giữa "đã viết migration để sửa" và "frontend thực sự dùng bản vá đó" — khoảng cách này chính là nguồn gốc của gần như toàn bộ lỗi Critical/High trong báo cáo này, và cần một đợt kiểm thử tích hợp thật (không phải chỉ đọc code) trước khi launch.

---

# 2. Kiến trúc dự án

**Stack xác nhận từ `package.json` + build output thật:**

- Frontend: React 19, TanStack Start (SSR framework dựa trên Vite + Nitro), TanStack Router (file-based routing, `routeTree.gen.ts` tự sinh), TanStack Query v5 cho data-fetching/cache.
- UI: Tailwind CSS v4, shadcn/ui (Radix primitives), Framer Motion cho animation, `lucide-react` icon.
- Backend: Supabase (Postgres + Auth + Storage + Realtime), không có backend tự viết nào khác — toàn bộ business logic phía server nằm trong SQL (RLS policies, trigger, RPC function).
- Deploy target: Cloudflare Workers (`nitro.preset = cloudflare-module`, xác nhận qua `wrangler.json` sinh ra khi build và `.wrangler/` trong repo).
- Không có test framework nào trong `devDependencies` (không Vitest/Jest/Playwright/Cypress) — không có `npm test`.

**Nguồn gốc dự án:** Tài liệu khởi tạo ban đầu xác nhận app được khởi tạo như một **mockup frontend thuần** (không auth, không backend, dữ liệu giả cố định trong `chatify-mock.ts`), sau đó mới được nối vào Supabase thật ("Supabase Cloud"). Đây là bối cảnh quan trọng: rất nhiều lỗi trong báo cáo này là hệ quả trực tiếp của việc **không dọn sạch code/giả định thời kỳ mockup** khi chuyển sang backend thật (xem mục 7).

**Runtime model:** SSR qua Cloudflare Worker (`src/server.ts` bọc handler Nitro, có cơ chế bắt lỗi thủ công `error-capture.ts` cho các lỗi SSR bị h3/Nitro nuốt mất — xem mục 6.10 về rủi ro state toàn cục chia sẻ giữa các request đồng thời trên cùng một Worker isolate). Ứng dụng chỉ có 2 route thực chất: `/` (màn hình chat chính, yêu cầu đăng nhập qua `beforeLoad`) và `/auth` (đăng nhập/đăng ký). Mọi màn hình khác (Settings, Friends, Invite, Create Chat...) đều là **modal trong cùng một trang**, không phải route riêng.

**Ranh giới frontend/backend:** gần như toàn bộ logic ghi dữ liệu đi qua `src/lib/api.ts` (lớp gọi `supabase-js` trực tiếp từ client) — không có API route/server function trung gian để validate. Điều này có nghĩa **RLS trong Postgres là ranh giới bảo mật thật sự duy nhất**; bất kỳ chỗ nào RLS lỏng lẻo (mục 5) đều là lỗ hổng thật, không phải lý thuyết — client hoàn toàn có thể gọi thẳng Supabase REST API bằng anon key mà bỏ qua toàn bộ UI.

**Demo vs Production:** `src/lib/config.ts` định nghĩa `IS_DEMO_MODE = !hasSupabaseConfig` — khi thiếu biến môi trường Supabase, app tự chuyển sang chế độ demo dùng `localStorage`/`sessionStorage` thay database thật. Cơ chế fallback này **rẽ nhánh logic ở rất nhiều nơi** (`if (IS_DEMO_MODE) ...` rải rác trong hooks, `api.ts`, `useMessages.ts`) — đây là một nguồn tăng độ phức tạp và rủi ro dài hạn (mục 8), dù bản thân cơ chế fallback hoạt động đúng như thiết kế.

---

# 3. Kiểm kê tính năng (Feature Inventory)

| Tính năng                                         | Trạng thái                                         | Bằng chứng                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đăng ký / đăng nhập (email+password)              | **Hoạt động**                                      | `src/lib/auth.ts`, `src/routes/auth.tsx`, RLS + trigger `handle_new_user` đúng                                                                     |
| Gửi tin nhắn văn bản                              | **Hoạt động**                                      | `api.ts::sendMessage`, optimistic update đúng, realtime đúng                                                                                       |
| Gửi ảnh/video/file đính kèm                       | **Hỏng một phần (Broken)**                         | Upload lên Storage thật, nhưng người nhận online nhận `blob:` URL vô nghĩa qua Realtime — xem mục 4.3, 6.1                                         |
| Gửi cả thư mục (zip tự động)                      | **Hoạt động** (có 1 crash-risk cạnh biên)          | `zipFolderToBlob` trong `file-transfer.ts`, nhưng optimistic attachment thiếu field bắt buộc — mục 6.7                                             |
| Đếm tin nhắn chưa đọc (badge số)                  | **Không có tác dụng thật (No real effect)**        | Cột `conversations.unread` không bao giờ được UPDATE trong SQL — mục 4.1                                                                           |
| Trạng thái online/offline (presence)              | **Hoạt động (nhưng trùng lặp code chết)**          | `usePresence.ts` (Realtime presence channel) hoạt động đúng cho DM; cột DB `conversations.presence` song song tồn tại nhưng chết hoàn toàn — mục 7 |
| Đã xem / read receipt (tick xanh)                 | **Hoạt động**                                      | Bảng `message_reads` + RLS đúng, được gọi đúng lúc trong `ChatifyApp.tsx`                                                                          |
| Đổi ảnh đại diện / ảnh bìa                        | **Hỏng hoàn toàn (Broken)**                        | Không hề gọi `uploadFile()` — lưu thẳng `blob:` URL vào DB — mục 4.4                                                                               |
| Sửa hồ sơ (tên, username, bio, SĐT)               | **Hoạt động một phần**                             | Ghi được, nhưng **không đọc lại được** khi mở lại app (không có hàm fetch profile ban đầu) — mục 6.4                                               |
| Sửa "Ngày sinh"                                   | **Không có tác dụng thật**                         | Không có cột DB tương ứng — mục 4.5, 6.4                                                                                                           |
| Tạo nhóm chat                                     | **Hoạt động**                                      | RPC `create_conversation_atomic`, dù thiếu kiểm tra caller có trong danh sách thành viên — mục 5.4                                                 |
| Mời vào nhóm bằng mã code                         | **Hoạt động nhưng có race condition thật**         | RPC đúng (`join_via_invite_code`) tồn tại nhưng **không được gọi** — luồng thật vẫn dùng cách cũ có race — mục 4.6, 5.5                            |
| Tìm bạn theo username/SĐT, kết bạn                | **Hoạt động** (một luồng)                          | `search_users` RPC + `sendFriendRequest` trong `CreateChatModal`                                                                                   |
| "Kết bạn" từ Member Profile Modal                 | **Giả (No real effect / cosmetic)**                | Chỉ set state cục bộ, không gọi API — mục 6.5                                                                                                      |
| Nhắn tin trực tiếp không cần kết bạn              | **Hoạt động (có chủ đích thiết kế, cần xác nhận)** | `handleExecuteJoin`/`onStartChat` tạo DM ngay không cần chấp thuận — mục 3 ghi chú thêm bên dưới                                                   |
| Rời nhóm / chuyển quyền trưởng nhóm               | **Hoạt động (có lỗ hổng leo quyền song song)**     | `transfer_ownership_atomic` đúng luồng UI, nhưng RLS cho phép admin bất kỳ tự thực hiện — mục 5.6                                                  |
| Thăng/hạ vai trò phó nhóm                         | **Hoạt động (có lỗ hổng leo quyền)**               | `updateMemberRole` — UI chỉ cho member↔admin, nhưng backend cho phép set "owner" — mục 5.6                                                         |
| Gọi thoại / gọi video                             | **Demo-only / hoàn toàn giả**                      | `CallModal` chỉ dàn dựng bằng `setTimeout`, không WebRTC thật — mục 6.6                                                                            |
| Thông báo (tab "Thông báo")                       | **Rỗng vĩnh viễn (Stub)**                          | `notifications` state không bao giờ được thêm phần tử — mục 7.7                                                                                    |
| Danh sách lời mời kết bạn (trong modal Thông báo) | **Hoạt động**                                      | Query + RPC thật, độc lập với mục trên                                                                                                             |
| Đổi theme màu / dark-light mode                   | **Hoạt động**                                      | Lưu `localStorage`, áp dụng qua CSS variables                                                                                                      |
| Tải file/thư mục gốc                              | **Hoạt động**                                      | `file-transfer.ts`, có xử lý fallback hợp lý cho trường hợp thư mục đã mất session gốc                                                             |

**Ghi chú về luồng "nhắn tin không cần bạn bè":** `handleExecuteJoin` trong `CreateChatModal` (ChatifyApp.tsx dòng ~2521) cho phép tạo DM ngay với bất kỳ user nào tìm được qua `search_users`, không cần họ chấp nhận lời mời kết bạn trước. Đây có thể là chủ đích sản phẩm (giống Telegram/iMessage tìm theo SĐT), nhưng nó khiến hệ thống "friend request" song song tồn tại mà không thực sự đóng vai trò gate-keeping — nên xác nhận đây là chủ đích, không phải sơ suất, vì nó ảnh hưởng cách đánh giá mức độ nghiêm trọng của các phát hiện bảo mật liên quan đến quyền tạo hội thoại (mục 5.4).

---

# 4. Vấn đề nghiêm trọng nhất (Critical Issues)

### 4.1 — Bộ đếm "tin nhắn chưa đọc" hoàn toàn là ảo giác client-side

- **Mức độ:** Critical (không mất dữ liệu, nhưng là lỗi hiển thị sai thông tin trên diện rộng, ảnh hưởng UX cốt lõi)
- **Vị trí:** `supabase/migrations/20260716120000_init_schema.sql` (dòng định nghĩa `unread integer not null default 0`) + `src/lib/mappers.ts::mapConversationFromDb` (đọc `row.unread` trực tiếp) + `src/hooks/useRealtimeGlobal.ts` (dòng 59: `unread: isFromMe ? c.unread : c.unread + 1`) + `Sidebar` trong `ChatifyApp.tsx` (dòng 880, 983).
- **Vì sao là vấn đề:** đã grep toàn bộ 9 file migration — cột `conversations.unread` **không bao giờ được UPDATE** bởi bất kỳ trigger/RPC nào. Nó mãi mãi là giá trị mặc định `0` mỗi khi được SELECT từ server.
- **Tác động cụ thể:** badge số "chưa đọc" chỉ tăng lên khi có tin nhắn Realtime đến trong khi app đang mở (do `useRealtimeGlobal` cộng dồn thủ công vào cache của React Query), và **reset về 0 mỗi khi danh sách hội thoại được fetch lại từ server** — tức là sau F5, sau 30 giây `staleTime` tự động refetch, hoặc remount component. Người dùng sẽ thấy số chưa đọc "tự nhiên biến mất" liên tục — một lỗi rất dễ tái hiện và rất dễ bị người dùng report là "app bị bug đếm sai".
- **Chi tiết mỉa mai:** migration `20260726130000_fix_per_user_unread_and_rpcs.sql` được đặt tên đúng để sửa lỗi này — thêm cột `conversation_members.last_read_at` — nhưng đã grep xác nhận **cột này không được đọc/ghi ở bất kỳ đâu trong toàn bộ frontend**. Bản vá tồn tại trong schema nhưng chưa bao giờ được nối dây.
- **Cách sửa đúng:** viết một RPC (`get_conversations_with_unread(p_user_id)`) JOIN `messages` với `conversation_members.last_read_at` để COUNT tin nhắn mới hơn `last_read_at` theo từng user, trả về cùng lúc với danh sách hội thoại; cập nhật `last_read_at = now()` mỗi khi `markMessagesAsRead` được gọi (hiện tại hàm này chỉ ghi vào `message_reads`, cần ghi thêm vào `conversation_members.last_read_at`); xoá hẳn cột `conversations.unread` (không dùng được cho group vì nó không per-user) và cột `conversations.presence` (xem mục 7) khỏi schema.

### 4.2 — Rò rỉ PII: số điện thoại của mọi user lộ cho bất kỳ ai đã đăng nhập

- **Mức độ:** Critical
- **Vị trí:** `supabase/migrations/20260716120001_rls_policies.sql` dòng 26: `create policy "profiles_select_all" on public.profiles for select using (auth.role() = 'authenticated');` — chính sách này **không bị thu hẹp lại** ở migration vá bảo mật sau đó.
- **Bằng chứng "đã biết nhưng không sửa":** `supabase/migrations/20260725120000_fix_security_and_policies.sql` dòng 66-71 có comment tiếng Việt viết thẳng: _"Vì Postgres RLS không hỗ trợ giới hạn theo cột, ta tạo RPC bảo mật để tìm kiếm user chỉ trả về các trường công khai... **Policy `profiles_select_all` giữ nguyên** vì cần cho việc resolve thành viên hội thoại."_ — tức là tác giả xác nhận vấn đề tồn tại và chọn giải pháp chỉ vá **một điểm gọi** (RPC `search_users`), không vá **ranh giới thật** (RLS bảng gốc).
- **Kịch bản khai thác:** bất kỳ user nào đã đăng nhập, dùng anon key public (vốn dĩ công khai theo thiết kế Supabase) + JWT của chính họ, gọi thẳng `supabase.from('profiles').select('phone, bio, cover')` (bỏ qua hoàn toàn UI và RPC `search_users`) sẽ lấy được số điện thoại, bio, ảnh bìa của **toàn bộ user trong hệ thống**, kể cả người họ chưa từng tương tác.
- **Cách sửa đúng:** tách bảng `profiles` thành 2: `profiles_public` (id, name, username, avatar — RLS select-all cho authenticated) và `profiles_private` (phone, bio, cover — RLS chỉ `auth.uid() = id`, hoặc `is_conversation_member` với chủ sở hữu). Hoặc dùng một `SECURITY DEFINER` VIEW loại bỏ cột `phone` làm nguồn SELECT mặc định, và REVOKE quyền SELECT trực tiếp trên bảng `profiles` gốc khỏi role `authenticated`.

### 4.3 — Gửi ảnh/video/file: người nhận đang online nhận file vỡ vĩnh viễn

- **Mức độ:** Critical (lỗi tính năng cốt lõi của sản phẩm)
- **Chuỗi bằng chứng đầy đủ:**
  1. `ChatifyApp.tsx::handleAttachmentSend` (dòng ~1232-1286): gửi tin nhắn ngay lập tức với `attachment.url` là **`blob:` URL cục bộ** (`URL.createObjectURL`) trong khi file đang upload nền.
  2. `api.ts::sendMessage` INSERT ngay dòng tin nhắn này vào bảng `messages` — bao gồm cả `attachment.url = "blob:..."`.
  3. `useRealtimeMessages.ts` (toàn bộ file) **chỉ lắng nghe `event: "INSERT"`**, không có handler cho `UPDATE`.
  4. `useMessages.ts::useUpdateMessage` (dòng 94-114) — sau khi upload xong, patch DB bằng một call **fire-and-forget**, chỉ `console.error` nếu lỗi, không retry, không báo người dùng.
  5. `useAttachmentUrl.ts` (dòng 27-34): nếu path bắt đầu bằng `"blob:"`, trả về **nguyên văn**, không xử lý gì thêm.
- **Kết quả:** bất kỳ thành viên nào khác đang mở hội thoại tại thời điểm gửi sẽ nhận message qua Realtime với `attachment.url` là blob URL của trình duyệt người gửi — **vô nghĩa và không thể tải được với bất kỳ ai khác**, kể cả khi upload nền hoàn tất thành công. `TicketStub` (ChatifyApp.tsx dòng 1585-1589) còn hiển thị nhãn gây hiểu lầm thêm: với người nhận, `att.source` là `undefined` nên nhãn hiện "Tệp mẫu" thay vì thông tin đúng.
- **Cách sửa đúng:** thêm `event: "UPDATE"` handler vào `useRealtimeMessages`; **quan trọng hơn**: đảo thứ tự — chỉ INSERT message vào DB **sau khi** upload file xong (giữ optimistic UI ở client-side thuần, không đẩy blob URL lên server), hoặc tách trường `attachment` thành `pending`/nullable rõ ràng và để UI hiển thị trạng thái "đang tải lên..." cho người nhận thay vì một URL vỡ.

### 4.4 — Đổi ảnh đại diện/ảnh bìa: không hề upload, chỉ lưu blob URL cục bộ vào DB

- **Mức độ:** Critical
- **Bằng chứng:** đã grep toàn bộ codebase — `uploadFile()` (hàm upload thật lên Supabase Storage, `src/lib/upload.ts`) **chỉ được gọi đúng 1 lần**, tại `ChatifyApp.tsx` dòng 1264, cho đính kèm tin nhắn. `Modals.tsx::ProfileModal::readFile` (dòng 126-129) dùng `URL.createObjectURL(f)` rồi set thẳng vào `draft.avatar`/`draft.cover`, sau đó `onSave(draft)` → `updateProfile()` ghi chuỗi `blob:...` này thẳng vào cột `profiles.avatar`/`profiles.cover`.
- **Tác động:** ngay lập tức, ảnh đại diện mới **vỡ với mọi người khác** (blob URL chỉ tồn tại trong tab trình duyệt tạo ra nó); sau khi F5, **vỡ luôn cả với chính chủ tài khoản**. Đây là tính năng trông hoàn thiện nhất trong UI (icon camera, animation mượt, file picker riêng cho avatar/cover) nhưng **không có một dòng code nào thực sự upload file**.
- **Cách sửa đúng:** dùng lại chính xác luồng `uploadFile()` đã có sẵn cho đính kèm tin nhắn, tạo path dạng `avatars/{userId}/{uuid}.{ext}` trong bucket riêng (hoặc bucket `attachments` với policy riêng), rồi lưu **storage path** (không phải blob URL) vào `profiles.avatar`, render qua `useAttachmentUrl`/signed URL giống hệt cơ chế đính kèm tin nhắn đã có.

### 4.5 — Trường "Ngày sinh" trong hồ sơ hoàn toàn không có tác dụng, nhưng UI báo "Đã lưu thành công"

- **Mức độ:** High (không nguy hiểm nhưng là hành vi lừa dối UX rõ ràng)
- **Vị trí:** `Modals.tsx::ProfileModal` dòng 203-217 (input `type="date"` cho `draft.birthday`) so với `api.ts::updateProfile` (payload update chỉ có `name, username, avatar, bio, cover, phone` — không có `birthday`) so với schema `profiles` (không có cột `birthday`).
- **Tác động:** người dùng sửa ngày sinh, bấm "Lưu thay đổi", nhận toast "Đã lưu thông tin cá nhân!" (`ChatifyApp.tsx` dòng 293) — nhưng thay đổi bị **âm thầm loại bỏ**, không có cảnh báo nào.
- **Cách sửa đúng:** hoặc thêm cột `birthday date` vào `profiles` và đưa vào payload update, hoặc bỏ hẳn field này khỏi UI cho tới khi được implement thật.

### 4.6 — Race condition khi tham gia nhóm bằng mã mời — bản vá đúng tồn tại nhưng không được dùng

- **Mức độ:** High
- **Vị trí:** RPC đúng `join_via_invite_code` (khoá dòng bằng `FOR UPDATE`, chống TOCTOU) trong `supabase/migrations/20260726130000_fix_per_user_unread_and_rpcs.sql` dòng 20-62 — đã grep xác nhận **0 lần được gọi** trong `src/`. Luồng thật vẫn ở `CreateChatModal::handleExecuteJoin` (ChatifyApp.tsx dòng 2509-2528): gọi `incrementInviteUsage()` (RPC cũ `increment_invite_uses`, không khoá dòng, không kiểm tra lại `max_uses`/`expires_at`) rồi mới gọi `onJoin()` → INSERT trực tiếp vào `conversation_members`.
- **Kịch bản lỗi:** 2 user cùng lúc dùng một mã mời giới hạn `max_uses: 1` — cả hai đều pass bước kiểm tra ban đầu (`lookup_invite_code`, đọc riêng lẻ không khoá), cả hai đều join thành công, mã mời bị dùng vượt giới hạn dự kiến. Ngoài ra, nếu bước join thất bại (ví dụ do RLS/network), lượt dùng của mã mời **vẫn bị trừ** vì `incrementInviteUsage()` được gọi trước và không rollback.
- **Cách sửa đúng:** xoá `incrementInviteUsage()`+luồng insert thủ công khỏi `handleExecuteJoin`, thay bằng một lệnh gọi `supabase.rpc('join_via_invite_code', { p_code: searchVal })` duy nhất — RPC đã viết đúng, chỉ cần nối dây.

---

# 5. Phát hiện bảo mật (Security Findings)

### 5.1 Storage bucket `attachments`: bản vá "private" không bền vững — **đây là phát hiện nghiêm trọng nhất về mặt quy trình trong toàn bộ audit**

- **Vị trí 1:** `scripts/deploy-helper.js` dòng 113 — script setup chính thức (`npm run deploy`) in ra hướng dẫn cuối cùng cho dev: _"Đăng nhập Supabase Dashboard -> Storage và tạo bucket 'attachments' (**chế độ Public**)."_
- **Vị trí 2:** `scripts/verify-supabase.cjs` dòng 68-76 — nếu bucket chưa tồn tại, script **tự động tạo bucket với `public: true`** (hardcode).
- **Vì sao nghiêm trọng:** migration `20260718042447_fix_storage_bucket_privacy.sql` đã sửa đúng (`public = false` + RLS theo `is_conversation_member`), và chính `CLAUDE.md`/`AGENTS.md` trong repo còn ghi rõ cảnh báo: _"Nếu thấy `public: true` ở bất kỳ đâu trong migration mới, đó là lỗi, không phải tính năng"_ — nhưng cảnh báo đó **chỉ nhắm vào migration**, không bao trùm 2 script vận hành này. Bất kỳ ai làm theo đúng quy trình setup chính thức của repo (chạy `npm run deploy` rồi làm theo hướng dẫn in ra, hoặc chạy `verify-supabase.cjs` trên một project mới chưa có bucket) sẽ **tái tạo lại đúng lỗ hổng đã được vá**: toàn bộ file đính kèm (ảnh riêng tư, tài liệu) trở nên đọc được công khai bởi bất kỳ ai trên Internet biết/đoán được path.
- **Fix:** sửa dòng hướng dẫn trong `deploy-helper.js` thành "Private", sửa `verify-supabase.cjs` thành `public: false` kèm áp policy RLS tương ứng ngay trong lúc tạo tự động; thêm một bước CI kiểm tra `SELECT public FROM storage.buckets WHERE id='attachments'` phải là `false` để tự động chặn regression này trong tương lai.

### 5.2 `profiles_select_all` — xem mục 4.2 (đã trình bày chi tiết ở phần Critical Issues).

### 5.3 `increment_invite_uses` RPC không có bất kỳ kiểm tra quyền hay điều kiện nào

- **Vị trí:** `supabase/migrations/20260718042907_add_increment_invite_uses_rpc.sql`.
- **Vấn đề:** hàm `SECURITY DEFINER` này tăng `uses` cho **bất kỳ chuỗi `invite_code` nào** được truyền vào, không kiểm tra `expires_at`, không kiểm tra `max_uses`, không yêu cầu người gọi thực sự đã join. Vì hàm không REVOKE quyền EXECUTE, mặc định Supabase sẽ cấp quyền gọi cho role `authenticated` (và có thể cả `anon`).
- **Kịch bản:** một user (hoặc script) gọi lặp lại RPC này với một mã mời hợp lệ đã biết để đẩy `uses` vượt `max_uses`, khiến các lượt join hợp lệ tiếp theo bị từ chối sai — một dạng DoS nhẹ nhắm vào chức năng mời nhóm.
- **Fix:** thêm điều kiện `WHERE code = invite_code AND (max_uses IS NULL OR uses < max_uses) AND (expires_at IS NULL OR expires_at > now())` vào chính UPDATE; tốt hơn là xoá hẳn RPC này và dùng `join_via_invite_code` (mục 4.6) làm nguồn chân lý duy nhất.

### 5.4 `create_conversation_atomic` không kiểm tra người gọi có thuộc danh sách thành viên

- **Vị trí:** `supabase/migrations/20260725120000_fix_security_and_policies.sql` dòng 95-121.
- **Vấn đề:** hàm `SECURITY DEFINER` (bypass RLS theo thiết kế) nhận `p_member_ids uuid[]` tự do từ client, INSERT thẳng vào `conversation_members` cho toàn bộ danh sách mà **không kiểm tra `auth.uid() = ANY(p_member_ids)`**.
- **Kịch bản:** một user đã đăng nhập có thể gọi RPC này trực tiếp (bỏ qua UI) với danh sách `p_member_ids` chứa ID của người khác (lấy được qua `search_users`) để tạo hội thoại/nhóm có họ trong đó mà không có sự đồng ý của họ, hoặc tạo hội thoại không chứa chính mình.
- **Fix:** thêm `if not (auth.uid() = any(p_member_ids)) then raise exception ...;` ngay đầu hàm; validate `array_length(p_member_ids,1) = array_length(p_member_roles,1)` trước khi loop.

### 5.5 Leo thang đặc quyền: admin có thể tự phong "owner"

- **Mức độ:** High
- **Vị trí 1:** RLS `members_manage_admin` (`20260716120001_rls_policies.sql` dòng 39) chỉ kiểm tra `is_conversation_admin(conversation_id)` cho UPDATE trên `conversation_members`, **không giới hạn giá trị `role` đích** — một "admin" (không phải "owner") có thể tự UPDATE role của chính mình hoặc người khác thành `'owner'`, tạo ra nhiều owner cùng lúc hoặc chiếm quyền, dù UI (`MemberRowActions` trong ChatifyApp.tsx) chỉ cho phép toggle admin↔member.
- **Vị trí 2:** `transfer_ownership_atomic` (`20260726130000_...sql` dòng 65-90) cho phép thực thi nếu `auth.uid() = p_current_owner_id` **HOẶC** `is_conversation_admin(p_conv_id)` — nghĩa là **bất kỳ admin nào** (không chỉ owner thật) có thể chuyển quyền trưởng nhóm cho bất kỳ ai, kể cả chính mình, mà không cần owner hiện tại đồng ý hay biết.
- **Đây là ví dụ điển hình cho nguyên tắc "không được giả định frontend enforcement là đủ":** UI chặn đúng, nhưng ranh giới bảo mật thật (RLS/RPC) lại lỏng hơn UI — ai đó gọi thẳng Supabase client (bỏ qua UI) sẽ vượt qua được giới hạn mà UI tưởng như đã áp đặt.
- **Fix:** trong `transfer_ownership_atomic`, đổi điều kiện thành CHỈ `auth.uid() = p_current_owner_id` (bỏ nhánh `is_conversation_admin`), trừ khi sản phẩm thật sự muốn admin có quyền này (nếu vậy cần UI phản ánh đúng, và log lại hành động để owner biết); trong RLS `members_manage_admin`, thêm `with check` riêng để không cho phép set `role = 'owner'` qua đường UPDATE thông thường — việc trở thành owner chỉ nên đi qua `transfer_ownership_atomic`.

### 5.6 Global Realtime subscription không filter — rủi ro hiệu năng, cần xác nhận RLS Realtime đang bật

- **Mức độ:** Medium (không xác nhận được là rò rỉ dữ liệu thật với bằng chứng đang có, nhưng là thiết kế thiếu phòng thủ theo chiều sâu)
- **Vị trí:** `useRealtimeGlobal.ts` dòng 25-31 — subscribe `postgres_changes` trên bảng `messages`, event `INSERT`, **không có `filter:`** — khác với `useRealtimeMessages.ts` có filter theo `conversation_id`.
- **Phân tích:** RLS SELECT trên `messages` (`messages_select_member`) đã giới hạn đúng theo thành viên hội thoại, và cơ chế Realtime của Supabase về nguyên tắc chỉ đẩy payload cho subscriber nào có quyền SELECT dòng đó theo RLS — nên về lý thuyết không có rò rỉ dữ liệu. Nhưng: (a) đây là niềm tin vào hành vi ngầm định của nền tảng chứ không phải một filter tường minh trong code — không có phòng thủ theo chiều sâu; (b) Postgres/Realtime vẫn phải **đánh giá RLS cho subscriber này với MỌI tin nhắn được insert ở toàn hệ thống**, không chỉ tin nhắn liên quan đến họ — tốn tài nguyên không cần thiết, sẽ lộ rõ khi số lượng user/tin nhắn tăng.
- **Fix:** xác nhận trực tiếp trên Supabase Dashboard rằng Realtime cho bảng `messages` đang bật enforcement theo RLS (không phải chế độ broadcast-all cũ); cân nhắc kiến trúc lại thành 1 channel theo user (`user:{userId}`) được server-side (Edge Function/trigger) chọn lọc và fan-out, thay vì để mọi client subscribe toàn bộ bảng.

### 5.7 Presence toàn cục lộ trạng thái online cho mọi user không phân biệt quan hệ

- **Mức độ:** Low/Medium — cần xác nhận đây có phải chủ đích sản phẩm
- **Vị trí:** `usePresence.ts` — channel `"presence:global"` duy nhất, mọi user `track()` trạng thái online vào đó, mọi user khác đọc được toàn bộ (không giới hạn theo bạn bè/hội thoại chung).
- **Fix (nếu không phải chủ đích):** giới hạn presence theo danh sách bạn bè/hội thoại chung, ví dụ mỗi user chỉ subscribe presence của các thành viên trong hội thoại mình đang có.

### 5.8 Cấu hình mật khẩu tối thiểu 6 ký tự

- **Vị trí:** `supabase/config.toml` dòng 182 (`minimum_password_length = 6`), khớp với check phía client `src/routes/auth.tsx` dòng 52 (`form.password.length < 6`).
- **Lưu ý quan trọng:** `config.toml` là file cấu hình Supabase CLI cho **local dev**, không chắc chắn phản ánh đúng cấu hình của project Supabase Cloud thật đang chạy production — cần xác nhận trực tiếp trên Dashboard. Nếu Cloud project cũng đang ở mức 6 ký tự, nên nâng lên tối thiểu 8-10 ký tự theo khuyến nghị phổ biến hiện nay.

### 5.9 Dependency vulnerabilities (từ `npm audit` chạy thật)

- Kết quả thật: **4 lỗ hổng (1 low, 3 high)** — toàn bộ nằm trong dependency của **build tooling** (`@babel/core`, `postcss` qua UI tagger/Tailwind, `js-yaml`/`brace-expansion` qua `@typescript-eslint`), **không nằm trong bundle chạy thực tế** mà người dùng cuối tải về. Rủi ro thực tế với người dùng cuối là thấp, nhưng nên chạy `npm audit fix` định kỳ như một thói quen vệ sinh dependency, đặc biệt trước khi các bản vá này bị khai thác trong pipeline CI/CD nội bộ (rủi ro chủ yếu nhắm vào máy build, không nhắm vào end-user).

---

# 6. Phát hiện bug / lỗi logic (Bug / Logic Findings)

_(Các bug trùng với mục 4 — realtime attachment vỡ, avatar/cover không upload, unread ảo, birthday không lưu, race condition invite — không lặp lại chi tiết ở đây, chỉ liệt kê các bug còn lại.)_

### 6.1 Username hiển thị là giả — tự chế từ tên hiển thị thay vì dùng username thật

- **Điều gì hỏng:** `@{m.name.toLowerCase().replace(/\s+/g, "")}` xuất hiện tại **2 nơi độc lập**: `ChatifyApp.tsx::DetailPanel` (tab Thành viên, dòng ~2307) và `Modals.tsx::MemberProfileModal` (dòng ~1145) — tự tạo "username" bằng cách viết thường + xoá khoảng trắng từ **tên hiển thị**, trong khi `Member`/`profiles` đã có cột `username` thật (được `mapMemberFromDb` populate đúng).
- **Cách tái hiện:** một user tên "Nguyễn Văn A" với username thật là `@nva_2024` sẽ bị hiển thị nhầm thành `@nguyễnvăna` (thậm chí không loại dấu tiếng Việt) ở 2 màn hình trên.
- **Fix:** đổi cả 2 vị trí thành `@{m.username}` / `@{member.username}`.

### 6.2 Nhận diện bạn bè / hội thoại đã tồn tại dựa trên tên thay vì ID

- **Vị trí:** `ChatifyApp.tsx` — `isFriend` check (dòng 698-701: `seedFriends.some(f => f.name === profileMember.name)`), `onStartChat` (dòng 710: `convs.find(c => !c.isGroup && c.name === profileMember.name)`).
- **Vấn đề:** nếu 2 user khác nhau trùng tên hiển thị, logic này có thể coi nhầm người lạ là bạn bè, hoặc điều hướng nhầm vào cuộc trò chuyện với người khác khi bấm "Nhắn tin".
- **Fix:** so sánh bằng `id`, không bằng `name`.

### 6.3 "Kết bạn" trong Member Profile Modal là nút giả

- **Vị trí:** `ChatifyApp.tsx` dòng 703-707 — `onAddFriend={() => setAddedFriendNames(prev => [...prev, profileMember.name])}` — chỉ đẩy vào state cục bộ, **không gọi `sendFriendRequest()`**.
- **Đối chiếu:** cùng hành động "kết bạn" nhưng thực hiện đúng ở `CreateChatModal::handleSendFriendRequest` (dòng 2529, có gọi API thật). Hai đường dẫn khác nhau cho cùng một tính năng, chỉ một đường hoạt động thật.
- **Fix:** thay thân hàm `onAddFriend` bằng lệnh gọi `sendFriendRequest(profileMember.id, ...)` giống hệt luồng đã đúng kia (cân nhắc gộp chung logic vào một hook `useSendFriendRequest` dùng ở cả 2 nơi).

### 6.4 Hồ sơ cá nhân không được đọc lại từ DB khi mở app

- **Vị trí:** `ChatifyApp.tsx` dòng 278-287 — state `profile` khởi tạo với giá trị **hard-code cứng** (`bio: "Yêu ảnh gốc, ghét bị nén."`, `birthday: "1998-06-12"`, `phone: "+84 912 345 678"`) cho **mọi user**, không có bất kỳ lệnh fetch nào lấy `bio`/`cover`/`phone` thật từ bảng `profiles` khi component mount.
- **Tác động:** dù `updateProfile()` ghi đúng xuống DB, lần mở app tiếp theo (phiên mới) người dùng lại thấy các giá trị mặc định giả này, **trông như thay đổi trước đó bị mất** dù thực ra vẫn còn trong DB — chỉ là chưa từng được đọc lại.
- **Fix:** viết `fetchProfile(userId)` trả đủ field (`bio, cover, phone`, không chỉ `name/username/avatar` như `fetchProfileFromDb` trong `auth.ts` hiện có), gọi trong `useEffect`/React Query khi `ChatifyApp` mount, dùng kết quả để khởi tạo `profile` state thay vì hard-code.

### 6.5 Optimistic attachment cho folder thiếu field bắt buộc — type cast không an toàn gây crash-risk

- **Vị trí:** `ChatifyApp.tsx::handleAttachmentSend` dòng 1234-1239 — `const optimisticAttachment: Attachment = { kind: d.kind, name: d.name, size: d.size, url: d.url || "" } as Attachment;` — với `d.kind === "folder"`, object này **thiếu `files: number` và `children: {...}[]`** mà type `FolderAttachment` yêu cầu; ép kiểu `as Attachment` khiến TypeScript không bắt được lỗi này (đây chính là lý do `tsc --noEmit` sạch dù có bug thật — cast kiểu đã che giấu nó).
- **Cách tái hiện:** gửi một thư mục, trong lúc file đang zip/upload (message có `status: "sending"`), bấm mở accordion của `FolderCard` (`ChatifyApp.tsx` dòng 1704: `att.children.map(...)`) → `TypeError: Cannot read properties of undefined (reading 'map')`.
- **Phạm vi ảnh hưởng:** không có React error boundary ở cấp component (chỉ có `errorComponent` cấp route của TanStack Router tại `src/routes/__root.tsx`) — crash này sẽ làm sập toàn bộ khung chat (không chỉ 1 tin nhắn), người dùng thấy màn hình lỗi chung "Trang không tải được" và mất toàn bộ state đang soạn dở.
- **Fix:** khởi tạo `optimisticAttachment` cho case folder với `files: d.folderFiles?.length ?? 0, children: d.folderFiles ?? []` ngay từ đầu, bỏ cast `as Attachment` không cần thiết; cân nhắc thêm 1 error boundary cấp `ChatArea`/`MessageRow` để một tin nhắn lỗi không kéo sập cả khung chat.

### 6.6 Gọi thoại/video hoàn toàn giả, cờ tính năng không gate được gì

- **Vị trí:** `Modals.tsx::CallModal` dòng 733-749 — `setTimeout(() => setConnected(true), 1600)`, không `RTCPeerConnection`, không `getUserMedia`. `src/lib/config.ts` dòng 69: `export const FEATURE_CALLS = false;` — đã grep xác nhận **không được import ở bất kỳ đâu khác**, nút gọi thoại/video trong `ChatHeader`/`FriendsModal` luôn hiển thị và hoạt động (dàn dựng) bất kể giá trị cờ này.
- **Fix:** hoặc ẩn hẳn nút gọi cho tới khi có WebRTC thật, hoặc dùng `FEATURE_CALLS` để gate UI kèm label rõ ràng "Sắp ra mắt" thay vì mô phỏng một cuộc gọi thật.

### 6.7 `InviteModal` tự sinh mã mời mới mỗi khi đổi dropdown, kể cả khi không bấm nút tạo

- **Vị trí:** `Modals.tsx::InviteModal` dòng 1008-1022 — `handleGenerate` là `useCallback` phụ thuộc `[convId, groupName, expiry, usages]`; `useEffect` gọi `handleGenerate()` mỗi khi `open` **hoặc `handleGenerate` (tức mỗi khi `expiry`/`usages` đổi)** thay đổi.
- **Tác động:** người dùng chỉ cần thử qua các lựa chọn "Thời gian hiệu lực"/"Giới hạn số lần dùng" để xem tuỳ chọn nào phù hợp (không có ý định tạo mã) là mỗi lần đổi lựa chọn sẽ **âm thầm tạo một dòng mới trong `invite_codes`**, rác dần trong DB.
- **Kèm theo:** `catch (e) { /* ignore */ }` (dòng 1013) — nếu tạo mã thất bại (ví dụ do không đủ quyền RLS), người dùng không nhận được bất kỳ thông báo lỗi nào, chỉ thấy ô mã trống.
- **Fix:** tách `useEffect` tạo mã lần đầu (chỉ phụ thuộc `open`) khỏi hành động đổi tuỳ chọn (chỉ áp dụng khi bấm "Tạo mã khác" hoặc debounce rõ ràng); thêm `toast.error` khi `handleGenerate` catch lỗi.

### 6.8 `smoke-test.cjs`: dọn dẹp dữ liệu test không nằm trong khối `finally`

- **Vị trí:** `scripts/smoke-test.cjs` dòng 39-195 — toàn bộ 8 bước test và bước dọn dẹp đều trong cùng 1 khối `try`; nếu bất kỳ bước nào giữa chừng throw, `catch` (dòng 196) chỉ log lỗi, **không chạy phần dọn dẹp** phía trên nó trong cùng khối try.
- **Tác động:** một lần chạy thất bại giữa chừng để lại tài khoản test (`test_user_1_...@example.com`) và có thể cả nhóm/tin nhắn rác trong **project Supabase thật** mà `.env.local` đang trỏ tới — nếu ai đó lỡ chạy script này nhắm vào project production thay vì project test riêng, đây là rủi ro dữ liệu rác thật.
- **Fix:** chuyển toàn bộ logic dọn dẹp vào khối `finally`; thêm safeguard chặn chạy script nếu `VITE_SUPABASE_URL` không khớp một allowlist project test.

---

# 7. Dead code / code không dùng / code trùng lặp

| Mục                                                                                        | Vị trí                                                                                                                                                  | Bằng chứng đã xác minh (grep)                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/session.ts` toàn bộ file                                                          | Cả file (`getSession`, `startSession`, `clearSession`)                                                                                                  | 0 kết quả import ở bất kỳ đâu trong `src/`                                                                                                                                                                              |
| `FEATURE_CALLS`, `FEATURE_READ_RECEIPTS`                                                   | `src/lib/config.ts` dòng 69, 72                                                                                                                         | Chỉ xuất hiện ở dòng định nghĩa, không được import ở nơi khác                                                                                                                                                           |
| Cột `conversations.presence`                                                               | `init_schema.sql`                                                                                                                                       | Không UPDATE ở bất kỳ migration nào; với DM bị `mappedConvs` (ChatifyApp.tsx dòng 245-255) ghi đè hoàn toàn bằng giá trị Realtime; với group không được UI dùng tới                                                     |
| Cột `conversations.unread`                                                                 | `init_schema.sql`                                                                                                                                       | Xem mục 4.1                                                                                                                                                                                                             |
| Cột `conversation_members.last_read_at`                                                    | `20260726130000_...sql`                                                                                                                                 | 0 kết quả tham chiếu trong `src/`                                                                                                                                                                                       |
| RPC `join_via_invite_code`                                                                 | `20260726130000_...sql`                                                                                                                                 | 0 lần được gọi trong `src/` (xem mục 4.6)                                                                                                                                                                               |
| Kiểm tra prefix `"g_"`/`"c_"` trên conversation ID                                         | `ChatifyApp.tsx` dòng 924, 1016, 2068 (3 nơi)                                                                                                           | ID thật sinh bằng `crypto.randomUUID()` (dòng 360 và nhiều nơi khác) — prefix này không bao giờ khớp. Hệ quả phụ: animation "nảy vào" cho hội thoại mới tạo ở `Sidebar` (dòng 923-925) **không bao giờ kích hoạt được** |
| `conv.name?.includes("Nhóm")/("Đội")` để đoán là group                                     | `ChatifyApp.tsx` dòng 1017-1018, 2069-2070                                                                                                              | Cờ `conv.isGroup` từ DB đã đủ tin cậy; heuristic theo tên còn có rủi ro false-positive nếu tên DM trùng chữ "Nhóm"/"Đội"                                                                                                |
| Feed "Thông báo" (tách biệt khỏi danh sách lời mời kết bạn)                                | `ChatifyApp.tsx` dòng 222 (`notifications` state), `Modals.tsx::NotificationsModal`                                                                     | `setNotifications` chỉ được gọi 1 lần duy nhất để mark-all-read (dòng 653) — không có bất kỳ nơi nào **thêm** một notification mới; hằng số `seedNotifications = []` (dòng 167) cũng không được dùng ở đâu              |
| `readEntry`/dead icon branches (`icon === "msg"/"friend"/"call"`) trong NotificationsModal | `Modals.tsx` dòng 602-604                                                                                                                               | Không có nơi nào tạo object `Notification` với các `icon` này — nhánh JSX không bao giờ reachable, hệ quả trực tiếp của mục phía trên                                                                                   |
| `EASE`/`spring` constants định nghĩa trùng lặp                                             | `ChatifyApp.tsx` (dòng 92-94) và `Modals.tsx` (dòng 33-34)                                                                                              | Cùng giá trị, định nghĩa 2 lần thay vì import chung từ 1 module                                                                                                                                                         |
| Logic accept/reject friend request bị viết trùng 2 lần                                     | `useFriends.ts::useRespondToFriendRequest` (hook export sẵn) vs `Modals.tsx::NotificationsModal` (dòng 479-492, `useMutation` inline cùng `mutationFn`) | Cùng logic, không tái sử dụng hook đã có                                                                                                                                                                                |
| `scripts/smoke-test.cjs`, `scripts/verify-supabase.cjs`                                    | Không có trong `package.json` scripts, không có trong `.github/workflows/ci.yml`                                                                        | Tooling mồ côi — tồn tại trong repo nhưng không ai chạy trừ khi biết gõ tay `node scripts/...`                                                                                                                          |
| Trường `phone` được `fetchProfileFromDb` SELECT nhưng bỏ (`auth.ts`)                       | `src/lib/auth.ts`                                                                                                                                       | Query có `phone` trong SELECT nhưng `AuthUser` type/return value không có field này — dữ liệu lấy về rồi vứt                                                                                                            |

---

# 8. Rủi ro bảo trì dài hạn (Long-term Maintenance Risks)

1. **Hai file "chứa cả app":** `ChatifyApp.tsx` (2951 dòng) và `Modals.tsx` (1334 dòng) gộp gần như toàn bộ component, state, side-effect của ứng dụng. Điều này **đi ngược lại chính kế hoạch gốc của dự án** — kế hoạch thiết kế ban đầu từng liệt kê rõ các file riêng biệt dự kiến (`Sidebar.tsx`, `ChatHeader.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `Composer.tsx`, `AttachmentTray.tsx`, `DetailPanel.tsx`...) nhưng không có file nào trong số đó thực sự tồn tại riêng — tất cả bị gộp vào 2 file khi triển khai. Hệ quả: mọi thay đổi nhỏ đều có nguy cơ ảnh hưởng chéo, review code khó, không thể lazy-load từng phần.
2. **Không có test suite tự động nào** — không Vitest/Jest/Playwright trong `devDependencies`, không `npm test`. Hai "bài test" duy nhất (`smoke-test.cjs`, `verify-supabase.cjs`) chạy tay, đụng database Supabase thật, không nằm trong CI. Nghĩa là **toàn bộ ~15 lỗi logic/bảo mật trong báo cáo này sẽ không bao giờ bị CI hiện tại bắt được**, vì CI (`.github/workflows/ci.yml`) chỉ chạy `lint` + `typecheck` + `build` — hoàn toàn không kiểm tra tính đúng đắn của business logic.
3. **CI/CD chưa có bước deploy tự động** — tự tài liệu dev nội bộ (`docs/Chatify-Backend-Master-Plan-v4.md`) cũng ghi nhận đây là hạng mục còn thiếu (đã xác nhận: `ci.yml` chỉ verify, không có job deploy).
4. **Logic nghiệp vụ bị lặp lại thay vì trích xuất dùng chung** — ví dụ rõ nhất: việc suy ra `name/username/avatar` từ `user_metadata` khi thiếu profile được viết tay lặp lại ở nhiều điểm vào trong `auth.ts` (signup, login, getServerUser, getCurrentUser) thay vì 1 helper dùng chung.
5. **Type-safety bị vô hiệu hoá cục bộ bằng ép kiểu** — các cụm `as Attachment`, `as unknown as Extract<...>` (xem mục 6.5) là những "cửa hậu" khiến `tsc --noEmit` báo sạch dù có object thiếu field bắt buộc lọt qua runtime. Càng nhiều điểm ép kiểu kiểu này, độ tin cậy của "0 lỗi TypeScript" càng giảm so với cảm giác an toàn nó tạo ra.
6. **RLS toàn-hàng (row-level) cho bảng chứa cả dữ liệu công khai lẫn nhạy cảm** — vấn đề `profiles.phone` (mục 4.2/5.2) là triệu chứng của một vấn đề thiết kế rộng hơn: Postgres RLS không kiểm soát theo cột, nên bất kỳ cột nhạy cảm nào được thêm vào `profiles` trong tương lai sẽ tự động kế thừa lỗ hổng tương tự trừ khi bảng được tách lại theo mục 4.2.
7. **Lịch sử migration cho thấy quy trình "vá xong ở SQL, quên nối dây ở frontend"** lặp lại ít nhất 3 lần trong 9 migration (bucket privacy fix ổn nhưng script vận hành phá lại — mục 5.1; `join_via_invite_code` không được gọi — mục 4.6; `last_read_at` không được gọi — mục 4.1). Đây là rủi ro **quy trình**, không chỉ là bug đơn lẻ: cần một checklist bắt buộc "mọi migration RPC mới phải có ít nhất 1 call site trong frontend trước khi được coi là DONE".
8. **Chế độ demo (`IS_DEMO_MODE`) rẽ nhánh rải rác khắp codebase** thay vì được cô lập sau một interface/adapter chung — làm tăng bề mặt kiểm thử và rủi ro một nhánh demo bị quên cập nhật khi sửa nhánh production (hoặc ngược lại).

---

# 9. Đánh giá hiệu năng (Performance Review)

- **Kích thước bundle đã đo thật** (`npm run build`, output thực tế): chunk chính `index-*.js` = **383.39 kB (gzip 119.49 kB)**. Toàn bộ modal (Settings, Profile, Friends, Call, Invite, CreateChat, TransferOwnership...) được bundle chung vào lần tải đầu tiên — không có `React.lazy()`/`Suspense` cho các modal ít dùng (đặc biệt `CallModal` chứa animation nặng nhưng chỉ dùng khi bấm gọi). Tách các modal này bằng `React.lazy()` sẽ giảm đáng kể chi phí tải trang lần đầu.
- **`useRealtimeGlobal` subscribe không filter** (mục 5.6) khiến Postgres phải đánh giá RLS cho **mọi** tin nhắn insert trên toàn hệ thống với **mọi** client đang mở app — chi phí tăng tuyến tính theo (số user online) × (tổng tin nhắn toàn hệ thống), không phải theo lưu lượng thật của từng user. Đây là điểm sẽ lộ rõ nhất khi scale.
- **`markMessagesAsRead` bị gọi lại không cần thiết:** `useEffect` trong `ChatifyApp.tsx` (dòng 239-243) phụ thuộc `messages.length` — nghĩa là **kể cả khi chính người dùng gửi tin nhắn của mình**, effect này cũng chạy lại và gọi thêm 1 network round-trip không cần thiết (vì tin tự gửi không thể "chưa đọc" với chính mình).
- **Cảnh báo có thật từ ESLint** (`react-hooks/exhaustive-deps`, đã chạy xác minh): `ChatifyApp.tsx` dòng 174 — `const convs = convsData || [];` tạo mới mảng rỗng mỗi lần render trong lúc chờ data, khiến `useMemo` phụ thuộc `convs` (dòng 255, `mappedConvs`) tính toán lại không cần thiết trong giai đoạn loading.
- **Số lượng Realtime channel mở song song:** 1 channel/hội thoại đang mở (`useRealtimeMessages`) + 1 channel global (`useRealtimeGlobal`) + 1 channel presence (`usePresence`) — chuyển hội thoại liên tục sẽ tạo/huỷ channel liên tục, không có debounce.
- **Không thấy cơ chế phân trang/"tải thêm" cho lịch sử tin nhắn** trong `ChatArea` — tin nhắn được fetch theo một giới hạn cố định, không có infinite-scroll hay nút "xem tin cũ hơn" nối vào UI.
- **Điểm làm tốt đáng ghi nhận:** cơ chế cache signed-URL ở `useAttachmentUrl.ts` (cache client 50 phút, khớp với thời hạn signed URL 60 phút phía server trong `upload.ts`, kèm cơ chế `refresh()` khi ảnh/video load lỗi 403) là một chi tiết hiếm khi được làm cẩn thận đến vậy trong một dự án ở giai đoạn này — tránh được việc tạo signed URL mới cho mỗi lần render.

---

# 10. Kế hoạch sửa lỗi (Fix Plan)

### Bước 1 — Khẩn cấp / chặn ngay trước khi cho bất kỳ ai dùng thật

1. Sửa `scripts/deploy-helper.js` (dòng 113) và `scripts/verify-supabase.cjs` (dòng 74) — đổi hướng dẫn/hardcode bucket sang **private**, thêm bước tạo RLS policy đi kèm nếu tự động tạo bucket. _(Lý do làm trước tiên: đây là điểm duy nhất có thể tự tay tái tạo lại lỗ hổng bảo mật đã biết ngay trong lần setup tiếp theo — rủi ro cao nhất, sửa rẻ nhất.)_
2. Vá `profiles_select_all` — tách bảng hoặc tạo view public không có `phone` (mục 4.2). _(Rủi ro: rò rỉ PII trên diện rộng, đang tồn tại ngay lúc này với dữ liệu thật nếu project đã có user thật.)_
3. Vá luồng gửi đính kèm: đảo thứ tự insert-sau-khi-upload, hoặc thêm `UPDATE` listener vào `useRealtimeMessages` (mục 4.3). _(Rủi ro: tính năng lõi của sản phẩm bị hỏng ngay khi có 2 người dùng thật nói chuyện với nhau.)_
4. Vá avatar/cover: nối vào `uploadFile()` có sẵn thay vì lưu blob URL (mục 4.4).

### Bước 2 — Bảo mật (trong tuần đầu)

5. Thêm `auth.uid() = ANY(p_member_ids)` vào `create_conversation_atomic` (mục 5.4).
6. Sửa điều kiện `transfer_ownership_atomic` chỉ cho phép owner thật (mục 5.5), thêm `with check` chặn set `role='owner'` qua `updateMemberRole`.
7. Thêm điều kiện `max_uses`/`expires_at` vào `increment_invite_uses`, hoặc xoá hẳn và chuyển sang `join_via_invite_code` (mục 5.3, 4.6).
8. Xác nhận trực tiếp trên Supabase Dashboard: Realtime RLS enforcement cho bảng `messages` đang bật (mục 5.6); rà lại `minimum_password_length` trên project Cloud thật (mục 5.8).

### Bước 3 — Đúng đắn chức năng (2 tuần tiếp theo)

9. Viết RPC tính unread per-user thật, cập nhật `last_read_at`, xoá cột `unread`/`presence` chết khỏi `conversations` (mục 4.1, 7).
10. Thêm `fetchProfile()` đọc lại hồ sơ khi mount app (mục 6.4); quyết định giữ/bỏ trường "Ngày sinh" (mục 4.5).
11. Nối `sendFriendRequest` thật vào nút "Kết bạn" trong `MemberProfileModal` (mục 6.3); đổi username giả thành `m.username` thật ở 2 điểm đã nêu (mục 6.1); đổi so khớp theo `id` thay vì `name` (mục 6.2).
12. Sửa `optimisticAttachment` cho folder đủ field, bỏ `as Attachment` (mục 6.5); thêm error boundary quanh `MessageRow`/`ChatArea`.

### Bước 4 — Dọn dẹp / refactor (sau khi ổn định chức năng)

13. Xoá `src/lib/session.ts`, `FEATURE_CALLS`, `FEATURE_READ_RECEIPTS`, các kiểm tra prefix `"g_"/"c_"`, feed "Thông báo" rỗng hoặc implement thật (mục 7).
14. Gộp `EASE`/`spring` constants dùng chung; gộp logic accept/reject friend request về 1 hook (mục 7).
15. Wire `smoke-test.cjs`/`verify-supabase.cjs` vào `package.json` scripts (đặt tên rõ, ví dụ `test:smoke`), sửa cleanup vào `finally` (mục 6.8); cân nhắc thêm chúng (hoặc bản rút gọn) vào CI dưới dạng optional/manual job.

### Bước 5 — Kiến trúc (trung hạn)

16. Tách `ChatifyApp.tsx`/`Modals.tsx` theo đúng ranh giới đã vạch sẵn trong kế hoạch thiết kế ban đầu (mục 8, mục 11).
17. `React.lazy()` cho các modal ít dùng (Call, Settings, Invite...) để giảm bundle đầu (mục 9).
18. Thiết lập test suite tối thiểu (Vitest cho unit test các hàm trong `lib/`, Playwright cho happy-path e2e), đưa vào CI thay vì chỉ lint/typecheck/build.

### Bước 6 — Tuỳ chọn / có thể chờ

19. Tính `dims`/`duration` thật cho ảnh/video thay vì hằng số "gốc"/"—" (mục 6, không nêu chi tiết riêng vì mức độ thấp).
20. `npm audit fix` cho các lỗ hổng dependency build-tooling (mục 5.9).
21. Đồng bộ theme/preference qua DB thay vì chỉ `localStorage` nếu muốn trải nghiệm nhất quán đa thiết bị.

---

# 11. Kế hoạch tái cấu trúc (Recommended Refactor Plan)

**Tách `ChatifyApp.tsx` (2951 dòng) theo đúng ranh giới component đã lộ rõ qua các hàm hiện có** — mỗi `function XYZ(...)` đang định nghĩa trong file này nên trở thành 1 file riêng dưới `src/components/chatify/`:

- `Rail.tsx`, `Sidebar.tsx`, `ChatHeader.tsx`, `ChatArea.tsx`, `MessageRow.tsx` (+`MediaGridItem`, `AttachmentView`, `TicketStub`, `FileCard`, `FolderCard` gộp vào `attachments/`), `Composer.tsx` (+`DraftChip`), `DetailPanel.tsx`, `PreviewModal.tsx`, `CreateChatModal.tsx`.
- File `ChatifyApp.tsx` còn lại chỉ nên giữ: state điều phối cấp cao (`activeId`, các mutation hook, các modal-open state) và phần `return (...)` lắp ráp các component con — tương tự đúng ý định ban đầu trong kế hoạch thiết kế ban đầu.

**Tách state/side-effect ra khỏi component vào các custom hook chuyên biệt:**

- `useActiveConversationSync` — đồng bộ `activeId` ↔ `localStorage` ↔ mark-as-read (hiện đang nằm rải trong `ChatifyApp` dòng 176-243).
- `useProfileState` — bọc việc load/save hồ sơ (giải quyết luôn mục 6.4).
- `useTheme` — bọc `themeKey`/`mode`/`applyTheme`/liquid-pulse animation.

**Đưa business logic hiện đang nằm trong JSX handler ra `lib/`:**

- `handleCreateConversation` (dòng 332-450, ~120 dòng logic thuần) nên chuyển thành 1 hàm trong `lib/conversations.ts`, chỉ nhận input đã chuẩn hoá và trả về payload cho mutation — hiện tại nó vừa build gradient avatar, vừa resolve member profile, vừa validate, tất cả trong 1 hàm component.
- Toàn bộ đoạn "suy luận từ user_metadata khi thiếu profile" trong `auth.ts` (lặp 4 lần) → 1 hàm `resolveProfileFallback(user, meta)` dùng chung.

**Xoá thẳng (không refactor, xoá hẳn) các phần đã xác nhận chết ở mục 7:** `session.ts`, 2 feature flag chết, cột `presence`/`unread` sau khi RPC thay thế đã triển khai, 3 chỗ check prefix `g_/c_`, feed thông báo rỗng (hoặc implement, không được để nửa vời).

**Chuyển RLS nhạy cảm từ "1 bảng, RLS whole-row" sang "tách bảng theo độ nhạy cảm":** áp dụng cho `profiles` như mục 4.2 — đây nên là ưu tiên kiến trúc, không chỉ vá tạm bằng RPC.

**Chuẩn hoá 1 nguồn chân lý cho "hành động đã lỗi thời gian" (deploy tooling):** gộp `deploy-helper.js`/`verify-supabase.cjs`/`smoke-test.cjs` vào cùng 1 module đọc cấu hình bucket/policy từ **chính migration SQL** (ví dụ parse hoặc import 1 file cấu hình chung `storage.config.ts`) thay vì mỗi script tự hardcode lại giả định riêng — đây chính là nguyên nhân gốc khiến bucket bị "public" tái xuất hiện ở 2 nơi độc lập (mục 5.1).

---

# 12. Kết luận cuối cùng (Final Verdict)

**Đã sẵn sàng nối backend thật chưa?** Về mặt kết nối kỹ thuật — có, luồng Supabase (auth/db/storage/realtime) đã được nối đúng và hoạt động, không phải demo giả. Nhưng **về mặt production-safe — chưa**, vì các lý do cụ thể sau, phải sửa xong trước khi launch:

**Bắt buộc phải sửa trước khi launch (blocking):**

- Mục 5.1 — bucket privacy không bền vững qua tooling vận hành.
- Mục 4.2/5.2 — rò rỉ số điện thoại toàn hệ thống.
- Mục 4.3 — đính kèm vỡ với người nhận online (tính năng lõi).
- Mục 4.4 — avatar/cover không thực sự upload.
- Mục 5.4, 5.5 — các lỗ hổng leo quyền/tạo hội thoại tuỳ ý qua RPC.

**Có thể chờ sau launch, nhưng nên làm sớm (không blocking nhưng rủi ro tăng dần):**

- Bộ đếm unread (mục 4.1) — ảnh hưởng UX, không ảnh hưởng bảo mật/dữ liệu.
- Race condition invite code (mục 4.6) — hiếm khi trúng trong thực tế nếu lượng traffic thấp ban đầu, nhưng nên vá trước khi mời nhóm lớn.
- Toàn bộ mục 6 (bug logic), mục 7 (dead code), mục 8 (rủi ro dài hạn) — không chặn launch nhưng sẽ compound thành nợ kỹ thuật lớn nếu để nguyên khi codebase tiếp tục phình to.

**Đánh giá tổng thể:** đây là một dự án được AI-agent lặp đi lặp lại nhiều vòng vá lỗi một cách có phương pháp (lịch sử 9 migration là bằng chứng rõ ràng cho một quy trình tìm-và-vá nghiêm túc), và phần hạ tầng (routing, build, RLS nền tảng, atomic RPC pattern) cho thấy hiểu biết kỹ thuật thật sự đúng đắn ở người/AI thiết kế. Vấn đề lớn nhất không phải là "không biết cách làm đúng" — bằng chứng là các RPC atomic được viết đúng (`join_via_invite_code`, phần lớn `transfer_ownership_atomic`) — mà là **khoảng cách giữa "đã viết bản vá đúng ở SQL" và "đã thực sự nối nó vào frontend đang chạy"**, lặp lại đủ nhiều lần (mục 8.7) để trở thành một rủi ro quy trình cần giải quyết ở cấp quy trình phát triển (checklist/test tích hợp bắt buộc trước khi đóng một "Phase"), không chỉ vá từng lỗi đơn lẻ.

---

# Lộ trình triển khai (Implementation Roadmap)

| #   | Việc cần làm                                                                                         | Ưu tiên | Rủi ro được loại bỏ                                     | Phụ thuộc                                                                     | File/module liên quan                                                                           | Kiểm thử trước khi merge                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Sửa hướng dẫn/hardcode bucket public trong 2 script vận hành                                         | P0      | Tái tạo lỗ hổng đọc file công khai                      | Không                                                                         | `scripts/deploy-helper.js`, `scripts/verify-supabase.cjs`                                       | Chạy `verify-supabase.cjs` trên project test mới, xác nhận `attachmentsBucket.public === false`                  |
| 2   | Tách/giới hạn cột nhạy cảm khỏi `profiles_select_all`                                                | P0      | Rò rỉ SĐT toàn hệ thống                                 | #1 không phụ thuộc                                                            | Migration mới + `mappers.ts`, `api.ts` chỗ nào SELECT `profiles.*`                              | Test bằng 1 user B gọi trực tiếp `.from('profiles').select('phone')`, kỳ vọng không thấy SĐT user khác           |
| 3   | Sửa thứ tự insert/upload cho đính kèm + thêm UPDATE listener                                         | P0      | File/ảnh vỡ với người nhận online                       | Không                                                                         | `ChatifyApp.tsx::handleAttachmentSend`, `useRealtimeMessages.ts`, `useMessages.ts`              | Test thủ công 2 trình duyệt: A gửi ảnh, B (đang mở hội thoại) phải thấy ảnh load được, không phải placeholder vỡ |
| 4   | Nối avatar/cover vào `uploadFile()` thật                                                             | P0      | Ảnh đại diện vỡ vĩnh viễn                               | Không                                                                         | `Modals.tsx::ProfileModal`, `lib/upload.ts`                                                     | Đổi avatar, F5, xác nhận ảnh vẫn còn; user khác xem profile phải thấy đúng ảnh mới                               |
| 5   | Thêm check `auth.uid() = ANY(p_member_ids)` vào `create_conversation_atomic`                         | P0      | Tạo hội thoại chứa người không đồng ý                   | Không                                                                         | Migration mới                                                                                   | Test gọi RPC trực tiếp với `p_member_ids` không chứa `auth.uid()`, kỳ vọng bị raise exception                    |
| 6   | Giới hạn `transfer_ownership_atomic` chỉ owner thật; chặn set `role='owner'` qua `updateMemberRole`  | P0      | Leo quyền owner                                         | Không                                                                         | Migration mới (sửa RPC + thêm `with check`)                                                     | Test: user role admin cố tự set mình thành owner qua cả 2 đường, kỳ vọng đều bị chặn                             |
| 7   | Vá `increment_invite_uses` (thêm điều kiện) hoặc thay hẳn bằng `join_via_invite_code`                | P1      | Race condition + DoS mã mời                             | #5, #6 nên xong trước (cùng đợt sửa RPC)                                      | Migration mới, `CreateChatModal::handleExecuteJoin`, `api.ts::incrementInviteUsage`             | Test 2 request đồng thời join cùng mã `max_uses:1`, kỳ vọng chỉ 1 thành công                                     |
| 8   | Xác nhận Realtime RLS enforcement + rà `minimum_password_length` trên Dashboard thật                 | P1      | Rò rỉ tiềm ẩn qua Realtime; mật khẩu yếu                | Không                                                                         | Cấu hình Supabase Cloud (ngoài repo)                                                            | Kiểm tra thủ công trên Dashboard, ghi lại kết quả vào `docs/`                                                    |
| 9   | RPC unread per-user + cập nhật `last_read_at`; xoá cột `unread`/`presence`                           | P2      | Badge sai lệch, gây mất niềm tin UX                     | #1-8 không bắt buộc trước                                                     | Migration mới, `api.ts::fetchConversations`, `mappers.ts`, `ChatifyApp.tsx::markMessagesAsRead` | So sánh badge trước/sau F5 với 2 tài khoản test, số phải khớp trạng thái đọc thật                                |
| 10  | `fetchProfile()` load lại hồ sơ khi mount; quyết định số phận field "Ngày sinh"                      | P2      | Hồ sơ tưởng mất dữ liệu                                 | Không                                                                         | `lib/api.ts`, `ChatifyApp.tsx`                                                                  | Sửa bio, F5, xác nhận bio vẫn hiển thị đúng giá trị đã lưu                                                       |
| 11  | Nối `sendFriendRequest` thật vào `MemberProfileModal`; sửa username giả (2 nơi); sửa so khớp theo id | P2      | Tính năng giả, sai dữ liệu hiển thị                     | Không                                                                         | `ChatifyApp.tsx` (dòng ~700, ~2307), `Modals.tsx` (dòng ~1145)                                  | Kết bạn từ Member Profile Modal, xác nhận có dòng mới trong `friend_requests`                                    |
| 12  | Sửa `optimisticAttachment` folder đủ field; thêm error boundary quanh message list                   | P2      | Crash toàn app khi mở folder đang tải                   | #3 nên làm cùng đợt                                                           | `ChatifyApp.tsx::handleAttachmentSend`, `FolderCard`, thêm 1 ErrorBoundary component mới        | Gửi thư mục lớn (upload chậm), bấm mở accordion ngay khi đang "Đang chuẩn bị…", kỳ vọng không crash              |
| 13  | Dọn dead code (mục 7)                                                                                | P3      | Nợ kỹ thuật, code gây hiểu nhầm cho dev sau             | Nên làm sau #9 (vì unread/presence liên quan)                                 | Nhiều file, xem bảng mục 7                                                                      | `tsc --noEmit` + `eslint` sau khi xoá vẫn phải sạch                                                              |
| 14  | Tách `ChatifyApp.tsx`/`Modals.tsx` theo kế hoạch mục 11                                              | P3      | Khó bảo trì, review chậm                                | Nên làm sau khi #1-12 ổn định (tránh conflict lớn)                            | Toàn bộ `src/components/chatify/`                                                               | Không đổi hành vi — snapshot/manual QA toàn bộ luồng chính trước/sau tách file                                   |
| 15  | Thiết lập test suite tối thiểu (Vitest + Playwright happy-path), thêm vào CI                         | P3      | Toàn bộ lỗi trong báo cáo này lẽ ra phải bị bắt tự động | Tốt nhất làm song song từ #1, viết test cho từng fix thay vì làm riêng ở cuối | `vitest.config.ts` mới, `.github/workflows/ci.yml`                                              | CI đỏ nếu bug tái xuất hiện                                                                                      |

**Gợi ý thứ tự thực thi cho 1 kỹ sư làm một mình:** #1 → #4 → #3 → #2 → #5 → #6 → #7 → #8, sau đó mới sang nhóm P2 (#9-#12), P3 làm sau cùng khi đã có thời gian thở. Lý do #4 (avatar) đi trước #3 (attachment realtime) dù cùng P0: #4 là fix độc lập, nhỏ, không phụ thuộc gì, nên "ăn điểm nhanh" và giảm số lượng vấn đề mở song song trước khi vào #3 vốn cần test 2-trình-duyệt phức tạp hơn.
