const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("====================================================");
  console.log("             CLEAR ALL CHATIFY BACKEND DATA         ");
  console.log("====================================================\n");

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

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env.local");
    process.exit(1);
  }

  console.log(`🔗 Dang kết nối Supabase: ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  try {
    console.log("⏳ Đang gọi RPC clear_all_app_data()...");
    const { error } = await supabase.rpc("clear_all_app_data");
    if (error) {
      console.error(
        `⚠️ Gọi RPC không thành công (có thể do RPC chưa được cập nhật trên Cloud): ${error.message}`,
      );
      console.log(
        "💡 Mẹo: Vui lòng push migration lên Supabase Dashboard hoặc chạy SQL bên trong migration 20260728190000_clear_all_app_data.sql trên Supabase SQL Editor!",
      );
    } else {
      console.log("✅ Đã dọn dẹp sạch toàn bộ dữ liệu trên Supabase Backend!");
    }
  } catch (err) {
    console.error(`❌ Lỗi: ${err.message}`);
  }
}

main();
