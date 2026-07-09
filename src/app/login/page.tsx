"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MessageSquare, CalendarDays, ShieldCheck } from "lucide-react";
import { Button, Input } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(next);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Accesso non riuscito");
      }
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}>
            <span className="text-base font-bold tracking-tight" style={{ color: "#fff" }}>MT</span>
          </div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Max&amp;Tony Nazionale</h1>
          <p className="text-xs text-muted mt-0.5">Gestionale · Accesso staff</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4" style={{ boxShadow: "var(--shadow)" }}>
          <label className="block">
            <span className="block text-xs text-muted mb-1.5">Password</span>
            <Input id="password" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>
          {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !password}>{loading ? "Accesso…" : "Entra"}</Button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-faint pt-1"><ShieldCheck size={12} /> Accesso riservato allo staff del salone</p>
        </form>

        <div className="flex items-center justify-center gap-5 mt-5 text-xs">
          <Link href="/prenota" className="inline-flex items-center gap-1.5 text-muted hover:text-accent transition-colors"><CalendarDays size={13} /> Prenota online</Link>
          <span className="text-faint">·</span>
          <Link href="/privacy" className="inline-flex items-center gap-1.5 text-muted hover:text-accent transition-colors"><MessageSquare size={13} /> Privacy</Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
