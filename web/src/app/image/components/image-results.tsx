"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, ImageIcon, LoaderCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchPromptLibrary, type PromptLibraryItem } from "@/lib/api";
import { resolveApiAssetUrl } from "@/lib/assets";
import { cn } from "@/lib/utils";
import type { ImageConversation, ImageTurnStatus, StoredImage, StoredReferenceImage } from "@/store/image-conversations";

export type ImageLightboxItem = {
  id: string;
  src: string;
  sizeLabel?: string;
  dimensions?: string;
};

type ImageResultsProps = {
  selectedConversation: ImageConversation | null;
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onContinueEdit: (conversationId: string, image: StoredImage | StoredReferenceImage) => void;
  formatConversationTime: (value: string) => string;
};

type EmptyStatePromptSource = {
  id?: string;
  title?: string;
  label?: string;
  fallbackTitle: string;
  fallbackDescription?: string;
  fallbackPreview: string;
};

const emptyStateHeroSource: EmptyStatePromptSource = {
  id: "glasses",
  fallbackTitle: "不知道适合什么眼镜？",
  fallbackDescription: "面部特征分析 + 眼镜搭配指南",
  fallbackPreview: "https://cdn3.ldstatic.com/optimized/4X/f/d/3/fd350eb34e18b9bd60706b1820a89bf03730f824_2_600x750.jpeg",
};

const emptyStateExampleSources: EmptyStatePromptSource[] = [
  {
    title: "中国神话角色Q版组合插画",
    label: "国风插画",
    fallbackTitle: "中国神话角色Q版组合插画",
    fallbackPreview: "/banana-prompt-quicker/images/chinese_mythology_characters.jpg",
  },
  {
    title: "生成商业促销海报",
    label: "产品海报",
    fallbackTitle: "生成商业促销海报",
    fallbackPreview: "/banana-prompt-quicker/images/promo_poster.jpg",
  },
  {
    id: "handwritten-notes",
    label: "手写笔记风格",
    fallbackTitle: "手写笔记风格",
    fallbackPreview: "https://cdn3.ldstatic.com/optimized/4X/a/7/c/a7c6e18b0b22cd9f305cedec8aa55aecc8fae4d4_2_499x750.jpeg",
  },
  {
    id: "photo-portrait-v1",
    label: "写真随机风格 V1",
    fallbackTitle: "写真随机风格 V1",
    fallbackPreview: "/prompt-assets/2026/06/02/2d2db3cac0f5412d83e79af24905b4e9.png",
  },
];

