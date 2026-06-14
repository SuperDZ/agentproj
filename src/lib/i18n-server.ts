import { cookies } from "next/headers";
import { defaultLocale, normalizeLocale, type Locale } from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get("locale")?.value ?? defaultLocale);
}

