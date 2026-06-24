import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      {...props}
      className={cn(
        "rounded-lg border border-stone-200/80 bg-[#fffdf8]/90 p-5 shadow-[var(--shadow)] backdrop-blur",
        className
      )}
    >
      {children}
    </section>
  );
}

export function Badge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "yellow" | "red" | "slate" }) {
  const tones = {
    blue: "border-cyan-200 bg-cyan-50 text-cyan-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    yellow: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-rose-200 bg-rose-50 text-rose-800",
    slate: "border-stone-200 bg-stone-100 text-stone-700"
  };

  return <span className={cn("inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function Progress({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className="h-2 overflow-hidden rounded-full bg-stone-200">
      <div className="h-full rounded-full bg-teal-700 transition-[width] duration-500" style={{ width: `${safeValue}%` }} />
    </div>
  );
}

export const buttonStyles = {
  primary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-900/15 transition duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md hover:shadow-blue-900/20 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none",
  secondary:
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white/85 px-4 text-sm font-semibold text-stone-900 shadow-sm transition duration-200 hover:border-brand-500/40 hover:bg-brand-50",
  danger:
    "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
};

export const fieldStyles =
  "w-full rounded-lg border border-stone-300 bg-white/95 px-3 text-sm text-stone-950 outline-none shadow-inner shadow-stone-950/[0.02] transition duration-200 placeholder:text-stone-600 hover:border-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25";
