import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { getCurrentUser, login, signup, type AuthError } from "@/lib/auth";
import { IS_DEMO_MODE } from "@/lib/config";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (user) {
      throw redirect({ to: "/", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "Chatify — Đăng nhập" },
      {
        name: "description",
        content: "Đăng nhập vào Chatify — nhắn tin cho nhóm nhỏ, giữ nguyên chất lượng file gốc.",
      },
      { property: "og:title", content: "Chatify — Đăng nhập" },
      { property: "og:url", content: "/auth" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
  component: AuthPage,
});

const EASE = [0.22, 1, 0.36, 1] as const;
const springSoft = { type: "spring" as const, stiffness: 260, damping: 28 };
type Tab = "signin" | "signup";

function AuthPage() {
  const [tab, setTab] = useState<Tab>("signin");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    const name = tab === "signup" ? form.name.trim() : email.split("@")[0];
    const usernameRaw = tab === "signup" ? form.username.trim() : email.split("@")[0];
    const username = usernameRaw.toLowerCase().replace("@", "");

    if (!name || !email || !username || form.password.length < 6) {
      setError("Hãy nhập đủ thông tin hợp lệ để tiếp tục.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (tab === "signup") {
        await signup({ name, username, email, password: form.password });
      } else {
        await login(email, form.password);
      }
      setIsRedirecting(true);
      setTimeout(() => {
        navigate({ to: "/", replace: true });
      }, 800);
    } catch (err) {
      const authErr = err as AuthError;
      setError(authErr.message || "Đăng nhập thất bại. Vui lòng thử lại.");
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{ backgroundColor: "#14100d", color: "#f1e9df" }}
    >
      {/* Ambient warm glow — motion background */}
      <BackgroundGlow />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-14">
        {/* Wordmark */}
        <AnimatePresence>
          {!isRedirecting && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.95, filter: "blur(6px)" }}
              transition={{ duration: 0.5, ease: EASE }}
              className="mb-6 text-center"
            >
              <h1
                className="text-[64px] leading-none tracking-tight"
                style={{ fontFamily: "'Instrument Serif', serif", color: "#f6ecdf" }}
              >
                Chatify<span style={{ color: "#f5a57d" }}>.</span>
              </h1>
              <p
                className="mx-auto mt-5 max-w-[280px] text-[13.5px] leading-relaxed"
                style={{ color: "#a89b8c" }}
              >
                Nhắn tin chất lượng cao cho nhóm sáng tạo. Không gian tĩnh, kho chia sẻ chung, không
                ồn ào.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card */}
        <AnimatePresence>
          {!isRedirecting && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.93, filter: "blur(8px)" }}
              transition={{ duration: 0.55, ease: EASE, delay: 0.08 }}
              className="w-full max-w-[420px] overflow-hidden rounded-[26px] border p-6 backdrop-blur-xl sm:p-7"
              style={{
                backgroundColor: "rgba(28, 22, 18, 0.72)",
                borderColor: "rgba(255,255,255,0.06)",
                boxShadow:
                  "0 30px 80px -30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)",
              }}
            >
              {/* Tabs */}
              <div className="relative mb-6 flex">
                {(
                  [
                    { k: "signin", l: "Sign in" },
                    { k: "signup", l: "Tạo tài khoản" },
                  ] as const
                ).map((t) => {
                  const active = tab === t.k;
                  return (
                    <button
                      key={t.k}
                      type="button"
                      onClick={() => setTab(t.k)}
                      className="relative flex-1 pb-3 text-center text-[13.5px] font-medium transition-colors"
                      style={{ color: active ? "#f6ecdf" : "#847768" }}
                    >
                      {t.k === "signin" ? "Đăng nhập" : t.l}
                      {active && (
                        <motion.span
                          layoutId="auth-tab-underline"
                          className="absolute inset-x-6 -bottom-px h-[2px] rounded-full"
                          style={{ backgroundColor: "#f5a57d" }}
                          transition={{ type: "spring", stiffness: 400, damping: 32 }}
                        />
                      )}
                    </button>
                  );
                })}
                <div
                  className="absolute inset-x-0 bottom-0 h-px"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                />
              </div>

              <motion.form layout onSubmit={submit} className="flex flex-col gap-4">
                <motion.div layout className="flex flex-col gap-4">
                  <AnimatePresence initial={false}>
                    {tab === "signup" && (
                      <motion.div
                        key="signup-fields"
                        initial={{ opacity: 0, height: 0, scale: 0.95, marginBottom: -16 }}
                        animate={{ opacity: 1, height: "auto", scale: 1, marginBottom: 0 }}
                        exit={{ opacity: 0, height: 0, scale: 0.95, marginBottom: -16 }}
                        transition={{ type: "spring", stiffness: 350, damping: 26 }}
                        className="p-1 -m-1 flex flex-col gap-4"
                      >
                        <Field label="Tên hiển thị">
                          <input
                            required
                            value={form.name}
                            onChange={(e) => set("name", e.target.value)}
                            placeholder="Tên hiển thị"
                            maxLength={60}
                            className="w-full bg-transparent text-[14px] outline-none placeholder:opacity-40"
                            style={{ color: "#f1e9df" }}
                          />
                        </Field>

                        <Field label="Tên tài khoản (Username)">
                          <input
                            required
                            value={form.username}
                            onChange={(e) => set("username", e.target.value)}
                            placeholder="ví dụ: nguyenvana"
                            maxLength={30}
                            className="w-full bg-transparent text-[14px] outline-none placeholder:opacity-40"
                            style={{ color: "#f1e9df" }}
                          />
                        </Field>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Field label="Email">
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="ban@chatify.app"
                      maxLength={120}
                      className="w-full bg-transparent text-[14px] outline-none placeholder:opacity-40"
                      style={{ color: "#f1e9df" }}
                    />
                  </Field>

                  <Field label="Password">
                    <input
                      required
                      minLength={6}
                      maxLength={80}
                      type={showPw ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-transparent text-[14px] outline-none placeholder:opacity-40"
                      style={{ color: "#f1e9df" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="ml-2 grid h-7 w-7 place-items-center rounded-full transition-colors"
                      style={{ color: "#847768" }}
                      aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </Field>
                </motion.div>

                {error && (
                  <p role="alert" className="text-center text-[12px] text-[#f5a57d]">
                    {error}
                  </p>
                )}

                <motion.button
                  layout
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: loading ? 1 : 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  transition={springSoft}
                  className="relative mt-2 flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full text-[14px] font-semibold transition-opacity disabled:opacity-80"
                  style={{
                    backgroundColor: "#f5a57d",
                    color: "#2a170c",
                    boxShadow:
                      "0 14px 40px -14px rgba(245,165,125,0.6), inset 0 1px 0 rgba(255,255,255,0.35)",
                  }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {loading ? (
                      <motion.span
                        key="l"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <Loader2 size={16} className="animate-spin" />
                        Đang xử lý…
                      </motion.span>
                    ) : (
                      <motion.span
                        key={tab}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2, ease: EASE }}
                      >
                        {tab === "signin" ? "Vào Chatify" : "Tạo tài khoản"}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>

                <p className="mt-1 text-center text-[11.5px]" style={{ color: "#7a6d5e" }}>
                  {IS_DEMO_MODE
                    ? "Chế độ demo — dữ liệu lưu tạm trên trình duyệt này."
                    : "Kết nối bảo mật tới Chatify server."}
                </p>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isRedirecting ? 0 : 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mt-8 flex items-center gap-2 text-[12px]"
          style={{ color: "#6b5f52" }}
        >
          <span>Chatify · phiên cục bộ</span>
        </motion.div>
      </div>

      {/* Radial Transition Curtain */}
      <AnimatePresence>
        {isRedirecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#14100d]"
          >
            {/* Center flash of warm light */}
            <motion.div
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: 5, opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-96 w-96 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(245,165,125,0.4) 0%, rgba(245,165,125,0) 70%)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------- Field -------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const [focused, setFocused] = useState(false);

  return (
    <label className="flex flex-col gap-2 p-1 -m-1">
      <span className="text-[12px] font-medium tracking-wide" style={{ color: "#c8bcae" }}>
        {label}
      </span>
      <motion.div
        animate={{
          scale: focused ? 1.01 : 1,
          borderColor: focused ? "rgba(245, 165, 125, 0.45)" : "rgba(255, 255, 255, 0.06)",
          boxShadow: focused ? "0 0 0 3.5px rgba(245, 165, 125, 0.12)" : "0 0 0 0px transparent",
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
        className="flex items-center rounded-2xl border px-4 py-3 transition-colors"
        style={{
          backgroundColor: "rgba(15, 11, 9, 0.6)",
        }}
      >
        {children}
      </motion.div>
    </label>
  );
}

/* -------- Ambient background glow -------- */
function BackgroundGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        aria-hidden
        className="absolute -left-40 top-1/3 h-[520px] w-[520px] rounded-full opacity-[0.18] blur-[120px]"
        style={{ backgroundColor: "#f5a57d" }}
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute -right-40 bottom-1/4 h-[460px] w-[460px] rounded-full opacity-[0.12] blur-[130px]"
        style={{ backgroundColor: "#c4623a" }}
        animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Grain */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
}
