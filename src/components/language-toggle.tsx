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
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white/80 px-3 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 disabled:opacity-60"
      aria-label={t.label}
    >
      <span className={locale === "en" ? "text-stone-950" : "text-stone-400"}>{t.en}</span>
      <span className="h-4 w-px bg-stone-300" />
      <span className={locale === "zh" ? "text-stone-950" : "text-stone-400"}>{t.zh}</span>
    </button>
  );
}
