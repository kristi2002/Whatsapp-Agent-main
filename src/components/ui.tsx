"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cva, type VariantProps } from "class-variance-authority";
import { X, Loader2, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "text-[var(--accent-fg)]",
        secondary: "text-[var(--text)]",
        ghost: "text-muted hover:text-[var(--text)]",
        danger: "text-white",
      },
      size: { sm: "h-8 px-3", md: "h-9 px-4", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export function Button({ variant, size, className, style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  const bg =
    variant === "secondary" ? { background: "var(--surface-2)", border: "1px solid var(--border)" } :
    variant === "ghost" ? { background: "transparent" } :
    variant === "danger" ? { background: "var(--danger)" } :
    { background: "var(--accent)" };
  return <button className={cn(buttonStyles({ variant, size }), "hover:opacity-90", className)} style={{ ...bg, ...style }} {...props} />;
}

export function Card({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} style={{ boxShadow: "var(--shadow)", ...style }} {...props} />;
}

const badgeTone: Record<string, { bg: string; fg: string }> = {
  accent: { bg: "var(--accent-soft)", fg: "var(--accent-soft-fg)" },
  success: { bg: "var(--success-soft)", fg: "var(--success)" },
  warning: { bg: "var(--warning-soft)", fg: "var(--warning)" },
  danger: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  info: { bg: "var(--info-soft)", fg: "var(--info)" },
  neutral: { bg: "var(--surface-2)", fg: "var(--text-muted)" },
};

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof badgeTone; children: React.ReactNode; className?: string }) {
  const t = badgeTone[tone];
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium tracking-wide", className)} style={{ background: t.bg, color: t.fg }}>{children}</span>;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("w-full h-9 px-3 rounded-lg text-sm outline-none transition-shadow", props.className)} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)", ...props.style }} onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 3px var(--ring)")} onBlur={(e) => (e.currentTarget.style.boxShadow = "none")} />;
}

// Radix reserves the empty string for "no selection", so an <option value="">
// (common for "Tutti"/"All") is mapped to this sentinel internally.
const EMPTY_OPT = "__empty__";

/**
 * Themed dropdown that is a drop-in for a native `<select>`: pass `value`,
 * `onChange` (called with `{ target: { value } }`), and `<option>` children.
 * Renders a fully theme-styled Radix Select so the OPEN list matches the app,
 * not the OS default.
 */
export function Select({ value, onChange, children, className, style, disabled }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const options: { value: string; label: string }[] = [];
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === "option") {
      const p = child.props as { value?: React.ReactNode; children?: React.ReactNode };
      const v = String(p.value ?? "");
      const label = typeof p.children === "string" ? p.children : String(p.children ?? v);
      options.push({ value: v, label });
    }
  });
  const current = value == null ? "" : String(value);
  const toRadix = (v: string) => (v === "" ? EMPTY_OPT : v);
  const fromRadix = (v: string) => (v === EMPTY_OPT ? "" : v);
  const emit = (v: string) =>
    onChange?.({ target: { value: fromRadix(v) } } as unknown as React.ChangeEvent<HTMLSelectElement>);

  return (
    <SelectPrimitive.Root value={toRadix(current)} onValueChange={emit} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn("w-full h-9 px-3 rounded-lg text-sm inline-flex items-center justify-between gap-2 outline-none transition-shadow disabled:opacity-40 disabled:pointer-events-none", className)}
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)", ...style }}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon><ChevronDown size={15} className="text-muted shrink-0" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper" sideOffset={4}
          className="z-[60] rounded-xl p-1 overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow)", minWidth: "var(--radix-select-trigger-width)" }}
        >
          <SelectPrimitive.Viewport className="max-h-64 thin-scroll">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value || EMPTY_OPT} value={toRadix(o.value)}
                className="relative flex items-center h-8 pl-8 pr-3 rounded-lg text-sm cursor-pointer outline-none select-none data-[highlighted]:bg-[var(--surface-2)]"
                style={{ color: "var(--text)" }}
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex"><Check size={14} className="text-accent" /></SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function Modal({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50" style={{ background: "rgba(10,6,12,0.55)", backdropFilter: "blur(2px)" }} />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 focus:outline-none" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <Dialog.Title className="text-base font-semibold" style={{ color: "var(--text)" }}>{title}</Dialog.Title>
              {subtitle && <Dialog.Description className="text-xs text-muted mt-0.5">{subtitle}</Dialog.Description>}
            </div>
            <Dialog.Close className="text-faint hover:text-[var(--text)] transition-colors"><X size={18} /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
