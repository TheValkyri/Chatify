# Kế hoạch: Chatify UI mẫu (app chat + preview file/folder)

Xây một mockup tương tác cho **app chat lõi Chatify**, theo đúng token đã chốt ở Phần 8 (dark-first, accent hồng-đỏ `#F0356B`, bo góc all-soft, font Be Vietnam Pro). Không dính dáng gaming/Clown SMP. Ưu tiên: chuyển động mượt kiểu Apple (spring, ease-out mềm), bo góc lớn, phân cấp thị giác rõ, và preview file/folder khi đính kèm.

## Phạm vi

- Một trang duy nhất tại `/` (thay index placeholder): **màn hình app chat**.
- Chưa cần landing, chưa cần backend, chưa auth — thuần frontend mockup có tương tác trong bộ nhớ.

## Bố cục (3 cột, dày dặn thông tin, nhất quán theo 8.6)

```text
┌─────────┬──────────────────────────┬─────────────┐
│ Rail    │  Conversation column     │  Detail     │
│ (72px)  │  ┌────────────────────┐  │  panel      │
│ avatar  │  │ header (peer)      │  │  (ẩn được)  │
│ nav     │  │────────────────────│  │  - files    │
│ icons   │  │ messages (scroll)  │  │  - members  │
│         │  │────────────────────│  │  - media    │
│         │  │ composer (pill)    │  │             │
│         │  └────────────────────┘  │             │
├─────────┼──────────────────────────┤             │
│ Sidebar danh sách hội thoại (320)  │             │
└─────────┴──────────────────────────┴─────────────┘
```

Thực tế: rail trái 72px + sidebar hội thoại 320px + khung chat co giãn + detail panel 320px (toggle).

## Thành phần chính

1. **Sidebar hội thoại**: search pill, list item (avatar, tên, preview, timestamp, unread badge accent), hover slide nhẹ, active state có thanh accent 2px bên trái + bg tinh tế.
2. **Chat header**: avatar peer + tên + presence dot; nút call/video/info (chỉ visual), toggle detail panel.
3. **Message list**:
   - Bubble text: bo 18px, tin của mình accent `#F0356B` với foreground trắng, tin đối phương surface tối `#1B1A1F`.
   - **Ticket-stub media card** (signature từ 8.4): preview ảnh/video + đường đục lỗ răng cưa ngăn cách + nút "Tải gốc" + metadata (tên, kích thước, độ phân giải).
   - File thường: card bo 14px + icon theo loại + tên + size + progress bar (nếu đang upload).
   - **Folder card**: hiển thị tên folder, số file, tổng dung lượng, expand xem cây file bên trong (accordion mượt).
   - Timestamp group divider, read receipts nhỏ.
4. **Composer (pill)**:
   - Attach button (+) mở menu radial nhẹ: Ảnh/Video, Tài liệu, **Folder** (dùng `webkitdirectory`).
   - Drag & drop overlay toàn khung chat khi kéo file/folder vào — nền mờ + viền dashed accent + text "Thả để đính kèm".
   - **Preview tray phía trên composer**: thumbnail ảnh/video (object-cover, bo 12px), file card gọn, folder card gọn — mỗi item có nút X xoá, hiển thị progress giả lập khi "gửi".
   - Textarea auto-grow, nút gửi tròn accent với scale-active tactile.
5. **Detail panel** (phải): tabs Media/Files/Members với grid gọn.

## Animation & cảm giác (Apple-motion vibe)

- Framer Motion cho: enter tin nhắn mới (spring soft, y: 8→0, opacity, stagger nhẹ), sidebar item hover, drawer detail panel (slide + fade 240ms), composer preview tray (layout animation khi thêm/xoá), drag overlay fade+scale.
- Easing chuẩn: `[0.22, 1, 0.36, 1]` (ease-out-quart) cho UI, spring `stiffness: 260, damping: 26` cho message enter.
- Ripple/tactile scale 0.96 trên nút gửi; hover-lift subtle 1.02 trên ticket card.
- Không dùng animation loè loẹt; tất cả dưới 300ms trừ drawer.

