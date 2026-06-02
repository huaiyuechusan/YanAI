import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { TopNav } from "@/components/top-nav";

export const metadata: Metadata = {
  title: "颜AI",
  description: "AI image creation and management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className="antialiased"
        style={{
          fontFamily:
            '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif',
        }}
      >
        <Toaster position="top-center" richColors offset={48} />
        <main className="yan-soft-grid h-screen overflow-hidden px-3 py-3 text-stone-900 sm:px-4 lg:px-5">
          <div className="yan-app-surface mx-auto flex h-[calc(100dvh-1.5rem)] max-w-[1800px] flex-col overflow-hidden rounded-lg">
            <TopNav />
            <div className="min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-5 lg:px-6">{children}</div>
          </div>
        </main>
      </body>
    </html>
  );
}
