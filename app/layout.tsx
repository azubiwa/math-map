import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://math-map-study-jp.whole-cloud-6961.chatgpt.site";
const base = new URL(siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);

export const metadata: Metadata = {
  metadataBase: base,
  title: "Math Map｜数学学習の進捗マップ",
  description: "本・授業・章・問題ごとに、数学の学習進捗を記録して見える化する個人用トラッカー。",
  icons: { icon: new URL("favicon.svg", base), shortcut: new URL("favicon.svg", base) },
  openGraph: {
    title: "MATH MAP",
    description: "数学の学びを、地図にする。",
    images: [{ url: new URL("og.png", base).toString(), width: 1734, height: 907 }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MATH MAP",
    description: "数学の学びを、地図にする。",
    images: [new URL("og.png", base).toString()],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
