import { useCallback, useEffect, useState } from "react";

/**
 * The theme ring: dark (default, smoked graphite) → console (FounderOS
 * port: matte teal-black + mint + Geist) → light. Set as `data-theme` on
 * <html> (bootstrapped in index.html before paint). This hook reads + cycles
 * it and persists to localStorage, so the top-bar toggle and any Settings
 * control stay in sync. All three themes are first-class — none is a fallback.
 */
export type Theme = "dark" | "console" | "light";
const KEY = "pipo-theme";

export const THEMES: readonly Theme[] = ["dark", "console", "light"];

const THEME_LABEL: Record<Theme, string> = {
  dark: "● dark",
  console: "◈ console",
  light: "○ light",
};

function isTheme(v: string | null): v is Theme {
  return v === "dark" || v === "console" || v === "light";
}

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const t = document.documentElement.getAttribute("data-theme");
  return isTheme(t) ? t : "dark";
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}

export function useTheme(): [Theme, (next?: Theme) => void, string] {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Re-sync on mount in case the bootstrap resolved a different value.
  useEffect(() => { setTheme(currentTheme()); }, []);

  const set = useCallback((next?: Theme) => {
    setTheme((prev) => {
      // No argument: advance around the ring (dark → console → light → dark).
      const t = next ?? THEMES[(THEMES.indexOf(prev) + 1) % THEMES.length]!;
      applyTheme(t);
      return t;
    });
  }, []);

  return [theme, set, THEME_LABEL[theme]];
}
