import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl", className)}>{children}</div>;
}

export function Badge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "yellow" | "red" | "slate" }) {
  const tones = {
    blue: "border-blue-400/30 bg-blue-500/10 text-blue-200",
    green: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    yellow: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    red: "border-red-400/30 bg-red-500/10 text-red-200",
    slate: "border-slate-500/30 bg-slate-500/10 text-slate-200"
  };
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Progress({ value }: { value: number }) {
  return <div className="h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
