"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getDefaultRouteForRole, getStoredAuthSession } from "@/store/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const redirect = async () => {
      const session = await getStoredAuthSession();
      if (!active) {
        return;
      }
      router.replace(session ? getDefaultRouteForRole(session.role) : "/login");
    };

    void redirect();
    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