## Design tokens (ghi đè `src/styles.css`)

- Dark mặc định. Off-black ấm `oklch(0.18 0.01 300)` (~#141216), surface nâng `~#1B1A1F`, border `oklch(1 0 0 / 8%)`.
- Accent `--primary` = hồng-đỏ `oklch(0.63 0.22 6)` (~#F0356B), foreground trắng ngà.
- Radius: `--radius: 1rem` để bubble/card mặc định 18–20px, tile 14px, input/button pill (`rounded-full`).
- Font: **Be Vietnam Pro** (400/500/600/700) qua `<link>` Google Fonts trong `__root.tsx` head (không @import trong CSS — đúng rule Tailwind v4). Set `body { font-family: 'Be Vietnam Pro', system-ui, sans-serif; }`.
- Kiểm tra dấu tiếng Việt hiển thị đúng (font đã hỗ trợ đầy đủ).

## Dữ liệu giả

Một file `src/lib/chatify-mock.ts` với: danh sách 6–8 hội thoại, ~15 tin nhắn mẫu trong hội thoại đang mở gồm text, ảnh (ticket stub), video preview, file PDF, và 1 folder ví dụ. Dùng ảnh placeholder từ Unsplash source hoặc SVG gradient tự sinh — không cần asset thật.

## Tương tác thật (không backend)

- Gõ + Enter để gửi → append vào state, animate vào.
- Đính kèm: input `type=file` (multiple + `webkitdirectory` cho folder) → tạo object URL để preview ảnh/video, đọc size/type; hiển thị trong preview tray; bấm gửi → chuyển thành ticket-stub message với progress bar giả lập (0→100% trong 1.2s spring).
- Drag & drop nguyên khung chat.
- Toggle detail panel, toggle sáng/tối (giữ Theme Lock, dark là mặc định).
- Chuyển hội thoại trong sidebar cập nhật header + messages.

## Tệp sẽ tạo/sửa

- `src/routes/index.tsx` — thay placeholder bằng màn hình chat + head() meta thật ("Chatify — Nhắn tin, gửi file gốc").
- `src/routes/__root.tsx` — thêm `<link>` Google Fonts Be Vietnam Pro; cập nhật title/description/og mặc định.
- `src/styles.css` — override tokens (background, foreground, primary, radius, surface phụ).
- `src/components/chatify/` — `Sidebar.tsx`, `ChatHeader.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `TicketStubMedia.tsx`, `FileCard.tsx`, `FolderCard.tsx`, `Composer.tsx`, `AttachmentTray.tsx`, `DetailPanel.tsx`, `DropOverlay.tsx`, `Rail.tsx`.
- `src/lib/chatify-mock.ts` — mock data + types.
- `bun add framer-motion` (nếu chưa có) + dùng `lucide-react` (đã có) cho icon.

## Kiểm tra chất lượng trước khi giao

- Không dùng font Inter mặc định; kiểm dấu tiếng Việt (ư/ơ/đ/thanh) render đúng.
- 1 accent duy nhất xuyên suốt; 1 hệ bo góc; không mix sharp/pill lung tung.
- Không "3 card đều nhau", không eyebrow đếm số, không nhãn BETA.
- Contrast WCAG AA trên bubble tin của mình (accent + text trắng), badge unread, input.
- Trạng thái Empty (chưa chọn hội thoại), Loading (đang upload), Error (upload lỗi) đều có UI rõ ràng.
- Build sạch (typecheck TanStack Start), không lỗi hydration (Framer Motion `LazyMotion` nếu cần).

## Ngoài phạm vi

- Không auth, không WebSocket, không lưu trữ, không Cloud. Sẽ nối vào Lovable Cloud ở bước sau khi bạn duyệt.
