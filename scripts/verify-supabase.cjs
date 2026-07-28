const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("====================================================");
  console.log("      SUPABASE INTEGRATION & CONNECTION VERIFIER     ");
  console.log("====================================================\n");

  // 1. Đọc env vars từ .env.local
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ Lỗi: Không tìm thấy file .env.local! Vui lòng chạy 'npm run deploy' trước.");
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
    console.error(
      "❌ Lỗi: Biến VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY rỗng trong .env.local!",
    );
    process.exit(1);
  }

  console.log(`🔗 Supabase URL: ${supabaseUrl}`);
  console.log("🔑 Đang khởi tạo client...");

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test 1: Kiểm tra kết nối database bằng cách select bảng profiles
    console.log("\n🧪 Test 1: Đọc bảng public.profiles...");
    const { data: profiles, error: dbError } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    if (dbError) {
      console.error(`❌ Test 1 thất bại: ${dbError.message}`);
    } else {
      console.log(`✅ Kết nối database OK! Số profiles đọc được: ${profiles?.length || 0}`);
    }

    // Test 2: Kiểm tra Storage Bucket attachments và RLS
    console.log("\n🧪 Test 2: Kiểm tra Storage Bucket 'attachments'...");
    const { data: buckets, error: storageError } = await supabase.storage.listBuckets();

    if (storageError) {
      console.error(`❌ Test 2 thất bại: ${storageError.message}`);
    } else {
      const attachmentsBucket = buckets?.find((b) => b.id === "attachments");
      if (attachmentsBucket) {
        console.log(
          `✅ Storage Bucket 'attachments' tồn tại (Public: ${attachmentsBucket.public})!`,
        );
        if (attachmentsBucket.public === true) {
          console.warn("⚠️ Warning: Bucket attachments is Public! It should be Private.");
        }
      } else {
        console.warn(
          "⚠️ Cảnh báo: Bucket 'attachments' chưa được tạo! Đang cố gắng tạo bucket tự động...",
        );
        const { data: createData, error: createError } = await supabase.storage.createBucket(
          "attachments",
          {
            public: false,
          },
        );
        if (createError) {
          console.error(
            `❌ Không thể tự động tạo bucket: ${createError.message}. Vui lòng tạo thủ công trên dashboard.`,
          );
        } else {
          console.log("✅ Đã tự động tạo bucket 'attachments' thành công!");
        }
      }
    }

    // Test 3: Test RLS Policy insert/select trên bucket
    console.log("\n🧪 Test 3: Đọc file list từ bucket 'attachments'...");
    const { data: files, error: filesError } = await supabase.storage.from("attachments").list("", {
      limit: 10,
    });

    if (filesError) {
      console.error(`❌ Test 3 thất bại khi đọc files: ${filesError.message}`);
    } else {
      console.log(
        `✅ RLS Policy SELECT trên Storage hoạt động! Đọc được ${files?.length || 0} files.`,
      );
    }
  } catch (err) {
    console.error(`❌ Đã xảy ra lỗi hệ thống: ${err.message}`);
  }

  console.log("\n====================================================");
  console.log("             HOÀN THÀNH KIỂM TRA KẾT NỐI!            ");
  console.log("====================================================");
}

main();
