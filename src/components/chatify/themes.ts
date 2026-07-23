export type ThemeVars = {
  background: string;
  foreground: string;
  surface: string;
  surface2: string;
  primary: string;
  primaryFg: string;
  muted: string;
  mutedFg: string;
  border: string;
  input: string;
  ring: string;
  ambient1: string;
  ambient2: string;
};

export type ThemeDef = {
  key: string;
  name: string;
  swatch: string; // preview color
  dark: ThemeVars;
  light: ThemeVars;
};

export const THEMES: ThemeDef[] = [
  {
    key: "peach",
    name: "Đào ấm",
    swatch: "#f5a57d",
    dark: {
      background: "oklch(0.17 0.012 50)",
      foreground: "oklch(0.94 0.014 75)",
      surface: "oklch(0.215 0.014 50)",
      surface2: "oklch(0.255 0.016 50)",
      primary: "oklch(0.80 0.10 55)",
      primaryFg: "oklch(0.24 0.04 45)",
      muted: "oklch(0.26 0.014 50)",
      mutedFg: "oklch(0.72 0.018 65)",
      border: "oklch(1 0 0 / 8%)",
      input: "oklch(1 0 0 / 10%)",
      ring: "oklch(0.80 0.10 55 / 55%)",
      ambient1: "#f5a57d",
      ambient2: "#c4623a",
    },
    light: {
      background: "oklch(0.975 0.008 80)",
      foreground: "oklch(0.20 0.02 50)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.955 0.01 80)",
      primary: "oklch(0.72 0.13 50)",
      primaryFg: "oklch(0.16 0.03 45)",
      muted: "oklch(0.94 0.012 80)",
      mutedFg: "oklch(0.42 0.02 60)",
      border: "oklch(0 0 0 / 10%)",
      input: "oklch(0 0 0 / 10%)",
      ring: "oklch(0.72 0.13 50 / 50%)",
      ambient1: "#f5a57d",
      ambient2: "#e8a87c",
    },
  },
  {
    key: "indigo",
    name: "Midnight Indigo",
    swatch: "#7c86ff",
    dark: {
      background: "oklch(0.16 0.02 280)",
      foreground: "oklch(0.95 0.01 280)",
      surface: "oklch(0.22 0.025 280)",
      surface2: "oklch(0.27 0.03 280)",
      primary: "oklch(0.72 0.16 280)",
      primaryFg: "oklch(0.98 0.005 280)",
      muted: "oklch(0.26 0.02 280)",
      mutedFg: "oklch(0.72 0.02 280)",
      border: "oklch(1 0 0 / 8%)",
      input: "oklch(1 0 0 / 10%)",
      ring: "oklch(0.72 0.16 280 / 55%)",
      ambient1: "#7c86ff",
      ambient2: "#3d3fa8",
    },
    light: {
      background: "oklch(0.98 0.005 280)",
      foreground: "oklch(0.18 0.03 280)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.955 0.01 280)",
      primary: "oklch(0.55 0.20 280)",
      primaryFg: "oklch(0.99 0.005 280)",
      muted: "oklch(0.94 0.01 280)",
      mutedFg: "oklch(0.40 0.03 280)",
      border: "oklch(0 0 0 / 10%)",
      input: "oklch(0 0 0 / 10%)",
      ring: "oklch(0.55 0.20 280 / 50%)",
      ambient1: "#a5adff",
      ambient2: "#7c86ff",
    },
  },
  {
    key: "forest",
    name: "Rừng xanh",
    swatch: "#7fc79a",
    dark: {
      background: "oklch(0.17 0.018 150)",
      foreground: "oklch(0.94 0.015 130)",
      surface: "oklch(0.22 0.02 150)",
      surface2: "oklch(0.27 0.025 150)",
      primary: "oklch(0.78 0.13 150)",
      primaryFg: "oklch(0.18 0.04 150)",
      muted: "oklch(0.26 0.02 150)",
      mutedFg: "oklch(0.72 0.02 140)",
      border: "oklch(1 0 0 / 8%)",
      input: "oklch(1 0 0 / 10%)",
      ring: "oklch(0.78 0.13 150 / 55%)",
      ambient1: "#7fc79a",
      ambient2: "#2f7a4d",
    },
    light: {
      background: "oklch(0.98 0.008 130)",
      foreground: "oklch(0.18 0.03 150)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.955 0.012 130)",
      primary: "oklch(0.55 0.14 150)",
      primaryFg: "oklch(0.99 0.005 130)",
      muted: "oklch(0.94 0.01 130)",
      mutedFg: "oklch(0.40 0.03 150)",
      border: "oklch(0 0 0 / 10%)",
      input: "oklch(0 0 0 / 10%)",
      ring: "oklch(0.55 0.14 150 / 50%)",
      ambient1: "#a4dcb8",
      ambient2: "#7fc79a",
    },
  },
  {
    key: "rose",
    name: "Hồng ruby",
    swatch: "#f5497a",
    dark: {
      background: "oklch(0.16 0.02 12)",
      foreground: "oklch(0.95 0.014 20)",
      surface: "oklch(0.22 0.025 12)",
      surface2: "oklch(0.27 0.028 12)",
      primary: "oklch(0.68 0.22 8)",
      primaryFg: "oklch(0.99 0.005 20)",
      muted: "oklch(0.26 0.02 12)",
      mutedFg: "oklch(0.72 0.02 20)",
      border: "oklch(1 0 0 / 8%)",
      input: "oklch(1 0 0 / 10%)",
      ring: "oklch(0.68 0.22 8 / 55%)",
      ambient1: "#f5497a",
      ambient2: "#7c1d3d",
    },
    light: {
      background: "oklch(0.98 0.006 20)",
      foreground: "oklch(0.18 0.03 12)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.955 0.012 20)",
      primary: "oklch(0.60 0.22 8)",
      primaryFg: "oklch(0.99 0.005 20)",
      muted: "oklch(0.94 0.01 20)",
      mutedFg: "oklch(0.40 0.03 12)",
      border: "oklch(0 0 0 / 10%)",
      input: "oklch(0 0 0 / 10%)",
      ring: "oklch(0.60 0.22 8 / 50%)",
      ambient1: "#fca5be",
      ambient2: "#f5497a",
    },
  },
  {
    key: "ocean",
    name: "Đại dương",
    swatch: "#5cbdb9",
    dark: {
      background: "oklch(0.17 0.02 220)",
      foreground: "oklch(0.94 0.014 210)",
      surface: "oklch(0.22 0.025 220)",
      surface2: "oklch(0.27 0.028 220)",
      primary: "oklch(0.75 0.12 210)",
      primaryFg: "oklch(0.18 0.04 220)",
      muted: "oklch(0.26 0.02 220)",
      mutedFg: "oklch(0.72 0.02 210)",
      border: "oklch(1 0 0 / 8%)",
      input: "oklch(1 0 0 / 10%)",
      ring: "oklch(0.75 0.12 210 / 55%)",
      ambient1: "#5cbdb9",
      ambient2: "#0c2340",
    },
    light: {
      background: "oklch(0.98 0.008 210)",
      foreground: "oklch(0.18 0.03 220)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.955 0.012 210)",
      primary: "oklch(0.52 0.14 220)",
      primaryFg: "oklch(0.99 0.005 210)",
      muted: "oklch(0.94 0.01 210)",
      mutedFg: "oklch(0.40 0.03 220)",
      border: "oklch(0 0 0 / 10%)",
      input: "oklch(0 0 0 / 10%)",
      ring: "oklch(0.52 0.14 220 / 50%)",
      ambient1: "#8dd6d2",
      ambient2: "#5cbdb9",
    },
  },
  {
    key: "noir",
    name: "Noir Gold",
    swatch: "#c9a84c",
    dark: {
      background: "oklch(0.14 0.006 80)",
      foreground: "oklch(0.94 0.012 80)",
      surface: "oklch(0.19 0.008 80)",
      surface2: "oklch(0.24 0.01 80)",
      primary: "oklch(0.78 0.13 85)",
      primaryFg: "oklch(0.15 0.03 80)",
      muted: "oklch(0.24 0.008 80)",
      mutedFg: "oklch(0.72 0.014 80)",
      border: "oklch(1 0 0 / 8%)",
      input: "oklch(1 0 0 / 10%)",
      ring: "oklch(0.78 0.13 85 / 55%)",
      ambient1: "#c9a84c",
      ambient2: "#5a4820",
    },
    light: {
      background: "oklch(0.97 0.008 80)",
      foreground: "oklch(0.16 0.02 80)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.95 0.01 80)",
      primary: "oklch(0.60 0.13 85)",
      primaryFg: "oklch(0.99 0.005 80)",
      muted: "oklch(0.94 0.01 80)",
      mutedFg: "oklch(0.40 0.02 80)",
      border: "oklch(0 0 0 / 10%)",
      input: "oklch(0 0 0 / 10%)",
      ring: "oklch(0.60 0.13 85 / 50%)",
      ambient1: "#e2c876",
      ambient2: "#c9a84c",
    },
  },
];

