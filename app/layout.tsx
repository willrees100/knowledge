import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KNOWLEDGE — Class Study Assistant",
  description: "A source-grounded Q&A and practice-test assistant built from your own class materials.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-black/10 dark:border-white/10 px-6 py-3 flex items-center justify-between">
          <a href="/" className="font-semibold tracking-tight">
            KNOWLEDGE
          </a>
          <nav className="text-sm flex gap-4 opacity-80">
            <a href="/" className="hover:underline">
              Knowledge Bases
            </a>
            <a href="/admin" className="hover:underline">
              Stats
            </a>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
