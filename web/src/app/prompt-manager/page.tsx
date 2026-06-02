"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Copy, ImagePlus, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminPrompt,
  deleteAdminPrompt,
  fetchAdminPrompts,
  type PromptLibraryItem,
  type PromptLibraryPayload,
  updateAdminPrompt,
  uploadPromptExampleImage,
} from "@/lib/api";
import { resolveApiAssetUrl } from "@/lib/assets";
import { cn } from "@/lib/utils";
import { useAuthGuard } from "@/lib/use-auth-guard";

type PromptFormState = {
  title: string;
  description: string;
  preview: string;
  reference_image_urls: string;
  prompt: string;
  author: string;
  link: string;
  mode: "generate" | "edit";
  image_size: string;
  image_count: string;
  category: string;
  sub_category: string;
};

const emptyForm: PromptFormState = {
  title: "",
  description: "",
  preview: "",
  reference_image_urls: "",
  prompt: "",
  author: "",
  link: "",
  mode: "generate",
  image_size: "",
  image_count: "",
  category: "",
  sub_category: "",
};

function normalizeMode(value?: string): "generate" | "edit" {
  return value === "edit" ? "edit" : "generate";
}

function modeLabel(value?: string) {
  return normalizeMode(value) === "edit" ? "图生图" : "文生图";
}

function categoryLabel(item: PromptLibraryItem) {
  return [item.category, item.sub_category].filter(Boolean).join(" / ") || "未分类";
}

function toForm(item?: PromptLibraryItem): PromptFormState {
  if (!item) {
    return emptyForm;
  }
  return {
    title: item.title || "",
    description: item.description || "",
    preview: item.preview || "",
    reference_image_urls: (item.reference_image_urls || []).join("\n"),
    prompt: item.prompt || "",
    author: item.author || "",
    link: item.link || "",
    mode: normalizeMode(item.mode),
    image_size: item.image_size || "",
    image_count: item.image_count || "",
    category: item.category || "",
    sub_category: item.sub_category || "",
  };
}

function splitUrls(value: string) {
  return value
    .replace(/,/g, "\n")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPayload(form: PromptFormState): PromptLibraryPayload {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    preview: form.preview.trim(),
    reference_image_urls: splitUrls(form.reference_image_urls),
    prompt: form.prompt.trim(),
    author: form.author.trim(),
    link: form.link.trim(),
    mode: form.mode,
    image_size: form.image_size.trim(),
    image_count: form.image_count.trim(),
    category: form.category.trim(),
    sub_category: form.sub_category.trim(),
  };
}

function summarizePrompt(prompt: string) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  return cleaned.length > 108 ? `${cleaned.slice(0, 108)}...` : cleaned;
}

