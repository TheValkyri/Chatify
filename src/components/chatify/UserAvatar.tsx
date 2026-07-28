import { useState, useEffect, useMemo } from "react";

export function UserAvatar({
  src,
  name,
  className = "h-9 w-9 rounded-full",
  textClassName = "text-[12px]",
}: {
  src?: string;
  name: string;
  className?: string;
  textClassName?: string;
}) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [src]);

  const initials = useMemo(() => {
    if (!name) return "U";
    const clean = name.trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }, [name]);

  const bgGradient = useMemo(() => {
    let hash = 0;
    const str = name || "user";
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const gradients = [
      "from-rose-500 to-pink-600",
      "from-violet-600 to-indigo-600",
      "from-blue-500 to-cyan-600",
      "from-emerald-500 to-teal-600",
      "from-amber-500 to-orange-600",
      "from-fuchsia-600 to-purple-600",
    ];
    return gradients[Math.abs(hash) % gradients.length];
  }, [name]);

  const isDataSvg = src?.startsWith("data:image/svg+xml");

  if (!src || error || isDataSvg) {
    return (
      <div
        className={`grid place-items-center bg-gradient-to-br ${bgGradient} font-semibold text-white shadow-xs shrink-0 select-none ${className}`}
      >
        <span className={textClassName}>{initials}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      onError={() => setError(true)}
      className={`object-cover shrink-0 ${className}`}
    />
  );
}
