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
      toast.success("Linux DO callback URL copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const handleTestProxy = async () => {
    const candidate = String(config?.proxy || "").trim();
    if (!candidate) {
      toast.error("Enter a proxy URL first");
      return;
    }
    setIsTestingProxy(true);
    setProxyTestResult(null);
    try {
      const data = await testProxy(candidate);
      setProxyTestResult(data.result);
      if (data.result.ok) {
        toast.success(`Proxy available (${data.result.latency_ms} ms, HTTP ${data.result.status})`);
      } else {
        toast.error(`Proxy unavailable: ${data.result.error ?? "Unknown error"}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to test proxy");
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
          The admin login key continues to be read from deployment configuration and is no longer shown here. Create regular user keys below if you need to share access.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-stone-700">Account refresh interval</label>
            <Input
              value={String(config?.refresh_account_interval_minute || "")}
              onChange={(event) => setRefreshAccountIntervalMinute(event.target.value)}
              placeholder="Minutes"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">In minutes. Controls automatic account refresh frequency.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">Global Proxy</label>
            <Input
              value={String(config?.proxy || "")}
              onChange={(event) => {
                setProxy(event.target.value);
                setProxyTestResult(null);
              }}
              placeholder="http://127.0.0.1:7890"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">Leave blank to disable proxy.</p>
            {proxyTestResult ? (
              <div
                className={`rounded-xl border px-3 py-2 text-xs leading-6 ${
                  proxyTestResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {proxyTestResult.ok
                  ? `Proxy available: HTTP ${proxyTestResult.status}, took ${proxyTestResult.latency_ms} ms`
                  : `Proxy unavailable: ${proxyTestResult.error ?? "Unknown error"} (took ${proxyTestResult.latency_ms} ms)`}
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
                Test Proxy
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">Image access URL</label>
            <Input
              value={String(config?.base_url || "")}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://example.com"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">URL prefix used for generated image results.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">Automatic image cleanup</label>
            <Input
              value={String(config?.image_retention_days || "")}
              onChange={(event) => setImageRetentionDays(event.target.value)}
              placeholder="30"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">Automatically delete local images older than this many days.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">gpt-image-2 upstream model</label>
            <Input
              value={String(config?.image_model_mappings?.["gpt-image-2"] || "")}
              onChange={(event) => setGptImage2ModelSlug(event.target.value)}
              placeholder="gpt-5-5"
              className="h-10 rounded-xl border-stone-200 bg-white"
            />
            <p className="text-xs text-stone-500">Upstream model slug used by the built-in account pool for the ChatGPT image flow.</p>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
            <Checkbox
              checked={config?.allow_user_registration !== false}
              onCheckedChange={(checked) => patchConfig({ allow_user_registration: Boolean(checked) })}
            />
            Allow user self-registration
          </label>
          <div className="space-y-2">
            <label className="text-sm text-stone-700">Initial quota for new users</label>
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
            <p className="text-xs text-stone-500">New users created by email signup or first Linux DO login receive this quota.</p>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
            <Checkbox
              checked={Boolean(config?.auto_remove_invalid_accounts)}
              onCheckedChange={(checked) => setAutoRemoveInvalidAccounts(Boolean(checked))}
            />
            Automatically remove error accounts
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
            <Checkbox
              checked={Boolean(config?.auto_remove_rate_limited_accounts)}
              onCheckedChange={(checked) => setAutoRemoveRateLimitedAccounts(Boolean(checked))}
            />
            Automatically remove rate-limited accounts
          </label>
          <div className="space-y-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
            <div>
              <label className="text-sm text-stone-700">Console log level</label>
              <p className="mt-1 text-xs text-stone-500">If none are selected, the default info / warning / error levels are used.</p>
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
              <h2 className="text-sm font-semibold text-stone-900">Registration email verification</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">When enabled, email signup requires a verification code first; the domain allowlist only affects user self-service signup.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={Boolean(config?.email_verification_enabled)}
                  onCheckedChange={(checked) => patchConfig({ email_verification_enabled: Boolean(checked) })}
                />
                Enable Email Verification
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={Boolean(config?.email_domain_whitelist_enabled)}
                  onCheckedChange={(checked) => patchConfig({ email_domain_whitelist_enabled: Boolean(checked) })}
                />
                Enable Email Domain Allowlist
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox
                  checked={Boolean(config?.email_alias_restriction_enabled)}
                  onCheckedChange={(checked) => patchConfig({ email_alias_restriction_enabled: Boolean(checked) })}
                />
                Enable Email Alias Restriction
              </label>
            </div>
            <Textarea
              value={whitelistDraft}
              onChange={(event) => setWhitelistDraft(event.target.value)}
              onBlur={syncWhitelistDraft}
              placeholder="One domain per line, such as gmail.com or *.example.com"
              className="min-h-24 rounded-xl border-stone-200 bg-stone-50 font-mono text-xs"
            />
          </div>
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white px-4 py-4 md:col-span-2">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">SMTP Email Sending</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">Used to send registration verification codes. Passwords and access credentials are not echoed back.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm text-stone-700">SMTP Server Host</label>
                <Input value={String(config?.smtp_host || "")} onChange={(event) => patchConfig({ smtp_host: event.target.value })} className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-stone-700">SMTP Port</label>
                <Input value={String(config?.smtp_port || "")} onChange={(event) => patchConfig({ smtp_port: event.target.value })} placeholder="587" className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-stone-700">SMTP Account</label>
                <Input value={String(config?.smtp_username || "")} onChange={(event) => patchConfig({ smtp_username: event.target.value })} className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-stone-700">SMTP Sender Email</label>
                <Input value={String(config?.smtp_from_email || "")} onChange={(event) => patchConfig({ smtp_from_email: event.target.value })} className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm text-stone-700">SMTP Access Credential</label>
                <Input
                  type="password"
                  value={String(config?.smtp_password || "")}
                  onChange={(event) => patchConfig({ smtp_password: event.target.value })}
                  placeholder={config?.smtp_password_set ? "Saved. Leave blank to keep unchanged" : "Sensitive information is not sent to the frontend"}
                  className="h-10 rounded-xl border-stone-200 bg-stone-50"
                />
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox checked={Boolean(config?.smtp_use_ssl)} onCheckedChange={(checked) => patchConfig({ smtp_use_ssl: Boolean(checked) })} />
                Enable SMTP SSL
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox checked={Boolean(config?.smtp_use_starttls)} onCheckedChange={(checked) => patchConfig({ smtp_use_starttls: Boolean(checked) })} />
                Enable STARTTLS
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox checked={Boolean(config?.smtp_force_auth_login)} onCheckedChange={(checked) => patchConfig({ smtp_force_auth_login: Boolean(checked) })} />
                Force AUTH LOGIN
              </label>
            </div>
          </div>
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white px-4 py-4 md:col-span-2">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Linux DO OAuth</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">Enter this callback URL in the Linux DO Connect app.</p>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-fuchsia-100 bg-fuchsia-50 px-3 py-2 text-sm text-fuchsia-900 md:flex-row md:items-center md:justify-between">
              <span className="break-all">Callback URL: {linuxDoCallbackUrl}</span>
              <Button type="button" variant="outline" className="h-8 shrink-0 rounded-lg border-fuchsia-200 bg-white px-3 text-fuchsia-700" onClick={() => void copyLinuxDoCallbackUrl()}>
                <Copy className="size-3.5" />
                Copy
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                <Checkbox checked={Boolean(config?.linuxdo_oauth_enabled)} onCheckedChange={(checked) => patchConfig({ linuxdo_oauth_enabled: Boolean(checked) })} />
                Enable Linux DO Login and Registration
              </label>
              <div className="space-y-2">
                <label className="text-sm text-stone-700">Linux DO Client ID</label>
                <Input value={String(config?.linuxdo_client_id || "")} onChange={(event) => patchConfig({ linuxdo_client_id: event.target.value })} className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-stone-700">Minimum Trust Level</label>
                <Input value={String(config?.linuxdo_minimum_trust_level || "")} onChange={(event) => patchConfig({ linuxdo_minimum_trust_level: event.target.value })} placeholder="0" className="h-10 rounded-xl border-stone-200 bg-stone-50" />
              </div>
              <div className="space-y-2 md:col-span-3">
                <label className="text-sm text-stone-700">Linux DO Client Secret</label>
                <Input
                  type="password"
                  value={String(config?.linuxdo_client_secret || "")}
                  onChange={(event) => patchConfig({ linuxdo_client_secret: event.target.value })}
                  placeholder={config?.linuxdo_client_secret_set ? "Saved. Leave blank to keep unchanged" : "Sensitive information is not sent to the frontend"}
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
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
