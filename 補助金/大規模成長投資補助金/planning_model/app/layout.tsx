import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "成長投資計画 数値設計ラボ",
  description: "大規模成長投資補助金のPL・15指標・目標競合を検証するローカルモデル",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