export function ImageResults({
  selectedConversation,
  onOpenLightbox,
  onContinueEdit,
  formatConversationTime,
}: ImageResultsProps) {
  const [imageDimensions, setImageDimensions] = useState<Record<string, string>>({});
  const [promptLibraryItems, setPromptLibraryItems] = useState<PromptLibraryItem[]>([]);

  useEffect(() => {
    if (selectedConversation) {
      return;
    }

    let cancelled = false;
    void fetchPromptLibrary()
      .then((data) => {
        if (!cancelled) {
          setPromptLibraryItems(data.items || data.prompts || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPromptLibraryItems([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedConversation]);

  const emptyStateHero = useMemo(() => buildEmptyStatePromptPreview(emptyStateHeroSource, promptLibraryItems), [promptLibraryItems]);
  const emptyStateExamples = useMemo(
    () => emptyStateExampleSources.map((source) => buildEmptyStatePromptPreview(source, promptLibraryItems)),
    [promptLibraryItems],
  );

  const updateImageDimensions = (id: string, width: number, height: number) => {
    const dimensions = formatImageDimensions(width, height);
    setImageDimensions((current) => {
      if (current[id] === dimensions) {
        return current;
      }
      return { ...current, [id]: dimensions };
    });
  };

  if (!selectedConversation) {
    return (
      <div className="grid min-h-[520px] items-center gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(280px,.92fr)]">
        <div className="relative min-h-[420px] overflow-hidden rounded-lg border border-white/70 bg-white/52 shadow-sm">
          <img
            src={emptyStateHero.preview}
            alt={emptyStateHero.title}
            className="absolute inset-0 h-full w-full object-cover opacity-75"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#2d1d26]/70 via-[#2d1d26]/12 to-white/10" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <div className="inline-flex rounded-full bg-white/18 px-3 py-1 text-xs font-semibold backdrop-blur">示例预览</div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">{emptyStateHero.title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/78">{emptyStateHero.description}</p>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-lg border border-white/70 bg-white/58 p-4">
            <div className="grid size-12 place-items-center rounded-lg bg-gradient-to-br from-rose-100 to-fuchsia-100 text-rose-500">
              <ImageIcon className="size-5" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-950">从右侧创作台开始</h1>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              支持文生图、图生图、参考图上传和粘贴、提示词库、队列恢复、灯箱预览与继续编辑。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {emptyStateExamples.map((item) => (
              <div key={item.label} className="rounded-lg border border-white/70 bg-gradient-to-br from-white/76 to-rose-50/70 p-3">
                <div className="h-20 overflow-hidden rounded-lg border border-white/70 bg-rose-50">
                  <img src={item.preview} alt={`${item.label}示例`} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <div className="mt-3 text-sm font-semibold text-stone-800">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {selectedConversation.turns.map((turn, turnIndex) => {
        const referenceLightboxImages = turn.referenceImages.map((image, index) => ({
          id: `${turn.id}-reference-${index}`,
          src: image.dataUrl,
        }));
        const successfulTurnImages = turn.images.flatMap((image) =>
          image.status === "success" && (image.b64_json || image.url)
            ? [
                {
                  id: image.id,
                  src: image.b64_json ? `data:image/png;base64,${image.b64_json}` : image.url || "",
                  sizeLabel: image.b64_json ? formatBase64ImageSize(image.b64_json) : undefined,
                  dimensions: imageDimensions[image.id],
                },
              ]
            : [],
        );

        return (
          <section key={turn.id} className="overflow-hidden rounded-lg border border-white/70 bg-white/46 shadow-sm">
            <div className="border-b border-rose-100/70 bg-white/56 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-2 text-[11px] font-medium text-stone-400">
                    <span>第 {turnIndex + 1} 轮</span>
                    <span>{turn.mode === "edit" ? "图生图" : "文生图"}</span>
                    <span>{getTurnStatusLabel(turn.status)}</span>
                    <span>{formatConversationTime(turn.createdAt)}</span>
                  </div>
                  <p className="line-clamp-2 text-sm leading-6 text-stone-800">{turn.prompt}</p>
                </div>
                <div className="shrink-0 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-stone-600">
                  {turn.count} 张
                </div>
              </div>
            </div>

            {turn.referenceImages.length > 0 ? (
              <div className="border-b border-rose-100/60 px-4 py-3">
                <div className="mb-3 text-xs font-semibold text-stone-500">本轮参考图</div>
                <div className="flex flex-wrap gap-3">
                  {turn.referenceImages.map((image, index) => (
                    <div key={`${turn.id}-${image.name}-${index}`} className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenLightbox(referenceLightboxImages, index)}
                        className="group relative size-20 overflow-hidden rounded-lg border border-rose-100 bg-rose-50/60 text-left transition hover:border-rose-200"
                        aria-label={`预览参考图 ${image.name || index + 1}`}
                      >
                        <img
                          src={image.dataUrl}
                          alt={image.name || `参考图 ${index + 1}`}
                          className="absolute inset-0 h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                        />
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg border-rose-100 bg-white/85 text-stone-700 hover:bg-white"
                        onClick={() => onContinueEdit(selectedConversation.id, image)}
                      >
                        <Sparkles className="size-4" />
                        加入编辑
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {turn.images.map((image, index) => {
                const featured = index === 0 && turn.images.length > 1;

                if (image.status === "success" && (image.b64_json || image.url)) {
                  const currentIndex = successfulTurnImages.findIndex((item) => item.id === image.id);
                  const imageSrc = image.b64_json ? `data:image/png;base64,${image.b64_json}` : image.url || "";
                  const sizeLabel = image.b64_json ? formatBase64ImageSize(image.b64_json) : "";
                  const dimensions = imageDimensions[image.id];
                  const imageMeta = [sizeLabel, dimensions].filter(Boolean).join(" · ");

                  return (
                    <div
                      key={image.id}
                      className={cn(
                        "overflow-hidden rounded-lg border border-white/75 bg-white/78 shadow-sm",
                        featured && "md:row-span-2",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenLightbox(successfulTurnImages, Math.max(0, currentIndex))}
                        className={cn("group block w-full cursor-zoom-in bg-stone-100", featured ? "aspect-[3/4]" : getImageAspectClass(turn.size))}
                      >
                        <img
                          src={imageSrc}
                          alt={`Generated result ${index + 1}`}
                          className="h-full w-full object-cover transition duration-200 group-hover:brightness-90"
                          onLoad={(event) => {
                            updateImageDimensions(
                              image.id,
                              event.currentTarget.naturalWidth,
                              event.currentTarget.naturalHeight,
                            );
                          }}
                        />
                      </button>
                      <div className="flex items-center justify-between gap-2 px-3 py-3">
                        <div className="min-w-0 text-xs text-stone-500">
                          <span>结果 {index + 1}</span>
                          {imageMeta ? <span className="ml-2 text-stone-400">{imageMeta}</span> : null}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg border-rose-100 bg-white/85 text-stone-700 hover:bg-white"
                          onClick={() => onContinueEdit(selectedConversation.id, image)}
                        >
                          <Sparkles className="size-4" />
                          编辑
                        </Button>
                      </div>
                    </div>
                  );
                }

                if (image.status === "error") {
                  return (
                    <div
                      key={image.id}
                      className={cn(
                        "overflow-hidden rounded-lg border border-rose-200 bg-rose-50",
                        getImageAspectClass(turn.size),
                        featured && "md:row-span-2",
                      )}
                    >
                      <div className="flex h-full items-center justify-center px-6 py-8 text-center text-sm leading-6 text-rose-600">
                        {image.error || "生成失败"}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={image.id}
                    className={cn(
                      "overflow-hidden rounded-lg border border-rose-100/80 bg-rose-50/70",
                      getImageAspectClass(turn.size),
                      featured && "md:row-span-2",
                    )}
                  >
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center text-stone-500">
                      <div className="rounded-full bg-white p-3 shadow-sm">
                        {turn.status === "queued" ? (
                          <Clock3 className="size-5" />
                        ) : (
                          <LoaderCircle className="size-5 animate-spin" />
                        )}
                      </div>
                      <p className="text-sm">{turn.status === "queued" ? "已加入当前对话队列..." : "正在处理图片..."}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {turn.status === "queued" ? (
              <div className="mx-4 mb-4 rounded-lg bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-700">
                等待当前对话中的前序任务完成
              </div>
            ) : null}

            {turn.status === "error" && turn.error ? (
              <div className="mx-4 mb-4 border-l-2 border-amber-300 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-700">
                {turn.error}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function getImageAspectClass(size: string) {
  if (size === "1:1") return "aspect-square";
  if (size === "16:9") return "aspect-video";
  if (size === "9:16") return "aspect-[9/16]";
  if (size === "4:3") return "aspect-[4/3]";
  if (size === "3:4") return "aspect-[3/4]";
  return "aspect-[4/3]";
}

function findPromptPreview(source: EmptyStatePromptSource, items: PromptLibraryItem[]) {
  return items.find((item) => (source.id ? item.id === source.id : false) || (source.title ? item.title === source.title : false));
}

function buildEmptyStatePromptPreview(source: EmptyStatePromptSource, items: PromptLibraryItem[]) {
  const prompt = findPromptPreview(source, items);
  return {
    label: source.label || prompt?.title || source.fallbackTitle,
    title: prompt?.title || source.fallbackTitle,
    description: prompt?.description || source.fallbackDescription || "",
    preview: resolveApiAssetUrl(prompt?.preview || source.fallbackPreview),
  };
}

function getTurnStatusLabel(status: ImageTurnStatus) {
  if (status === "queued") {
    return "排队中";
  }
  if (status === "generating") {
    return "处理中";
  }
  if (status === "success") {
    return "已完成";
  }
  return "失败";
}

function formatBase64ImageSize(base64: string) {
  const normalized = base64.replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  const bytes = Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function formatImageDimensions(width: number, height: number) {
  return `${width} x ${height}`;
}
