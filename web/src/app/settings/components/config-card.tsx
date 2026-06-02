"use client";

import { Copy, LoaderCircle, PlugZap, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import webConfig from "@/constants/common-env";
import { testProxy, type ProxyTestResult } from "@/lib/api";

import { useSettingsStore } from "../store";

export function ConfigCard() {
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<ProxyTestResult | null>(null);
  const [whitelistDraft, setWhitelistDraft] = useState("");
  const logLevelOptions = ["debug", "info", "warning", "error"];
  const config = useSettingsStore((state) => state.config);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const setRefreshAccountIntervalMinute = useSettingsStore((state) => state.setRefreshAccountIntervalMinute);
  const setImageRetentionDays = useSettingsStore((state) => state.setImageRetentionDays);
  const setAutoRemoveInvalidAccounts = useSettingsStore((state) => state.setAutoRemoveInvalidAccounts);
  const setAutoRemoveRateLimitedAccounts = useSettingsStore((state) => state.setAutoRemoveRateLimitedAccounts);
  const setLogLevel = useSettingsStore((state) => state.setLogLevel);
  const patchConfig = useSettingsStore((state) => state.patchConfig);
  const setProxy = useSettingsStore((state) => state.setProxy);
  const setBaseUrl = useSettingsStore((state) => state.setBaseUrl);
  const setGptImage2ModelSlug = useSettingsStore((state) => state.setGptImage2ModelSlug);
  const saveConfig = useSettingsStore((state) => state.saveConfig);
  const apiBase = webConfig.apiUrl.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  const linuxDoCallbackUrl = `${apiBase}/oauth/linuxdo`;
  const whitelistText = Array.isArray(config?.email_domain_whitelist) ? config.email_domain_whitelist.join("\n") : "";

  useEffect(() => {
    setWhitelistDraft(whitelistText);
  }, [whitelistText]);

  const parseWhitelistDraft = () =>
    whitelistDraft
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const syncWhitelistDraft = () => {
    patchConfig({ email_domain_whitelist: parseWhitelistDraft() });
  };

  const handleSaveConfig = async () => {
    syncWhitelistDraft();
    await saveConfig();
  };

  const copyLinuxDoCallbackUrl = async () => {
    try {
      await navigator.clipboard.writeText(linuxDoCallbackUrl);
      toast.success("Linux DO 回调地址已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  const handleTestProxy = async () => {
    const candidate = String(config?.proxy || "").trim();
    if (!candidate) {
      toast.error("请先填写代理地址");
      return;
    }
    setIsTestingProxy(true);
    setProxyTestResult(null);
    try {
      const data = await testProxy(candidate);
      setProxyTestResult(data.result);
      if (data.result.ok) {
        toast.success(`代理可用（${data.result.latency_ms} ms，HTTP ${data.result.status}）`);
      } else {
        toast.error(`代理不可用：${data.result.error ?? "未知错误"}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试代理失败");
    } finally {
      setIsTestingProxy(false);
    }
  };

  if (isLoadingConfig) {
    return (
      <Card className="rounded-lg border-white/80 bg-white/80 shadow-sm">
        <CardContent className="flex items-center justify-center p-10">
          <LoaderCircle className="size-5 animate-spin text-stone-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg border-white/80 bg-white/80 shadow-sm">
      <CardContent className="space-y-4 p-6">
        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
          管理员登录密钥继续从部署配置读取，不再在此页面展示；如需分发给其他人，请在下方创建普通用户密钥。
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-stone-700">账号刷新间隔</label>
            <Input
              value={String(config?.refresh_account_interval_minute || "")}
              onChange={(event) => setRefreshAccountIntervalMinute(event.target.value)}
              placeholder="分钟"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">单位分钟，控制账号自动刷新频率。</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">全局代理</label>
            <Input
              value={String(config?.proxy || "")}
              onChange={(event) => {
                setProxy(event.target.value);
                setProxyTestResult(null);
              }}
              placeholder="http://127.0.0.1:7890"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">留空表示不使用代理。</p>
            {proxyTestResult ? (
              <div
                className={`rounded-xl border px-3 py-2 text-xs leading-6 ${
                  proxyTestResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {proxyTestResult.ok
                  ? `代理可用：HTTP ${proxyTestResult.status}，用时 ${proxyTestResult.latency_ms} ms`
                  : `代理不可用：${proxyTestResult.error ?? "未知错误"}（用时 ${proxyTestResult.latency_ms} ms）`}
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl border-stone-200 bg-white px-4 text-stone-700"
                onClick={() => void handleTestProxy()}
                disabled={isTestingProxy}
              >
                {isTestingProxy ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
                测试代理
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">图片访问地址</label>
            <Input
              value={String(config?.base_url || "")}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://example.com"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">用于生成图片结果的访问前缀地址。</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">图片自动清理</label>
            <Input
              value={String(config?.image_retention_days || "")}
              onChange={(event) => setImageRetentionDays(event.target.value)}
              placeholder="30"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">自动删除多少天前的本地图片。</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">gpt-image-2 底层模型</label>
            <Input
              value={String(config?.image_model_mappings?.["gpt-image-2"] || "")}
              onChange={(event) => setGptImage2ModelSlug(event.target.value)}
              placeholder="gpt-5-5"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">内置账号池调用 ChatGPT 图片链路时使用的上游模型 slug。</p>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
            <Checkbox
              checked={config?.allow_user_registration !== false}
              onCheckedChange={(checked) => patchConfig({ allow_user_registration: Boolean(checked) })}
            />
            允许用户自行注册
          </label>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">新用户注册初始额度</label>
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={String(config?.new_user_initial_quota ?? "")}
              onChange={(event) => patchConfig({ new_user_initial_quota: event.target.value })}
              placeholder="0"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">邮箱注册和 Linux DO 首次登录创建的新用户都会获得该额度。</p>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
            <Checkbox
              checked={Boolean(config?.auto_remove_invalid_accounts)}
              onCheckedChange={(checked) => setAutoRemoveInvalidAccounts(Boolean(checked))}
            />
            自动移除异常账号
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
            <Checkbox
              checked={Boolean(config?.auto_remove_rate_limited_accounts)}
              onCheckedChange={(checked) => setAutoRemoveRateLimitedAccounts(Boolean(checked))}
            />
            自动移除限流账号
          </label>
          <div className="space-y-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
            <div>
              <label className="text-sm text-stone-700">控制台日志级别</label>
              <p className="mt-1 text-xs text-stone-500">不选择时使用默认 info / warning / error。</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {logLevelOptions.map((level) => (
                <label key={level} className="flex items-center gap-2 text-sm capitalize text-stone-700">
                  <Checkbox
                    checked={Boolean(config?.log_levels?.includes(level))}
                    onCheckedChange={(checked) => setLogLevel(level, Boolean(checked))}
                  />
                  {level}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white px-4 py-4 md:col-span-2">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">注册邮箱验证</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">开启后，邮箱注册必须先通过验证码；域名白名单只影响用户自助注册。</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={Boolean(config?.email_verification_enabled)}
                  onCheckedChange={(checked) => patchConfig({ email_verification_enabled: Boolean(checked) })}
                />
                启用邮箱验证
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={Boolean(config?.email_domain_whitelist_enabled)}
                  onCheckedChange={(checked) => patchConfig({ email_domain_whitelist_enabled: Boolean(checked) })}
                />
                启用邮箱域名白名单
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={Boolean(config?.email_alias_restriction_enabled)}
                  onCheckedChange={(checked) => patchConfig({ email_alias_restriction_enabled: Boolean(checked) })}
                />
                启用邮箱别名限制
              </label>
            </div>
            <Textarea
              value={whitelistDraft}
              onChange={(event) => setWhitelistDraft(event.target.value)}
              onBlur={syncWhitelistDraft}
              placeholder="每行一个域名，例如 gmail.com 或 *.example.com"
              className="min-h-24 rounded-xl border-stone-200 bg-stone-50 font-mono text-xs"
            />
          </div>
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white px-4 py-4 md:col-span-2">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">SMTP 邮件发送</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">用于发送注册验证码，密码和访问凭证不会回显。</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm text-stone-700">SMTP 服务器地址</label>
                <Input value={String(config?.smtp_host || "")} onChange={(event) => patchConfig({ smtp_host: event.target.value })} className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-stone-700">SMTP 端口</label>
                <Input value={String(config?.smtp_port || "")} onChange={(event) => patchConfig({ smtp_port: event.target.value })} placeholder="587" className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-stone-700">SMTP 账户</label>
                <Input value={String(config?.smtp_username || "")} onChange={(event) => patchConfig({ smtp_username: event.target.value })} className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-stone-700">SMTP 发送者邮箱</label>
                <Input value={String(config?.smtp_from_email || "")} onChange={(event) => patchConfig({ smtp_from_email: event.target.value })} className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm text-stone-700">SMTP 访问凭证</label>
                <Input
                  type="password"
                  value={String(config?.smtp_password || "")}
                  onChange={(event) => patchConfig({ smtp_password: event.target.value })}
                  placeholder={config?.smtp_password_set ? "已保存，留空则不修改" : "敏感信息不会发送到前端显示"}
                  className="h-10 rounded-xl border-stone-200 bg-stone-50"
                />
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox checked={Boolean(config?.smtp_use_ssl)} onCheckedChange={(checked) => patchConfig({ smtp_use_ssl: Boolean(checked) })} />
                启用 SMTP SSL
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox checked={Boolean(config?.smtp_use_starttls)} onCheckedChange={(checked) => patchConfig({ smtp_use_starttls: Boolean(checked) })} />
                启用 STARTTLS
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox checked={Boolean(config?.smtp_force_auth_login)} onCheckedChange={(checked) => patchConfig({ smtp_force_auth_login: Boolean(checked) })} />
                强制 AUTH LOGIN
              </label>
            </div>
          </div>
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white px-4 py-4 md:col-span-2">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Linux DO OAuth</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">回调地址需填写到 Linux DO Connect 应用中。</p>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-fuchsia-100 bg-fuchsia-50 px-3 py-2 text-sm text-fuchsia-900 md:flex-row md:items-center md:justify-between">
              <span className="break-all">回调 URL：{linuxDoCallbackUrl}</span>
              <Button type="button" variant="outline" className="h-8 shrink-0 rounded-lg border-fuchsia-200 bg-white px-3 text-fuchsia-700" onClick={() => void copyLinuxDoCallbackUrl()}>
                <Copy className="size-3.5" />
                复制
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox checked={Boolean(config?.linuxdo_oauth_enabled)} onCheckedChange={(checked) => patchConfig({ linuxdo_oauth_enabled: Boolean(checked) })} />
                启用 Linux DO 登录注册
              </label>
              <div className="space-y-2">
                <label className="text-sm text-stone-700">Linux DO Client ID</label>
                <Input value={String(config?.linuxdo_client_id || "")} onChange={(event) => patchConfig({ linuxdo_client_id: event.target.value })} className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-stone-700">最低信任等级</label>
                <Input value={String(config?.linuxdo_minimum_trust_level || "")} onChange={(event) => patchConfig({ linuxdo_minimum_trust_level: event.target.value })} placeholder="0" className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2 md:col-span-3">
                <label className="text-sm text-stone-700">Linux DO Client Secret</label>
                <Input
                  type="password"
                  value={String(config?.linuxdo_client_secret || "")}
                  onChange={(event) => patchConfig({ linuxdo_client_secret: event.target.value })}
                  placeholder={config?.linuxdo_client_secret_set ? "已保存，留空则不修改" : "敏感信息不会发送到前端显示"}
                  className="h-10 rounded-xl border-stone-200 bg-stone-50"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            className="h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800"
            onClick={() => void handleSaveConfig()}
            disabled={isSavingConfig}
          >
            {isSavingConfig ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
