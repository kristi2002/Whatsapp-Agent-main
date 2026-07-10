"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { Send, Bot, User, ArrowLeft, Search, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Badge, Modal, Button } from "@/components/ui";
import type { ConversationWithLastMessage, Message } from "@/lib/types";

const fmtTime = (d: string) => new Date(d).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const initials = (name: string | null, phone: string) => (name ? name.slice(0, 2).toUpperCase() : phone.slice(-2));

export default function ChatPage() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [q, setQ] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the message list is scrolled (near) the bottom. Drives auto-scroll:
  // we only jump to the newest message when the user is already at the bottom,
  // so scrolling up to read history isn't yanked back down by the 5s poller.
  const atBottomRef = useRef(true);
  const selected = conversations.find((c) => c.id === selectedId);

  const fetchConversations = useCallback(async () => { setConversations(await fetch("/api/conversations").then((r) => r.json())); }, []);
  const fetchMessages = useCallback(async (id: string) => { setMessages(await fetch(`/api/conversations/${id}/messages`).then((r) => r.json())); }, []);

  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ fetchConversations(); }, [fetchConversations]);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ if (selectedId) fetchMessages(selectedId); }, [selectedId, fetchMessages]);
  // Switching conversation always lands you at the bottom of the new thread.
  useEffect(() => { atBottomRef.current = true; }, [selectedId]);
  // Auto-scroll to the newest message ONLY when already near the bottom (see
  // atBottomRef). Reading older messages is no longer interrupted by polling.
  useEffect(() => { if (atBottomRef.current) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Track whether the thread is scrolled near the bottom (80px tolerance).
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // Live updates via Supabase Realtime (push). Requires the browser anon key to
  // have read access; once RLS is enabled (migration 9) this stops delivering
  // rows, which is intentional for security — the polling effect below covers it.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("realtime-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        if (m.conversation_id === selectedId) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        fetchConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => fetchConversations())
      .subscribe();
    return () => { supabase?.removeChannel(channel); };
  }, [selectedId, fetchConversations, supabase]);

  // Polling fallback: keeps the chat fresh through the same authenticated /api/*
  // routes even when Realtime is unavailable (e.g. after RLS locks out the anon
  // key). ~5s cadence; also refreshes on window focus.
  useEffect(() => {
    const tick = () => { fetchConversations(); if (selectedId) fetchMessages(selectedId); };
    const id = setInterval(tick, 5000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(id); window.removeEventListener("focus", tick); };
  }, [selectedId, fetchConversations, fetchMessages]);

  async function toggleMode() {
    if (!selected) return;
    const mode = selected.mode === "agent" ? "human" : "agent";
    await fetch(`/api/conversations/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
    setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, mode } : c)));
  }
  async function handleSend() {
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    atBottomRef.current = true; // sending your own message always scrolls to it
    await fetch(`/api/conversations/${selectedId}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: input.trim() }) });
    setInput(""); setSending(false); fetchMessages(selectedId);
  }

  async function handleClear() {
    if (!selectedId) return;
    setClearing(true);
    const res = await fetch(`/api/conversations/${selectedId}/messages`, { method: "DELETE" });
    setClearing(false);
    setClearOpen(false);
    if (!res.ok) return;
    setMessages([]);
    fetchConversations();
  }

  const filtered = conversations.filter((c) => !q || `${c.name ?? ""} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell title="Conversazioni" subtitle={`${conversations.length} chat`} bare>
      <div className="flex h-full">
        <div className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-80 shrink-0 bd-r flex-col`} style={{ background: "var(--surface)" }}>
          <div className="p-3 bd-b shrink-0">
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <Search size={15} className="text-faint shrink-0" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca…" className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--text)" }} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto thin-scroll">
            {filtered.length === 0 && <p className="text-xs text-faint text-center mt-10">Nessuna conversazione.</p>}
            {filtered.map((c) => {
              const active = selectedId === c.id;
              return (
                <button key={c.id} onClick={() => setSelectedId(c.id)} className="w-full text-left px-4 py-3 bd-b hover-surface transition-colors" style={active ? { background: "var(--surface-2)" } : undefined}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}>{initials(c.name, c.phone)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{c.name || c.phone}</span>
                        <span className="text-[10px] text-faint shrink-0">{fmtTime(c.updated_at)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-xs text-muted truncate">{c.last_message || ""}</span>
                        <Badge tone={c.mode === "agent" ? "success" : "warning"}>{c.mode === "agent" ? "AI" : "Tu"}</Badge>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${selectedId ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`} style={{ background: "var(--bg)" }}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center"><p className="text-sm text-faint">Seleziona una conversazione</p></div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 sm:px-5 h-14 bd-b shrink-0" style={{ background: "var(--surface)" }}>
                <button onClick={() => setSelectedId(null)} className="md:hidden w-8 h-8 -ml-1 rounded-lg flex items-center justify-center text-muted hover-surface shrink-0" aria-label="Indietro"><ArrowLeft size={18} /></button>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}>{initials(selected.name, selected.phone)}</div>
                  <div className="min-w-0"><p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{selected.name || selected.phone}</p><p className="text-xs text-muted">{selected.phone}</p></div>
                </div>
                <button onClick={toggleMode} className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium shrink-0" style={{ background: selected.mode === "agent" ? "var(--success-soft)" : "var(--warning-soft)", color: selected.mode === "agent" ? "var(--success)" : "var(--warning)" }}>
                  {selected.mode === "agent" ? <Bot size={14} /> : <User size={14} />}<span className="hidden sm:inline">{selected.mode === "agent" ? "Assistente AI" : "Manuale"}</span>
                </button>
                <button onClick={() => setClearOpen(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover-surface shrink-0" style={{ border: "1px solid var(--border)" }} aria-label="Svuota chat" title="Svuota chat">
                  <Trash2 size={15} />
                </button>
              </div>

              <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto thin-scroll px-4 sm:px-6 py-5 space-y-3">
                {messages.map((m, i) => {
                  const isUser = m.role === "user";
                  const showTime = i === messages.length - 1 || messages[i + 1]?.role !== m.role;
                  return (
                    <div key={m.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                      <div className={`flex flex-col ${isUser ? "items-start" : "items-end"} max-w-[80%] sm:max-w-[70%]`}>
                        <div className="px-3.5 py-2 rounded-2xl text-sm leading-relaxed" style={isUser ? { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", borderTopLeftRadius: 4 } : { background: "var(--accent)", color: "var(--accent-fg)", borderTopRightRadius: 4 }}>
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                        {showTime && <p className="text-[10px] text-faint mt-1 px-1">{!isUser && <span className="text-accent mr-1">AI ·</span>}{fmtTime(m.created_at)}</p>}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className="px-4 sm:px-5 py-3 shrink-0" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-3 rounded-xl px-4 py-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()} placeholder="Scrivi un messaggio…" className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--text)" }} />
                  <button onClick={handleSend} disabled={sending || !input.trim()} className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0" style={{ background: "var(--accent)", color: "var(--accent-fg)" }} aria-label="Invia"><Send size={15} /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={clearOpen}
        onClose={() => !clearing && setClearOpen(false)}
        title="Svuota chat"
        subtitle={selected ? (selected.name || selected.phone) : undefined}
      >
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            <Trash2 size={18} />
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Tutti i messaggi di questa conversazione verranno <strong style={{ color: "var(--text)" }}>eliminati definitivamente</strong>. La conversazione resterà comunque nella lista.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setClearOpen(false)} disabled={clearing}>Annulla</Button>
          <Button variant="danger" size="sm" onClick={handleClear} disabled={clearing}>{clearing ? "Elimino…" : "Svuota chat"}</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
