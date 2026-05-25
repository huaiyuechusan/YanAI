"use client";

import { useEffect, useState } from "react";
import { Copy, Gift, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createRedeemCodes, fetchRedeemCodes, updateRedeemCode, type RedeemCode } from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

function RedeemCodesContent() {
  const [items, setItems] = useState<RedeemCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({ quota: "10", count: "10", max_uses: "1", expires_at: "", note: "" });

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await fetchRedeemCodes();
      setItems(data.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载兑换码失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    try {
      const data = await createRedeemCodes({
        quota: Number(form.quota || 1),
        count: Number(form.count || 1),
        max_uses: Number(form.max_uses || 1),
        expires_at: form.expires_at || undefined,
        note: form.note,
      });
      setItems(data.items);
      await navigator.clipboard.writeText(data.created.map((item) => item.code).join("\n"));
      toast.success(`已生成 ${data.created.length} 个兑换码，并复制到剪贴板`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成兑换码失败");
    }
  };

  const handleToggle = async (item: RedeemCode) => {
    try {
      const data = await updateRedeemCode(item.id, { status: item.status === "enabled" ? "disabled" : "enabled" });
      setItems(data.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新兑换码失败");
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-[0.18em] text-rose-400 uppercase">Redeem</div>
          <h1 className="text-2xl font-semibold tracking-tight">兑换码管理</h1>
        </div>
        <Button variant="outline" className="h-10 rounded-xl border-rose-100 bg-white" onClick={() => void load()}>
          <RefreshCw className="size-4" />
          刷新
        </Button>
      </div>

      <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <Plus className="size-4 text-rose-500" />
            批量生成兑换码
          </div>
          <div className="grid gap-3 md:grid-cols-[120px_120px_120px_180px_1fr_auto]">
            <Input type="number" value={form.quota} onChange={(event) => setForm((current) => ({ ...current, quota: event.target.value }))} placeholder="额度" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input type="number" value={form.count} onChange={(event) => setForm((current) => ({ ...current, count: event.target.value }))} placeholder="数量" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input type="number" value={form.max_uses} onChange={(event) => setForm((current) => ({ ...current, max_uses: event.target.value }))} placeholder="次数" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input value={form.expires_at} onChange={(event) => setForm((current) => ({ ...current, expires_at: event.target.value }))} placeholder="过期时间，可空" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Input value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="备注" className="h-10 rounded-xl border-rose-100 bg-white" />
            <Button className="h-10 rounded-xl bg-rose-500 text-white hover:bg-rose-600" onClick={() => void handleCreate()}>
              生成
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-white/80 bg-white/90 shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-rose-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-stone-500">暂无兑换码</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="grid gap-3 border-b border-rose-50 px-5 py-4 text-sm last:border-0 lg:grid-cols-[1.4fr_100px_100px_120px_160px_180px] lg:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-2xl bg-rose-50 p-3 text-rose-500">
                    <Gift className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-mono font-semibold text-stone-900">{item.code}</div>
                    <div className="truncate text-xs text-stone-400">{item.note || "无备注"}</div>
                  </div>
                </div>
                <div className="font-semibold text-rose-600">{item.quota} 点</div>
                <div className="text-stone-600">{item.used_count}/{item.max_uses}</div>
                <Badge variant={item.status === "enabled" ? "success" : "secondary"}>{item.status === "enabled" ? "启用" : "停用"}</Badge>
                <div className="text-xs text-stone-500">{item.expires_at || "永不过期"}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-8 rounded-lg border-rose-100 bg-white" onClick={() => void handleToggle(item)}>
                    {item.status === "enabled" ? "停用" : "启用"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-stone-500"
                    onClick={() => {
                      void navigator.clipboard.writeText(item.code);
                      toast.success("兑换码已复制");
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function RedeemCodesPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-rose-400" />
      </div>
    );
  }
  return <RedeemCodesContent />;
}
