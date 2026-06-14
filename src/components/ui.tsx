import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <section {...props} className={cn("rounded-lg border border-zinc-200 bg-white p-5 shadow-sm", className)}>{children}</section>;
}

export function Badge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "yellow" | "red" | "slate" }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    yellow: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-zinc-200 bg-zinc-50 text-zinc-700"
  };
  return <span className={cn("inline-flex rounded-md border px-2.5 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Progress({ value }: { value: number }) {
  return <div className="h-2 rounded-full bg-zinc-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}
