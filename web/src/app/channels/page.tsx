"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createChannel, deleteChannel, fetchChannels, updateChannel, type Channel } from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

const DEFAULT_CHANNEL_MODELS = "gpt-5,gpt-5-1,gpt-5-2,gpt-5-3,gpt-5-3-mini,gpt-5-5,gpt-5-mini,gpt-image-2,codex-gpt-image-2,auto";

function ChannelsContent() {
  const [items, setItems] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    base_url: "",
    api_key: "",
    models: DEFAULT_CHANNEL_MODELS,
    weight: "1",
    priority: "0",
    timeout: "60",
  });

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await fetchChannels();
      setItems(data.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载渠道失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    try {
      const data = await createChannel({
        name: form.name.trim(),
        base_url: form.base_url.trim(),
        api_key: form.api_key.trim(),
        models: form.models,
        weight: Number(form.weight || 1),
        priority: Number(form.priority || 0),
        timeout: Number(form.timeout || 60),
        enabled: true,
      });
      setItems(data.items);
      setForm({ name: "", base_url: "", api_key: "", models: DEFAULT_CHANNEL_MODELS, weight: "1", priority: "0", timeout: "60" });
      toast.success("渠道已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建渠道失败");
    }
  };

  const handleToggle = async (channel: Channel) => {
    if (channel.id === "internal_pool") return;
    try {
      const data = await updateChannel(channel.id, { enabled: !channel.enabled });
      setItems(data.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新渠道失败");
    }
  };

  const handleDelete = async (channel: Channel) => {
    try {
      const data = await deleteChannel(channel.id);
      setItems(data.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除渠道失败");
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-[0.18em] text-rose-400 uppercase">Channels</div>
          <h1 className="text-2xl font-semibold tracking-tight">渠道管理</h1>
        </div>
        <Button variant="outline" className="h-10 rounded-xl border-rose-100 bg-white" onClick={() => void load()}>
          <RefreshCw className="size-4" />
          刷新
        </Button>
      </div>

      <Card className="rounded-lg border-white/80 bg-white/80 shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <Plus className="size-4 text-rose-500" />
            新增 OpenAI 图片兼容渠道
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr_1.2fr_1fr_90px_90px_90px_auto]">
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="名称" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input value={form.base_url} onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))} placeholder="Base URL" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input type="password" value={form.api_key} onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))} placeholder="API Key" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input value={form.models} onChange={(event) => setForm((current) => ({ ...current, models: event.target.value }))} placeholder="模型" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input type="number" value={form.weight} onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))} placeholder="权重" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input type="number" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} placeholder="优先级" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input type="number" value={form.timeout} onChange={(event) => setForm((current) => ({ ...current, timeout: event.target.value }))} placeholder="超时" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Button className="h-10 rounded-xl bg-rose-500 text-white hover:bg-rose-600" onClick={() => void handleCreate()}>
              创建
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-lg border-white/80 bg-white/80 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-rose-400" />
            </div>
          ) : (
            items.map((channel) => (
              <div key={channel.id} className="grid gap-3 border-b border-rose-50 px-5 py-4 text-sm last:border-0 lg:grid-cols-[1.1fr_1.4fr_1fr_90px_90px_130px] lg:items-center">
                <div>
                  <div className="font-medium text-stone-900">{channel.name}</div>
                  <div className="text-xs text-stone-400">{channel.type}</div>
                </div>
                <div className="truncate text-stone-600">{channel.base_url || "内置账号池"}</div>
                <div className="truncate text-stone-500">{channel.models?.join(", ")}</div>
                <div className="text-stone-600">权重 {channel.weight}</div>
                <Badge variant={channel.enabled ? "success" : "secondary"}>{channel.enabled ? "启用" : "禁用"}</Badge>
                <div className="flex gap-2">
                  {channel.id !== "internal_pool" ? (
                    <>
                      <Button variant="outline" size="sm" className="h-8 rounded-lg border-rose-100 bg-white" onClick={() => void handleToggle(channel)}>
                        {channel.enabled ? "禁用" : "启用"}
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-rose-500" onClick={() => void handleDelete(channel)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function ChannelsPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-rose-400" />
      </div>
    );
  }
  return <ChannelsContent />;
}
