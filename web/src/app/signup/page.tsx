"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import webConfig from "@/constants/common-env";
import { fetchRegisterOptions, registerPersonalUser, sendRegisterVerificationCode, type RegisterOptions } from "@/lib/api";
import { useRedirectIfAuthenticated } from "@/lib/use-auth-guard";
import { setStoredAuthSession } from "@/store/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [registerOptions, setRegisterOptions] = useState<RegisterOptions | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
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

  const handleSendCode = async () => {
    setIsSendingCode(true);
    try {
      const data = await sendRegisterVerificationCode(email.trim());
      toast.success(data.required ? "验证码已发送，请检查邮箱" : "当前未启用邮箱验证");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发送验证码失败");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleSignup = async () => {
    setIsSubmitting(true);
    try {
      const data = await registerPersonalUser({
        email: email.trim(),
        password,
        name: name.trim(),
        verification_code: verificationCode.trim(),
      });
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
      <Card className="w-full max-w-[460px] rounded-lg border-white/80 bg-white/90 shadow-[0_28px_90px_rgba(190,24,93,0.12)]">
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
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="昵称" className="h-12 rounded-lg border-rose-100 bg-white px-4" />
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" className="h-12 rounded-lg border-rose-100 bg-white px-4" />
            {registerOptions?.email_verification_enabled ? (
              <div className="flex gap-2">
                <Input
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                  placeholder="邮箱验证码"
                  className="h-12 min-w-0 flex-1 rounded-lg border-rose-100 bg-white px-4"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 shrink-0 rounded-lg border-rose-100 bg-white px-4 text-rose-600"
                  onClick={() => void handleSendCode()}
                  disabled={isSendingCode}
                >
                  {isSendingCode ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  发送验证码
                </Button>
              </div>
            ) : null}
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSignup();
              }}
              placeholder="密码，至少 6 位"
              className="h-12 rounded-lg border-rose-100 bg-white px-4"
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

          {registerOptions?.linuxdo_oauth_enabled ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full rounded-lg border-rose-100 bg-white text-stone-800 hover:bg-rose-50"
              onClick={startLinuxDoOAuth}
            >
              使用 Linux DO 注册 / 登录
            </Button>
          ) : null}

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
