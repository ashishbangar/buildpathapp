import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BuildPath — kids build real apps they actually understand",
  description:
    "Your child pitches their own app idea on WhatsApp, then builds it on our workspace — where AI writes the code, explains every line, and hands them one piece to do themselves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
