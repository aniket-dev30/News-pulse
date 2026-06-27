import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NewsPulse — Topic-Clustered News Timeline",
  description: "Live news articles clustered by topic and displayed on a visual timeline.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin:0, padding:0, background:"#09090b" }}>{children}</body>
    </html>
  );
}