"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import webConfig from "@/constants/common-env";
import { clearStoredAuthSession, getStoredAuthSession, type StoredAuthSession } from "@/store/auth";
import { cn } from "@/lib/utils";

const adminNavItems = [
  { href: "/image", label: "画图" },
  { href: "/users", label: "用户管理" },
  { href: "/accounts", label: "池管理" },
  { href: "/register", label: "注册机" },
  { href: "/image-manager", label: "图片管理" },
  { href: "/channels", label: "渠道管理" },
  { href: "/redeem-codes", label: "兑换码" },
  { href: "/logs", label: "日志" },
  { href: "/settings", label: "设置" },
];

const userNavItems = [
  { href: "/image", label: "画图" },
  { href: "/my-images", label: "我的图片" },
  { href: "/profile", label: "个人中心" },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<StoredAuthSession | null | undefined>(undefined);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (pathname === "/login" || pathname === "/signup") {
        if (active) setSession(null);
        return;
      }
      const storedSession = await getStoredAuthSession();
      if (active) setSession(storedSession);
    };

    void load();
    return () => {
      active = false;
    };
  }, [pathname]);

  const handleLogout = async () => {
    await clearStoredAuthSession();
    router.replace("/login");
  };

  if (pathname === "/login" || pathname === "/signup" || session === undefined || !session) {
    return null;
  }

  const navItems = session.role === "admin" ? adminNavItems : userNavItems;
  const roleLabel = session.role === "admin" ? "管理员" : "个人用户";

  return (
    <header className="border-b border-rose-100/70 bg-white/55 backdrop-blur">
      <div className="flex min-h-14 items-center justify-between gap-3 px-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/image"
            className="whitespace-nowrap py-1 text-[15px] font-bold tracking-tight text-rose-600 transition hover:text-rose-700"
          >
            颜AI
          </Link>
        </div>
        <nav className="hide-scrollbar flex flex-1 justify-start gap-2 overflow-x-auto sm:justify-center sm:gap-4">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition sm:text-sm",
                  active ? "bg-rose-500 text-white shadow-sm" : "text-stone-500 hover:bg-rose-50 hover:text-rose-700",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center justify-end gap-2">
          <span className="hidden rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-600 sm:inline-block">
            {roleLabel}
          </span>
          <span className="hidden rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-400 sm:inline-block">
            v{webConfig.appVersion}
          </span>
          <button
            type="button"
            className="whitespace-nowrap py-1 text-xs text-stone-400 transition hover:text-rose-600 sm:text-sm"
            onClick={() => void handleLogout()}
          >
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
