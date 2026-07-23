const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("====================================================");
  console.log("             CHATIFY SYSTEM SMOKE TESTER            ");
  console.log("====================================================\n");

  // 1. Đọc env vars từ .env.local
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ Lỗi: Không tìm thấy file .env.local!");
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, "utf-8");
  const env = {};
  envContent.split("\n").forEach((line) => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join("=").trim();
    }
  });

  const supabaseUrl = env["VITE_SUPABASE_URL"];
  const supabaseKey = env["VITE_SUPABASE_ANON_KEY"];

  console.log(`🔗 Supabase URL: ${supabaseUrl}`);
  const client1 = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const client2 = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const email1 = `test_user_1_${Date.now()}@example.com`;
  const email2 = `test_user_2_${Date.now()}@example.com`;
  const password = "Password123!";

  let user1Id, user2Id;

  try {
    // ---- TEST 1: Đăng ký tài khoản 1 ----
    console.log(`\n🧪 Test 1: Đăng ký user 1 (${email1})...`);
    const { data: auth1, error: signUpError1 } = await client1.auth.signUp({
      email: email1,
      password: password,
      options: {
        data: {
          name: "Smoke User One",
          username: `smoke_one_${Date.now().toString().slice(-4)}`,
        },
      },
    });

    if (signUpError1) throw signUpError1;
    user1Id = auth1.user.id;
    console.log(`✅ User 1 đăng ký thành công! ID: ${user1Id}`);

    // ---- TEST 2: Đăng ký tài khoản 2 ----
    console.log(`\n🧪 Test 2: Đăng ký user 2 (${email2})...`);
    const { data: auth2, error: signUpError2 } = await client2.auth.signUp({
      email: email2,
      password: password,
      options: {
        data: {
          name: "Smoke User Two",
          username: `smoke_two_${Date.now().toString().slice(-4)}`,
        },
      },
    });

    if (signUpError2) throw signUpError2;
    user2Id = auth2.user.id;
    console.log(`✅ User 2 đăng ký thành công! ID: ${user2Id}`);

    // Đợi 2 giây để trigger profile insert hoàn tất
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // ---- TEST 3: Đăng nhập user 1 & user 2 ----
    console.log("\n🧪 Test 3: Đăng nhập cả 2 user...");
    const { data: login1, error: loginError1 } = await client1.auth.signInWithPassword({
      email: email1,
      password,
    });
    if (loginError1) throw loginError1;
    const { data: login2, error: loginError2 } = await client2.auth.signInWithPassword({
      email: email2,
      password,
    });
    if (loginError2) throw loginError2;
    console.log("✅ Đăng nhập 2 tài khoản thành công!");

    // ---- TEST 4: Tạo group chat từ User 1 ----
    console.log("\n🧪 Test 4: User 1 tạo nhóm chat mới...");
    const { randomUUID } = require("crypto");
    const groupId = `smoke_${randomUUID()}`;

    // Insert conversations thô không dùng .select() để tránh RLS SELECT policy block
    const { error: groupInsertError } = await client1.from("conversations").insert({
      id: groupId,
      name: "Smoke Test Group",
      is_group: true,
    });

    if (groupInsertError) throw groupInsertError;

    // Chèn User 1 làm owner trước
    const { error: ownerError } = await client1.from("conversation_members").insert({
      conversation_id: groupId,
      user_id: user1Id,
      role: "owner",
    });
    if (ownerError) throw ownerError;

    // Lấy thông tin group ra (đã thành công vì đã có member)
    const { data: group, error: groupError } = await client1
      .from("conversations")
      .select()
      .eq("id", groupId)
      .single();

    if (groupError) throw groupError;
    console.log(`✅ Tạo nhóm chat thành công! Group ID: ${group.id}`);

    // ---- TEST 5: Add User 2 vào group chat ----
    console.log("\n🧪 Test 5: Add User 2 vào nhóm chat...");
    const { error: memberError } = await client1.from("conversation_members").insert({
      conversation_id: group.id,
      user_id: user2Id,
      role: "member",
    });

    if (memberError) throw memberError;
    console.log("✅ Add User 2 vào nhóm chat thành công!");

    // ---- TEST 6: User 1 gửi tin nhắn ----
    console.log("\n🧪 Test 6: User 1 gửi tin nhắn lên group...");
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

    if (messageError) throw messageError;
    console.log(`✅ Gửi tin nhắn thành công! Message ID: ${message.id}`);

    // ---- TEST 7: User 2 đọc tin nhắn & đánh dấu đã đọc ----
    console.log("\n🧪 Test 7: User 2 đọc tin nhắn & mark read...");
    const { data: readRec, error: readError } = await client2
      .from("message_reads")
      .insert({
        message_id: message.id,
        user_id: user2Id,
      })
      .select()
      .single();

    if (readError) throw readError;
    console.log(`✅ Mark read thành công! Read Record ID: ${readRec.id}`);

    // ---- TEST 8: User 2 rời nhóm chat ----
    console.log("\n🧪 Test 8: User 2 rời nhóm chat...");
    const { error: leaveError } = await client2
      .from("conversation_members")
      .delete()
      .eq("conversation_id", group.id)
      .eq("user_id", user2Id);

    if (leaveError) throw leaveError;
    console.log("✅ User 2 rời nhóm thành công!");

    // ---- DỌN DẸP DỮ LIỆU ----
    console.log("\n🧹 Đang dọn dẹp dữ liệu test...");
    // Xoá group (cascade sẽ tự động xoá messages và members)
    if (group) {
      await client1.from("conversations").delete().eq("id", group.id);
    }

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const adminClient = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      if (user1Id) await adminClient.auth.admin.deleteUser(user1Id);
      if (user2Id) await adminClient.auth.admin.deleteUser(user2Id);
      console.log("✅ Đã xoá 2 tài khoản test qua Admin API!");
    } else {
      console.warn(
        "⚠️ Không có SUPABASE_SERVICE_ROLE_KEY — tài khoản test KHÔNG được tự động xoá. Xoá thủ công qua Dashboard.",
      );
    }
    console.log("✅ Đã dọn dẹp sạch database!");
  } catch (err) {
    console.error(`\n❌ Smoke Test thất bại tại bước: ${err.message || err}`);
  }

  console.log("\n====================================================");
  console.log("            HOÀN THÀNH SMOKE TEST TOÀN BỘ            ");
  console.log("====================================================");
}

main();
