import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpecFlow Agent",
  description: "Before AI writes code, make sure the product is worth building."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