export function applyTheme(theme: ThemeDef, mode: "dark" | "light") {
  const v = mode === "dark" ? theme.dark : theme.light;
  const root = document.documentElement;
  root.style.setProperty("--background", v.background);
  root.style.setProperty("--foreground", v.foreground);
  root.style.setProperty("--surface", v.surface);
  root.style.setProperty("--surface-2", v.surface2);
  root.style.setProperty("--card", v.surface);
  root.style.setProperty("--card-foreground", v.foreground);
  root.style.setProperty("--popover", v.surface);
  root.style.setProperty("--popover-foreground", v.foreground);
  root.style.setProperty("--primary", v.primary);
  root.style.setProperty("--primary-foreground", v.primaryFg);
  root.style.setProperty("--secondary", v.surface2);
  root.style.setProperty("--secondary-foreground", v.foreground);
  root.style.setProperty("--muted", v.muted);
  root.style.setProperty("--muted-foreground", v.mutedFg);
  root.style.setProperty("--accent", v.surface2);
  root.style.setProperty("--accent-foreground", v.foreground);
  root.style.setProperty("--border", v.border);
  root.style.setProperty("--input", v.input);
  root.style.setProperty("--ring", v.ring);
  root.style.setProperty("--ambient-1", v.ambient1);
  root.style.setProperty("--ambient-2", v.ambient2);
  if (mode === "light") root.classList.add("light");
  else root.classList.remove("light");
}
