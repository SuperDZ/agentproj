"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/i18n-actions";
import { dictionaries, type Locale } from "@/lib/i18n";

export function LanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const nextLocale: Locale = locale === "zh" ? "en" : "zh";
  const t = dictionaries[locale].language;

  function switchLocale() {
    startTransition(async () => {
      await setLocale(nextLocale);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={switchLocale}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-60"
      aria-label={t.label}
    >
      <span className={locale === "en" ? "font-semibold text-zinc-950" : "text-zinc-500"}>{t.en}</span>
      <span className="text-zinc-300">/</span>
      <span className={locale === "zh" ? "font-semibold text-zinc-950" : "text-zinc-500"}>{t.zh}</span>
    </button>
  );
}
