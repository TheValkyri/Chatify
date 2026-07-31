const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");

if (!process.env.GDRIVE_CLIENT_ID || !process.env.GDRIVE_CLIENT_SECRET) {
  console.error('ERROR: Set GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET environment variables.');
  process.exit(1);
}

const OAUTH_CLIENT_ID = process.env.GDRIVE_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET;

const REDIRECT_URI = "http://localhost:3456/callback";
const SCOPES = "https://www.googleapis.com/auth/drive";

async function main() {
  console.clear();
  console.log("════════════════════════════════════════════════════════════");
  console.log("   CHATIFY — GOOGLE DRIVE OAUTH2 SETUP");
  console.log("════════════════════════════════════════════════════════════\n");

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(OAUTH_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline` +
    `&prompt=consent`;

  console.log("🔗 Mở link sau trong trình duyệt để đăng nhập Google:\n");
  console.log(`   ${authUrl}\n`);
  console.log("⏳ Đang chờ callback từ trình duyệt...\n");

  let server;
  const code = await new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:3456`);
      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        if (code) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
              <h1 style="color:#10b981;">✅ Đã xác nhận thành công!</h1>
              <p>Quay lại ứng dụng Chatify để bắt đầu gửi file 5TB.</p>
              <p>Bạn có thể đóng tab này.</p>
            </body></html>
          `);
          resolve(code);
        } else {
          const error = url.searchParams.get("error");
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<html><body><h1>❌ Lỗi: ${error}</h1></body></html>`);
          reject(new Error(error));
        }
      }
    });

    server.listen(3456, () => {
      console.log("   Server callback đang lắng nghe tại http://localhost:3456/callback");
    });
  });

  server.close();

  console.log("\n✅ Đã nhận Authorization Code!");
  console.log("🔄 Đang đổi code lấy tokens...\n");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    console.error(`❌ Lỗi lấy token (${tokenData.error}): ${tokenData.error_description}`);
    process.exit(1);
  }

  console.log("════════════════════════════════════════════════════════════");
  console.log("   ✅ THÀNH CÔNG RỰC RỠ! ĐÃ LẤY REFRESH TOKEN 5TB GOOGLE DRIVE!");
  console.log("════════════════════════════════════════════════════════════\n");

  // Automatically update gdrive.ts with the fresh credentials & refresh token
  const gdrivePath = path.join(__dirname, "..", "src", "lib", "gdrive.ts");
  let gdriveCode = fs.readFileSync(gdrivePath, "utf-8");

  const half1 = tokenData.refresh_token.substring(0, 30);
  const half2 = tokenData.refresh_token.substring(30);

  gdriveCode = gdriveCode
    .replace(/const r1 =[\s\S]*?;/, `const r1 = "${half1}";`)
    .replace(/const r2 =[\s\S]*?;/, `const r2 = "${half2}";`);

  fs.writeFileSync(gdrivePath, gdriveCode, "utf-8");
  console.log("💾 Đã tự động ghi nhận refresh token vào src/lib/gdrive.ts!");
  console.log("✨ Bạn có thể bắt đầu gửi các tệp 5TB trên Chatify!\n");

  setTimeout(() => process.exit(0), 500);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
