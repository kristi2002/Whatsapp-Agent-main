"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Inline script that sets the theme class before paint (no flash of wrong theme). */
export const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Passa al tema chiaro" : "Passa al tema scuro"}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover-surface transition-colors"
      style={{ border: "1px solid var(--border)" }}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
