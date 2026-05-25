"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { registerPersonalUser } from "@/lib/api";
import { useRedirectIfAuthenticated } from "@/lib/use-auth-guard";
import { setStoredAuthSession } from "@/store/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isCheckingAuth } = useRedirectIfAuthenticated();

  const handleSignup = async () => {
    setIsSubmitting(true);
    try {
      const data = await registerPersonalUser({ email: email.trim(), password, name: name.trim() });
      await setStoredAuthSession({
        key: data.token,
        role: data.user.role,
        subjectId: data.user.id,
        name: data.user.name,
        email: data.user.email,
        quota: data.user.quota,
      });
      router.replace("/image");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "注册失败");
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
      <Card className="w-full max-w-[460px] rounded-[28px] border-white/80 bg-white/95 shadow-[0_28px_90px_rgba(190,24,93,0.12)]">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="space-y-4 text-center">
            <div className="mx-auto inline-flex size-14 items-center justify-center rounded-[20px] bg-rose-500 text-white shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950">创建颜AI账号</h1>
              <p className="text-sm leading-6 text-stone-500">注册后可通过兑换码获得画图额度。</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="昵称" className="h-12 rounded-2xl border-rose-100 bg-white px-4" />
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" className="h-12 rounded-2xl border-rose-100 bg-white px-4" />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSignup();
              }}
              placeholder="密码，至少 6 位"
              className="h-12 rounded-2xl border-rose-100 bg-white px-4"
            />
          </div>

          <Button
            className="h-12 w-full rounded-2xl bg-rose-500 text-white hover:bg-rose-600"
            onClick={() => void handleSignup()}
            disabled={isSubmitting}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            注册并登录
          </Button>

          <div className="text-center text-sm text-stone-500">
            已有账号？
            <Link href="/login" className="ml-1 font-medium text-rose-600 hover:text-rose-700">
              去登录
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
