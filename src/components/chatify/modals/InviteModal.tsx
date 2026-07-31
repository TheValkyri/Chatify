import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Check, ChevronDown } from "lucide-react";
import { generateInviteCode } from "@/lib/api";
import { ModalShell, ModalHeader } from "./ModalShell";

interface Option {
  value: string;
  label: string;
}

function CustomSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const activeOption = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={containerRef} className="relative flex flex-col gap-2">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-[13.5px] font-medium outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/10 text-left transition-all"
      >
        <span className="text-foreground">{activeOption?.label}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="text-muted-foreground"
        >
          <ChevronDown size={16} />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute top-[calc(100%+4px)] left-0 z-50 w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-xl backdrop-blur-lg"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-[13px] text-left transition-colors ${
                    isSelected
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground/80 hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check size={14} className="text-primary" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const expiryOptions = [
  { value: "30m", label: "30 phút" },
  { value: "1h", label: "1 giờ" },
  { value: "24h", label: "24 giờ" },
  { value: "infinite", label: "Không giới hạn" },
];

const usageOptions = [
  { value: "1", label: "1 lần" },
  { value: "5", label: "5 lần" },
  { value: "10", label: "10 lần" },
  { value: "infinite", label: "Không giới hạn" },
];

export function InviteModal({
  open,
  onClose,
  convId,
  groupName,
}: {
  open: boolean;
  onClose: () => void;
  convId: string;
  groupName: string;
}) {
  const [code, setCode] = useState("");
  const [expiry, setExpiry] = useState("30m");
  const [usages, setUsages] = useState("infinite");
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    try {
      const num = await generateInviteCode(convId, groupName, expiry, usages);
      setCode(num);
      setCopied(false);
    } catch (e) {
      // ignore
    }
  }, [convId, groupName, expiry, usages]);

  useEffect(() => {
    if (open) {
      handleGenerate();
    }
  }, [open, handleGenerate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ModalShell open={open} onClose={onClose} size="sm">
      <ModalHeader title="Mã mời vào nhóm" onClose={onClose} />
      <div className="flex flex-col items-center p-6 text-center">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mã mời của {groupName}
        </div>

        <motion.div
          key={code}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 20 }}
          className="my-4 flex items-center justify-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-4 font-mono text-2xl font-bold tracking-widest text-primary shadow-inner"
        >
          <span>
            {code.slice(0, 5)} {code.slice(5)}
          </span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleCopy}
            className={`grid h-9 w-9 place-items-center rounded-xl transition-colors ${
              copied
                ? "bg-emerald-500 text-white"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
            title="Sao chép"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </motion.button>
        </motion.div>

        {copied && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[12px] font-medium text-emerald-400"
          >
            Đã sao chép mã mời!
          </motion.div>
        )}

        <div className="mt-6 w-full text-left flex flex-col gap-4 border-t border-border/40 pt-5 z-20">
          <CustomSelect
            label="Thời gian hiệu lực"
            value={expiry}
            options={expiryOptions}
            onChange={setExpiry}
          />

          <CustomSelect
            label="Giới hạn số lần dùng"
            value={usages}
            options={usageOptions}
            onChange={setUsages}
          />
        </div>

        <div className="mt-6 w-full flex gap-2">
          <button
            onClick={handleGenerate}
            className="flex-1 rounded-full border border-border bg-surface-2 py-2.5 text-[13px] font-medium hover:bg-surface"
          >
            Tạo mã khác
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-primary py-2.5 text-[13px] font-semibold text-primary-foreground shadow-lg"
          >
            Xong
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