function PromptManagerContent() {
  const [items, setItems] = useState<PromptLibraryItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PromptLibraryItem | null>(null);
  const [form, setForm] = useState<PromptFormState>(emptyForm);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const values = Array.from(new Set(items.map(categoryLabel))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    return ["全部", ...values];
  }, [items]);

  const filteredItems = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items.filter((item) => {
      const itemCategory = categoryLabel(item);
      if (category !== "全部" && itemCategory !== category) {
        return false;
      }
      if (!text) {
        return true;
      }
      return [item.title, item.description, item.prompt, item.author, item.category, item.sub_category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
    });
  }, [category, items, query]);

  const loadPrompts = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminPrompts();
      setItems(data.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载提示词失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPrompts();
  }, []);

  const openCreateDialog = () => {
    setEditingItem(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (item: PromptLibraryItem) => {
    setEditingItem(item);
    setForm(toForm(item));
    setDialogOpen(true);
  };

  const updateForm = (updates: Partial<PromptFormState>) => {
    setForm((current) => ({ ...current, ...updates }));
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setIsUploading(true);
    try {
      const result = await uploadPromptExampleImage(file);
      setForm((current) => {
        if (!current.preview.trim()) {
          return { ...current, preview: result.url };
        }
        const urls = splitUrls(current.reference_image_urls);
        return { ...current, reference_image_urls: [...urls, result.url].join("\n") };
      });
      toast.success("示例图已上传");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    const payload = toPayload(form);
    if (!payload.title || !payload.prompt) {
      toast.error("请填写标题和提示词");
      return;
    }
    setIsSaving(true);
    try {
      const data = editingItem
        ? await updateAdminPrompt(editingItem.id, payload)
        : await createAdminPrompt(payload);
      setItems(data.items);
      setDialogOpen(false);
      toast.success(editingItem ? "提示词已更新" : "提示词已添加");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: PromptLibraryItem) => {
    if (!window.confirm(`删除「${item.title}」？`)) {
      return;
    }
    try {
      const data = await deleteAdminPrompt(item.id);
      setItems(data.items);
      toast.success("提示词已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const copyPrompt = async (item: PromptLibraryItem) => {
    await navigator.clipboard.writeText(item.prompt);
    toast.success("提示词已复制");
  };
  const formPreviewUrl = resolveApiAssetUrl(form.preview);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Prompts</div>
          <h1 className="text-2xl font-semibold tracking-tight">提示词管理</h1>
          <p className="text-sm text-stone-500">快捷提示词和更多提示词都在这里添加、修改和删除。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadPrompts()} disabled={isLoading} className="h-10 rounded-xl border-stone-200 bg-white px-4 text-stone-700">
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
            刷新
          </Button>
          <Button onClick={openCreateDialog} className="h-10 rounded-xl bg-stone-950 px-4 text-white hover:bg-stone-800">
            <Plus className="size-4" />
            添加提示词
          </Button>
        </div>
      </div>

      <div className="yan-panel flex flex-col gap-3 rounded-lg p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、作者、分类或提示词内容"
              className="h-10 rounded-xl border-stone-200 bg-stone-50 pl-9 shadow-none focus-visible:bg-white"
            />
          </div>
          <div className="text-sm text-stone-500">共 {items.length} 条，当前 {filteredItems.length} 条</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                "h-9 rounded-full border px-3 text-xs font-medium transition",
                category === item
                  ? "border-stone-900 bg-stone-950 text-white"
                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-[320px] items-center justify-center text-sm text-stone-500">
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          正在加载提示词
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-rose-100 bg-white/60 text-sm text-stone-500">
          没有找到提示词
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => {
            const previewUrl = resolveApiAssetUrl(item.preview);
            return (
              <article key={item.id} className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
                <div className="aspect-[4/3] bg-stone-100">
                  {previewUrl ? (
                    <img src={previewUrl} alt={`${item.title} 示例图`} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-stone-400">
                      <ImagePlus className="size-8" />
                    </div>
                  )}
                </div>
                <div className="flex min-h-[230px] flex-col gap-3 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={normalizeMode(item.mode) === "edit" ? "info" : "success"}>{modeLabel(item.mode)}</Badge>
                    <Badge variant="outline">{categoryLabel(item)}</Badge>
                  </div>
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-sm font-semibold leading-5 text-stone-950">{item.title}</h2>
                    {item.description ? <p className="mt-1 truncate text-xs text-stone-400">{item.description}</p> : null}
                    <p className="mt-2 line-clamp-4 text-xs leading-5 text-stone-500">{summarizePrompt(item.prompt)}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-xs text-stone-400">{item.author || "未署名"}</div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" className="size-8 rounded-lg text-stone-500 hover:bg-stone-100" onClick={() => void copyPrompt(item)}>
                        <Copy className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 rounded-lg text-stone-500 hover:bg-stone-100" onClick={() => openEditDialog(item)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 rounded-lg text-rose-500 hover:bg-rose-50" onClick={() => void handleDelete(item)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[88vh] w-[min(94vw,860px)] max-w-none flex-col overflow-hidden rounded-lg p-0">
          <DialogHeader className="border-b border-stone-200 px-5 pt-5 pb-4 sm:px-6">
            <DialogTitle className="text-xl font-semibold text-stone-950">
              {editingItem ? "编辑提示词" : "添加提示词"}
            </DialogTitle>
            <DialogDescription className="text-stone-500">
              标题、卡片描述、提示词和示例图会同步到画图页。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-stone-500">标题</span>
                  <Input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} className="h-10 rounded-xl border-stone-200" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-stone-500">卡片描述</span>
                  <Input value={form.description} onChange={(event) => updateForm({ description: event.target.value })} className="h-10 rounded-xl border-stone-200" />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-stone-500">模式</span>
                    <Select value={form.mode} onValueChange={(value) => updateForm({ mode: normalizeMode(value) })}>
                      <SelectTrigger className="h-10 rounded-xl border-stone-200 shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="generate">文生图</SelectItem>
                        <SelectItem value="edit">图生图</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-stone-500">分类</span>
                    <Input value={form.category} onChange={(event) => updateForm({ category: event.target.value })} className="h-10 rounded-xl border-stone-200" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-stone-500">子分类</span>
                    <Input value={form.sub_category} onChange={(event) => updateForm({ sub_category: event.target.value })} className="h-10 rounded-xl border-stone-200" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-stone-500">默认比例</span>
                    <Input value={form.image_size} onChange={(event) => updateForm({ image_size: event.target.value })} placeholder="例如 4:3、1:1，留空为未指定" className="h-10 rounded-xl border-stone-200" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-stone-500">默认张数</span>
                    <Input value={form.image_count} onChange={(event) => updateForm({ image_count: event.target.value })} placeholder="例如 1，留空则不覆盖" className="h-10 rounded-xl border-stone-200" />
                  </label>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-stone-500">提示词</span>
                  <Textarea
                    value={form.prompt}
                    onChange={(event) => updateForm({ prompt: event.target.value })}
                    className="min-h-[260px] resize-y rounded-xl border-stone-200 text-sm leading-6"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-stone-500">作者</span>
                    <Input value={form.author} onChange={(event) => updateForm({ author: event.target.value })} className="h-10 rounded-xl border-stone-200" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-stone-500">来源链接</span>
                    <Input value={form.link} onChange={(event) => updateForm({ link: event.target.value })} className="h-10 rounded-xl border-stone-200" />
                  </label>
                </div>
              </div>
              <div className="space-y-4">
                <input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handleUpload(event)} />
                <div className="space-y-2">
                  <span className="text-xs font-medium text-stone-500">示例图</span>
                  <div className="aspect-[4/3] overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                    {formPreviewUrl ? (
                      <img src={formPreviewUrl} alt="示例图预览" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-stone-400">
                        <ImagePlus className="size-8" />
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={isUploading}
                    className="h-10 w-full rounded-xl border-stone-200 bg-white"
                  >
                    {isUploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    上传示例图
                  </Button>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-stone-500">示例图 URL</span>
                  <Input value={form.preview} onChange={(event) => updateForm({ preview: event.target.value })} className="h-10 rounded-xl border-stone-200" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-stone-500">参考图 URL</span>
                  <Textarea
                    value={form.reference_image_urls}
                    onChange={(event) => updateForm({ reference_image_urls: event.target.value })}
                    className="min-h-[132px] resize-y rounded-xl border-stone-200 text-sm leading-6"
                  />
                </label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="h-10 rounded-xl border-stone-200 bg-white px-4">
              取消
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={isSaving} className="h-10 rounded-xl bg-stone-950 px-4 text-white hover:bg-stone-800">
              {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default function PromptManagerPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);
  if (isCheckingAuth || !session || session.role !== "admin") {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }
  return <PromptManagerContent />;
}
