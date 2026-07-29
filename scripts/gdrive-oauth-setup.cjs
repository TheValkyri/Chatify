/**
 * ─── Google Drive OAuth2 Setup Script ─────────────────────────────────────────
 * 
 * Script này giúp bạn lấy REFRESH TOKEN từ tài khoản Google cá nhân.
 * Refresh token cho phép ứng dụng upload files vào Google Drive 5TB của bạn.
 * 
 * HƯỚNG DẪN:
 * 
 * BƯỚC 1: Tạo OAuth2 Client ID
 *   1. Truy cập: https://console.cloud.google.com/apis/credentials
 *      (Project: capable-sled-503905-r7)
 *   2. Nhấn "+ CREATE CREDENTIALS" → "OAuth client ID"
 *   3. Application type: "Desktop app" (hoặc "Web application")
 *   4. Name: "Chatify Desktop"  
 *   5. Nhấn "CREATE"
 *   6. Copy "Client ID" và "Client Secret" → điền vào bên dưới
 * 
 * BƯỚC 2: Cấu hình OAuth Consent Screen (nếu chưa)
 *   1. Truy cập: https://console.cloud.google.com/apis/credentials/consent
 *   2. Chọn "External" → "CREATE"
 *   3. App name: "Chatify", User support email: email của bạn
 *   4. Scopes: thêm "https://www.googleapis.com/auth/drive"
 *   5. Test users: thêm email Google của bạn
 *   6. Nhấn "SAVE AND CONTINUE" qua tất cả các bước
 * 
 * BƯỚC 3: Chạy script này
 *   node scripts/gdrive-oauth-setup.cjs
 *   → Mở link trong trình duyệt → đăng nhập Google → Copy code → Paste vào terminal
 *   → Script sẽ in ra REFRESH TOKEN
 * 
 * BƯỚC 4: Copy refresh token vào src/lib/gdrive.ts
 */

const http = require("http");
const { URL } = require("url");
const readline = require("readline");

// ═══════════════════════════════════════════════════════════════════════════════
// ĐỔI 2 GIÁ TRỊ NÀY SAU KHI TẠO OAUTH CLIENT ID Ở BƯỚC 1:
// ═══════════════════════════════════════════════════════════════════════════════
const CLIENT_ID = "PASTE_YOUR_CLIENT_ID_HERE";
const CLIENT_SECRET = "PASTE_YOUR_CLIENT_SECRET_HERE";
// ═══════════════════════════════════════════════════════════════════════════════

const REDIRECT_URI = "http://localhost:3456/callback";
const SCOPES = "https://www.googleapis.com/auth/drive";

async function main() {
  console.clear();
  console.log("════════════════════════════════════════════════════════════");
  console.log("   CHATIFY — GOOGLE DRIVE OAUTH2 SETUP");
  console.log("════════════════════════════════════════════════════════════\n");

  if (CLIENT_ID === "PASTE_YOUR_CLIENT_ID_HERE") {
    console.log("❌ Bạn chưa điền CLIENT_ID và CLIENT_SECRET!");
    console.log("   Mở file scripts/gdrive-oauth-setup.cjs và điền vào.\n");
    console.log("   Hướng dẫn tạo OAuth Client ID:");
    console.log("   1. Truy cập: https://console.cloud.google.com/apis/credentials");
    console.log("   2. Nhấn '+ CREATE CREDENTIALS' → 'OAuth client ID'");
    console.log("   3. Chọn 'Desktop app', đặt tên 'Chatify Desktop'");
    console.log("   4. Copy Client ID và Client Secret vào file này");
    process.exit(1);
  }

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline` +
    `&prompt=consent`;

  console.log("🔗 Mở link sau trong trình duyệt để đăng nhập Google:\n");
  console.log(`   ${authUrl}\n`);
  console.log("⏳ Đang chờ callback từ trình duyệt...\n");

  // Start local server to capture the callback
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:3456`);
      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        if (code) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`
            <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
              <h1>✅ Đã nhận Authorization Code!</h1>
              <p>Quay lại terminal để xem kết quả.</p>
              <p>Bạn có thể đóng tab này.</p>
            </body></html>
          `);
          server.close();
          resolve(code);
        } else {
          const error = url.searchParams.get("error");
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<html><body><h1>❌ Lỗi: ${error}</h1></body></html>`);
          server.close();
          reject(new Error(error));
        }
      }
    });

    server.listen(3456, () => {
      console.log("   Server callback đang lắng nghe tại http://localhost:3456/callback");
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Timeout: không nhận được callback trong 5 phút."));
    }, 300000);
  });

  console.log("\n✅ Đã nhận Authorization Code!");
  console.log("🔄 Đang đổi code lấy tokens...\n");

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    console.error("❌ Lỗi lấy token:", tokenData.error, tokenData.error_description);
    process.exit(1);
  }

  console.log("════════════════════════════════════════════════════════════");
  console.log("   ✅ THÀNH CÔNG! Copy các giá trị sau:");
  console.log("════════════════════════════════════════════════════════════\n");
  console.log(`REFRESH_TOKEN = "${tokenData.refresh_token}"\n`);
  console.log(`CLIENT_ID     = "${CLIENT_ID}"`);
  console.log(`CLIENT_SECRET = "${CLIENT_SECRET}"\n`);
  console.log("════════════════════════════════════════════════════════════");
  console.log("   Paste 3 giá trị trên vào src/lib/gdrive.ts");
  console.log("════════════════════════════════════════════════════════════\n");
}

main().catch(console.error);
