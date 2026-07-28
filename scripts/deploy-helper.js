const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.clear();
  console.log("====================================================");
  console.log("    CHATIFY BACKEND DEPLOYMENT & GO-LIVE ASSISTANT  ");
  console.log("====================================================");
  console.log("\nScript này sẽ hỗ trợ bạn deploy database schema từ");
  console.log("local lên Supabase và tự động tạo file .env.local.\n");

  try {
    // 1. Login Supabase
    console.log("--- BƯỚC 1: Đăng nhập Supabase CLI ---");
    console.log(
      "Nếu bạn chưa có Access Token, truy cập: https://supabase.com/dashboard/account/tokens để tạo.",
    );
    const token = await question(
      "Nhập Supabase Access Token của bạn (hoặc nhấn Enter để bỏ qua nếu đã login): ",
    );

    if (token.trim()) {
      console.log("\nĐang đăng nhập...");
      execSync(`npx supabase login --token "${token.trim()}"`, { stdio: "inherit" });
      console.log("✅ Đăng nhập CLI thành công!");
    } else {
      console.log("Bỏ qua bước đăng nhập (sử dụng phiên đăng nhập có sẵn nếu có).");
    }

    // 2. Project Ref & DB Password
    console.log("\n--- BƯỚC 2: Nhập thông tin Dự án Supabase ---");
    console.log(
      "Lấy Project Ref từ URL Dashboard (ví dụ: https://supabase.com/dashboard/project/abcde -> Project Ref là abcde)",
    );
    const projectRef = await question("Nhập Supabase Project Ref: ");
    if (!projectRef.trim()) {
      throw new Error("Project Ref không được để trống.");
    }

    const dbPassword = await question(
      "Nhập Database Password (mật khẩu bạn đặt lúc tạo project): ",
    );
    if (!dbPassword.trim()) {
      throw new Error("Database Password không được để trống.");
    }

    // 3. Link Project
    console.log(`\nLiên kết dự án với Ref: ${projectRef.trim()}...`);
    // Ghi file password tạm thời để truyền vào lệnh supabase link
    const pwdFile = path.join(__dirname, ".temp_pwd");
    fs.writeFileSync(pwdFile, dbPassword.trim());

    try {
      execSync(
        `npx supabase link --project-ref "${projectRef.trim()}" --password-file "${pwdFile}"`,
        { stdio: "inherit" },
      );
      console.log("✅ Liên kết dự án Supabase thành công!");
    } finally {
      // Dọn dẹp password file ngay lập tức để bảo mật
      if (fs.existsSync(pwdFile)) {
        fs.unlinkSync(pwdFile);
      }
    }

    // 4. Push Database Schema
    console.log("\n--- BƯỚC 3: Deploy Database Schema (SQL Migrations) ---");
    const confirmPush = await question(
      "Bạn có muốn đẩy database schema lên Supabase ngay bây giờ? (y/n): ",
    );
    if (confirmPush.toLowerCase() === "y" || confirmPush.toLowerCase() === "yes") {
      console.log("Đang đẩy migrations lên Supabase Cloud...");
      execSync("npx supabase db push", { stdio: "inherit" });
      console.log("✅ Deploy Database Schema thành công!");
    } else {
      console.log("Bỏ qua bước deploy database schema.");
    }

    // 5. Tạo file .env.local tự động
    console.log("\n--- BƯỚC 4: Tạo file cấu hình .env.local ---");
    const supabaseUrl = `https://${projectRef.trim()}.supabase.co`;
    console.log(`Supabase URL được xác định là: ${supabaseUrl}`);
    console.log("Vui lòng lấy Anon Key từ Dashboard của bạn (Settings -> API -> anon public key).");
    const anonKey = await question("Nhập Anon Public Key: ");

    if (anonKey.trim()) {
      const envContent = `VITE_SUPABASE_URL=${supabaseUrl}\nVITE_SUPABASE_ANON_KEY=${anonKey.trim()}\n`;
      const envPath = path.join(__dirname, "..", ".env.local");
      fs.writeFileSync(envPath, envContent);
      console.log(`\n✅ Đã tạo file thành công tại: ${envPath}`);
      console.log(
        "File .env.local đã sẵn sàng! Ứng dụng sẽ tự động thoát Demo Mode và kết nối với Backend thật.",
      );
    } else {
      console.log("Bỏ qua bước tạo .env.local.");
    }

    console.log("\n====================================================");
    console.log("      HOÀN THÀNH SETUP HỆ THỐNG BACKEND THẬT!       ");
    console.log("====================================================");
    console.log("\nBây giờ bạn có thể:");
    console.log("1. Chạy 'npm run dev' để test app kết nối backend thật.");
    console.log(
      "2. Đăng nhập Supabase Dashboard -> Storage và tạo bucket 'attachments' (chế độ Private).",
    );
    console.log("3. Tiến hành kiểm thử khói (Smoke Test) với 2 trình duyệt.");
  } catch (error) {
    console.error(`\n❌ Đã xảy ra lỗi: ${error.message}`);
  } finally {
    rl.close();
  }
}

main();
