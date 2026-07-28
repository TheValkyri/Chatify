import { describe, it, expect } from "vitest";
import { mapConversationFromDb, mapMessageFromDb } from "../mappers";

describe("Data Mappers", () => {
  it("should correctly map raw conversation row from Postgres", () => {
    const rawConv = {
      id: "conv-123",
      name: "Dự án Chatify",
      avatar: "https://example.com/avatar.png",
      is_group: true,
      description: "Nhóm thảo luận kĩ thuật",
      preview: "Chào mọi người!",
      presence: "online",
      created_at: "2026-07-28T12:00:00Z",
      updated_at: "2026-07-28T12:05:00Z",
      unread: 0,
      conversation_members: [
        {
          user_id: "user-1",
          role: "owner",
          profiles: { name: "Darne", avatar: "avatar1.png", username: "darne" },
        },
        {
          user_id: "user-2",
          role: "member",
          profiles: { name: "Alice", avatar: "avatar2.png", username: "alice" },
        },
      ],
    };

    const mapped = mapConversationFromDb(rawConv);

    expect(mapped.id).toBe("conv-123");
    expect(mapped.name).toBe("Dự án Chatify");
    expect(mapped.isGroup).toBe(true);
    expect(mapped.members).toHaveLength(2);
    expect(mapped.members[0].role).toBe("owner");
    expect(mapped.members[0].name).toBe("Darne");
  });

  it("should correctly map raw message row from Postgres", () => {
    const rawMsg = {
      id: "msg-999",
      conversation_id: "conv-123",
      author_id: "user-1",
      text: "Xin chào từ Vitest!",
      attachment: null,
      created_at: "2026-07-28T12:10:00Z",
      profiles: { name: "Darne", avatar: "avatar1.png" },
    };

    const mapped = mapMessageFromDb(rawMsg);

    expect(mapped.id).toBe("msg-999");
    expect(mapped.text).toBe("Xin chào từ Vitest!");
    expect(mapped.from).toBe("me");
    expect(mapped.authorName).toBe("Darne");
  });
});
