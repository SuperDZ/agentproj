"use server";

import { cookies } from "next/headers";
import { normalizeLocale, type Locale } from "@/lib/i18n";

export async function setLocale(locale: Locale) {
  const cookieStore = await cookies();
  cookieStore.set("locale", normalizeLocale(locale), {
    path: "/",
    maxAge: 31_536_000,
    sameSite: "lax"
  });
}
