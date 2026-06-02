"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import webConfig from "@/constants/common-env";
import { fetchRegisterOptions, login, type RegisterOptions } from "@/lib/api";
import { useRedirectIfAuthenticated } from "@/lib/use-auth-guard";
import { getDefaultRouteForRole, setStoredAuthSession } from "@/store/auth";
import { cn } from "@/lib/utils";

type LoginMode = "user" | "admin";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("user");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [registerOptions, setRegisterOptions] = useState<RegisterOptions | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isCheckingAuth } = useRedirectIfAuthenticated();

  useEffect(() => {
    void fetchRegisterOptions()
      .then(setRegisterOptions)
      .catch(() => setRegisterOptions(null));
  }, []);

  const startLinuxDoOAuth = () => {
    const startPath = registerOptions?.linuxdo_start_url || "/auth/linuxdo/start";
    const apiBase = webConfig.apiUrl.replace(/\/$/, "");
    window.location.href = `${apiBase}${startPath}`;
  };

  const handleLogin = async () => {
    setIsSubmitting(true);
    try {
      const data =
        mode === "admin"
          ? await login(authKey.trim())
          : await login({ email: email.trim(), password });
      const sessionKey = mode === "admin" ? authKey.trim() : data.token || "";
      if (!sessionKey) {
        throw new Error("登录未返回有效会话");
      }
      await setStoredAuthSession({
        key: sessionKey,
        role: data.role,
        subjectId: data.subject_id,
        name: data.name,
        email: data.email,
        quota: data.quota,
      });
      router.replace(getDefaultRouteForRole(data.role));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="grid min-h-[calc(100vh-1rem)] w-full place-items-center px-4 py-6">
        <LoaderCircle className="size-5 animate-spin text-rose-400" />
      </div>
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-1rem)] w-full place-items-center px-4 py-6">
      <Card className="w-full max-w-[460px] rounded-lg border-white/80 bg-white/90 shadow-[0_28px_90px_rgba(190,24,93,0.12)]">
        <CardContent className="space-y-7 p-6 sm:p-8">
          <div className="space-y-4 text-center">
            <div className="mx-auto inline-flex size-14 items-center justify-center rounded-[20px] bg-rose-500 text-white shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950">颜AI</h1>
              <p className="text-sm leading-6 text-stone-500">登录后开始创作和管理你的 AI 美图。</p>
            </div>
          </div>

          <div className="grid grid-cols-2 rounded-2xl bg-rose-50 p-1 text-sm font-medium">
            {[
              { value: "user" as const, label: "个人登录", icon: Mail },
              { value: "admin" as const, label: "管理员", icon: KeyRound },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    "flex h-10 items-center justify-center gap-2 rounded-xl transition",
                    mode === item.value ? "bg-white text-rose-600 shadow-sm" : "text-stone-500 hover:text-stone-800",
                  )}
                  onClick={() => setMode(item.value)}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {mode === "user" ? (
            <div className="space-y-4">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="邮箱"
                className="h-12 rounded-lg border-rose-100 bg-white px-4"
              />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleLogin();
                }}
                placeholder="密码"
                className="h-12 rounded-lg border-rose-100 bg-white px-4"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                type="password"
                value={authKey}
                onChange={(event) => setAuthKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleLogin();
                }}
                placeholder="管理员密钥"
                className="h-12 rounded-lg border-rose-100 bg-white px-4"
              />
            </div>
          )}

          <Button
            className="h-12 w-full rounded-2xl bg-rose-500 text-white hover:bg-rose-600"
            onClick={() => void handleLogin()}
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            登录
          </Button>

          {mode === "user" && registerOptions?.linuxdo_oauth_enabled ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full rounded-lg border-rose-100 bg-white text-stone-800 hover:bg-rose-50"
              onClick={startLinuxDoOAuth}
            >
              使用 Linux DO 登录 / 注册
            </Button>
          ) : null}

          {mode === "user" ? (
            <div className="text-center text-sm text-stone-500">
              还没有账号？
              <Link href="/signup" className="ml-1 font-medium text-rose-600 hover:text-rose-700">
                注册个人账号
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
