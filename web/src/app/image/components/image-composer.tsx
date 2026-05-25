"use client";
import { ArrowUp, Check, ChevronDown, Glasses, ImagePlus, LoaderCircle, Scissors, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type RefObject } from "react";

import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ImageConversationMode } from "@/store/image-conversations";
import { cn } from "@/lib/utils";

const GLASSES_PROMPT = `
不知道自己适合佩戴什么样式的眼镜？

1. 面部特征分析：
“面部特征分析”。将人像置于中心位置。自动分析面部（不要使用固定的或预先写好的标签）。检测并标注脸型、眼睛、眉毛、鼻子、脸颊和嘴唇。添加指向每个特征的细箭头。针对每个特征，提供一个简短的标签（例如“柔和的椭圆脸”、“杏仁眼”），并根据图像提供 2–3 个简短的要点来描述实际特征。使用带有简单图标的小型圆角信息卡片。

2. 眼镜搭配指南：
“眼镜搭配指南”。使用上传的人像（100% 还原面部特征）作为主体，生成一张干净、现代的信息图海报。风格应极简、具有美感且以视觉呈现为主，采用清晰的排版、圆角卡片、细线条、微妙的阴影以及高级杂志风格。标题：“眼镜搭配指南”。自动分析脸型和比例，然后生成适合与不适合的眼镜推荐。使用同一张脸展示并排的眼镜试戴效果对比。
`.trim();

const HAIRSTYLE_PROMPT = `
不知道自己适合什么发型？

请根据用户上传的正面形象照片，生成一张横向4:3的高完成度「AI发型美学升级报告/发型升级前后报告」。用户上传的本人形象照片，是本次生成的核心参考。请严格保留用户本人身份相似度、五官结构、脸型比例、年龄感、皮肤真实轮廓、表情气质和原创穿搭，让人瞬间能认出是同一个人。本次升级重点放在发型设计、头发长度、刘海处理、层次结构、蓬松度、阶梯体积、发尾高度和发色建议上。不要改变五官、不要瘦脸、不要磨皮美颜、不要换衣服、不要靠妆容提升效果。请把画面设计做成一个融合「时尚发型顾问模板 + 杂志型时尚顾问模板 + 多方案对比 + 充满幽默避坑感」的个人发型升级报告。它既要专业、清晰、有设计感，还要有一点“原来这些发型不适合我”的轻微趣味感，让观众会心一笑，但不能恶搞、不能造成丑化人物、不能做负面整蛊图。

【整体版式】横向4:3构图，背景以白色、米白、浅灰为主，少量浅橄榄绿、灰蓝、柔和红色作为功能性强调色。整体版式不要完全照搬参考图，形式为整页协调矩阵，同时更主次分明、对应个人专属造型。画面采用「左侧原始造型大图 + 右侧主推造型大图 + 中下部最佳选择推荐区 + 底部避雷区 + 底部发型执行指南」的结构。整体视觉要达到高级、保持合理留白、信息丰富但不拥挤。

【标题区】顶部主标题：AI发型美学升级报告。中文副标题：发型升级前后报告。可加入辅助小标签：HAIR RESET STYLE PROPOSAL / BEST CUT FOR YOU / 个人发型升级。

【中央主视觉】左边为原始发型大图 Before：尽量保持用户当前发型的真实状态，包括原始长度、自然发量、凌乱度、贴头皮感、刘海状态、发尾状态和整体精神感。不要偷偷优化原图，不要让之前外观已经变好。右边为之后主推发型大图 After：仍然是同一个人，同样的脸、同样的亮度、同样的服装和相似光线构图，只升级发型。发型后应该更适合这个人，看起来更精神、更帅气、更修饰脸型、更协调、更日常高级感，且真实可实现。方向偏韩系自然、Clean Cut、松弛有型、低维护、生活化，不要夸张杀马特，不要网红模板发型，不要过度油头，不要明显染漂，不要舞台感造型。

【主推发型优化方向】请根据人物的真实条件自动判断最适合的发型，并在主推重点后表示：
1. 更合适的刘海或露额比例
2. 更自然的头顶蓬松度
3. 更合理的头部体积控制
4. 更清晰的发尾与层次
5. 更有秩序的发量视觉
6. 更适合肤色与气质的自然发色
7. 整体头面比例更协调、更有精神

【专业注释】在主图上加入精致编号圆点、细线箭头和局部放大注释后，明确标注以下 6 个关键点：
01 刘海 / Bangs：说明刘海、长度或露额比例如何修饰五官
02 头顶 / Crown Volume：说明头顶蓬松度如何提升精神感
03 侧区 / Side Balance：说明侧区体积如何修饰脸型宽度
04 层次 / Layers：说明层次如何处理厚重感
05 发尾 / Hair Ends：说明发尾更干净利落、补充秩序
06 发色 / Hair Color：说明自然发色如何提升整体清晰度

【腰部信息栏方向：Key Features】在大图附近设置一个简洁的信息栏，使用图标 + 中英混排短标签，不要写成长段文字。自动分析并展示人物当前的发型基础条件，例如：
- 脸型 / Face Shape
- 发质密度 / Hair Density
- 发质 / Hair Texture
- 自然波浪 / Natural Wave
- 额头比例 / Forehead Ratio
- 当前长度 / Current Length
- 打理难度 / Styling Difficulty

【最佳选项推荐区】展示 4 个发型推荐方案卡，保留绿色标记标识。每个方案都必须是同一个人，只改变发型，不改变脸型和穿搭。每张方案卡展示一个适合的发型，并附上一个名称和一个优势描述。推荐发型各自有差异，但都在合理范围内，偏自然、真实、可执行。可以是例如：
- Soft Layer Cut：轻盈自然，修饰脸型
- Korean Clean Style：潇洒精神，日常高级
- Side Part Natural：增加成熟感，更显利落
- Airy Texture：更多空气感，减少沉闷
每一张对应都要让人感觉“这个也适合、那个也不错”，形成清晰对比和选择感。

【Less Flattering 避雷区】展示 3 个不推荐发型方案，保留红色叉号标志。这里可以让人一下子看出一点点不太适合，甚至有一点点好笑，但必须控制分寸：不能恶搞、不能离谱、不能故意把人变丑，只能是“确实不适合”的反差感。比如：
- 过度贴头皮：显脸宽、显局促
- 过厚齐刘海：压住五官、显闷
- 过度油头：显老气、太刻意
- 过短或过尖锐：太凶、太硬、不协调
这些不适合方案要看起来稍微有趣，但仍然在现实发型范围内，不要变成夸张搞笑造型。

【发型指南底部执行指南】底部设置一条更实用的发型执行指南，用稀疏文字清晰表示：
1. 最佳头发长度 / 最佳发长建议
2. 修剪焦点 / 发型重点（刘海、鬓角、头顶、发尾、层次）
3. 造型方法 / 日常打理方式（吹干、抓蓬、轻造型）
4. Maintenance Cycle / 建议保养周期
5. 最佳发色 / 推荐发色
推荐发色用 3—4 种自然色卡展示，例如：自然黑、深棕色、灰棕色、软冷棕色。整体要偏自然低调，不要高饱和漂染。

【文字风格】整张图以短标签、短标题、短句为主，不要大段说明。中文主导，英文作为辅助标签。文字说明不可乱码，不要大量无意义的英文。整体像专业面部与发型顾问给出的“个人面部发型示范”，同时加入轻松课堂化表达。

【视觉语气】请让整张图专业顾问感，也有一点报告“避坑提醒”的视觉感。推荐区让人觉得“这些发型确实挺适合”，避雷区让人觉得“哈哈，这种真的不太行”，但整体仍然必须干净、高级、好看、有设计感，不能变成低级恶搞。

【底部小字】本图为AI造型视觉提案，仅供参考。实际造型建议请以专业发型师面诊为准。

【彻底避免】不要改变用户身份，不要换脸，不要改变五官，不要磨皮美颜，不要改变穿搭，不要通过化妆或服装提升效果。不要生成夸张发型、杀马特、二次元造型、舞台造型、过度油头、过度漂染。不要让多个发型方案看起来不像同一个人。不要完全照搬参考图的排版。不要参考普通发型合集图，而要做一张高完成度、专业又有一点感性的个人发型造型升级报告。
`.trim();

type ImagePromptPreset = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  mode: ImageConversationMode;
  imageSize?: string;
  imageCount?: string;
  icon: LucideIcon;
};

const promptPresetOptions: ImagePromptPreset[] = [
  {
    id: "glasses",
    title: "不知道适合什么眼镜？",
    description: "面部特征分析 + 眼镜搭配指南",
    prompt: GLASSES_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: Glasses,
  },
  {
    id: "hairstyle",
    title: "不知道适合什么发型？",
    description: "AI发型美学升级报告",
    prompt: HAIRSTYLE_PROMPT,
    mode: "edit",
    imageSize: "4:3",
    imageCount: "1",
    icon: Scissors,
  },
];

type ImageComposerProps = {
  mode: ImageConversationMode;
  prompt: string;
  imageCount: string;
  imageSize: string;
  availableQuota: string;
  activeTaskCount: number;
  referenceImages: Array<{ name: string; dataUrl: string }>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onModeChange: (value: ImageConversationMode) => void;
  onPromptChange: (value: string) => void;
  onImageCountChange: (value: string) => void;
  onImageSizeChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  onPickReferenceImage: () => void;
  onReferenceImageChange: (files: File[]) => void | Promise<void>;
  onRemoveReferenceImage: (index: number) => void;
};

export function ImageComposer({
  mode,
  prompt,
  imageCount,
  imageSize,
  availableQuota,
  activeTaskCount,
  referenceImages,
  textareaRef,
  fileInputRef,
  onModeChange,
  onPromptChange,
  onImageCountChange,
  onImageSizeChange,
  onSubmit,
  onPickReferenceImage,
  onReferenceImageChange,
  onRemoveReferenceImage,
}: ImageComposerProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isSizeMenuOpen, setIsSizeMenuOpen] = useState(false);
  const sizeMenuRef = useRef<HTMLDivElement>(null);
  const lightboxImages = useMemo(
    () => referenceImages.map((image, index) => ({ id: `${image.name}-${index}`, src: image.dataUrl })),
    [referenceImages],
  );
  const imageSizeOptions = [
    { value: "", label: "未指定" },
    { value: "1:1", label: "1:1 (正方形)" },
    { value: "16:9", label: "16:9 (横版)" },
    { value: "4:3", label: "4:3 (横版)" },
    { value: "3:4", label: "3:4 (竖版)" },
    { value: "9:16", label: "9:16 (竖版)" },
  ];
  const imageSizeLabel = imageSizeOptions.find((option) => option.value === imageSize)?.label || "未指定";
  const activePresetId = promptPresetOptions.find((preset) => preset.prompt === prompt)?.id;

  const handlePromptPresetSelect = (preset: ImagePromptPreset) => {
    onModeChange(preset.mode);
    onPromptChange(preset.prompt);
    if (preset.imageSize !== undefined) {
      onImageSizeChange(preset.imageSize);
    }
    if (preset.imageCount !== undefined) {
      onImageCountChange(preset.imageCount);
    }
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  useEffect(() => {
    if (!isSizeMenuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!sizeMenuRef.current?.contains(event.target as Node)) {
        setIsSizeMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isSizeMenuOpen]);

  const handleTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void onReferenceImageChange(imageFiles);
  };

  return (
    <div className="shrink-0 flex justify-center">
      <div style={{ width: "min(980px, 100%)" }}>
        {mode === "edit" && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void onReferenceImageChange(Array.from(event.target.files || []));
            }}
          />
        )}

        {mode === "edit" && referenceImages.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2 px-1">
            {referenceImages.map((image, index) => (
              <div key={`${image.name}-${index}`} className="relative size-16">
                <button
                  type="button"
                  onClick={() => {
                    setLightboxIndex(index);
                    setLightboxOpen(true);
                  }}
                  className="group size-16 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 transition hover:border-stone-300"
                  aria-label={`预览参考图 ${image.name || index + 1}`}
                >
                  <img
                    src={image.dataUrl}
                    alt={image.name || `参考图 ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveReferenceImage(index);
                  }}
                  className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-800"
                  aria-label={`移除参考图 ${image.name || index + 1}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mb-3 grid gap-2 px-1 sm:grid-cols-2">
          {promptPresetOptions.map((preset) => {
            const active = preset.id === activePresetId;
            const PresetIcon = preset.icon;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePromptPresetSelect(preset)}
                className={cn(
                  "flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                  active
                    ? "border-stone-900 bg-stone-950 text-white shadow-sm"
                    : "border-stone-200 bg-white text-stone-800 hover:border-stone-300 hover:bg-stone-50",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
                    active ? "bg-white/15 text-white" : "bg-stone-100 text-stone-600",
                  )}
                >
                  <PresetIcon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{preset.title}</span>
                  <span className={cn("mt-0.5 block truncate text-xs", active ? "text-white/70" : "text-stone-500")}>
                    {preset.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-[32px] border border-stone-200 bg-white">
          <div
            className="relative cursor-text"
            onClick={() => {
              textareaRef.current?.focus();
            }}
          >
            <ImageLightbox
              images={lightboxImages}
              currentIndex={lightboxIndex}
              open={lightboxOpen}
              onOpenChange={setLightboxOpen}
              onIndexChange={setLightboxIndex}
            />
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              onPaste={handleTextareaPaste}
              placeholder={
                mode === "edit" ? "描述你希望如何修改这张参考图，可直接粘贴图片" : "输入你想要生成的画面，也可直接粘贴图片"
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              className="min-h-[148px] resize-none rounded-[32px] border-0 bg-transparent px-6 pt-6 pb-20 text-[15px] leading-7 text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0"
            />

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-4 pt-6 sm:px-6">
              <div className="flex items-end justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
                  {mode === "edit" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-full border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 shadow-none sm:h-10 sm:px-4 sm:text-sm"
                      onClick={onPickReferenceImage}
                    >
                      <ImagePlus className="size-3.5 sm:size-4" />
                      <span className="hidden sm:inline">{referenceImages.length > 0 ? "继续添加参考图" : "上传参考图"}</span>
                      <span className="sm:hidden">{referenceImages.length > 0 ? "继续" : "上传"}</span>
                    </Button>
                  )}
                  <div className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-medium text-stone-600 sm:px-3 sm:py-2 sm:text-xs">
                    <span className="hidden xs:inline">剩余额度 </span>{availableQuota}
                  </div>
                  {activeTaskCount > 0 && (
                    <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 sm:gap-1.5 sm:px-3 sm:py-2 sm:text-xs">
                      <LoaderCircle className="size-3 animate-spin" />
                      {activeTaskCount}<span className="hidden sm:inline"> 个任务处理中</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2 py-0.5 sm:gap-2 sm:px-3 sm:py-1">
                    <span className="text-[11px] font-medium text-stone-700 sm:text-sm">张数</span>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      step="1"
                      value={imageCount}
                      onChange={(event) => onImageCountChange(event.target.value)}
                      className="h-7 w-[40px] border-0 bg-transparent px-0 text-center text-xs font-medium text-stone-700 shadow-none focus-visible:ring-0 sm:h-8 sm:w-[64px] sm:text-sm"
                    />
                  </div>
                  <div
                    ref={sizeMenuRef}
                    className="relative flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[11px] sm:gap-2 sm:px-3 sm:py-1 sm:text-[13px]"
                  >
                    <span className="font-medium text-stone-700 sm:text-sm">比例</span>
                    <button
                      type="button"
                      className="flex h-7 w-[110px] items-center justify-between bg-transparent text-left text-xs font-bold text-stone-700 sm:h-8 sm:w-[132px]"
                      onClick={() => setIsSizeMenuOpen((open) => !open)}
                    >
                      <span className="truncate">{imageSizeLabel}</span>
                      <ChevronDown className={cn("size-4 shrink-0 opacity-60 transition", isSizeMenuOpen && "rotate-180")} />
                    </button>
                    {isSizeMenuOpen ? (
                      <div className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[170px] overflow-hidden rounded-3xl border border-white/80 bg-white p-2 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] sm:w-[186px]">
                        {imageSizeOptions.map((option) => {
                          const active = option.value === imageSize;
                          return (
                            <button
                              key={option.label}
                              type="button"
                              className={cn(
                                "flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-stone-100",
                                active && "bg-stone-100 font-medium text-stone-950",
                              )}
                              onClick={() => {
                                onImageSizeChange(option.value);
                                setIsSizeMenuOpen(false);
                              }}
                            >
                              <span>{option.label}</span>
                              {active ? <Check className="size-4" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <ModeButton active={mode === "generate"} onClick={() => onModeChange("generate")}>
                      文生图
                    </ModeButton>
                    <ModeButton active={mode === "edit"} onClick={() => onModeChange("edit")}>
                      图生图
                    </ModeButton>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  disabled={!prompt.trim() || (mode === "edit" && referenceImages.length === 0)}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-950 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 sm:size-11"
                  aria-label={mode === "edit" ? "编辑图片" : "生成图片"}
                >
                  <ArrowUp className="size-3.5 sm:size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1.5 text-xs font-medium transition sm:px-4 sm:py-2 sm:text-sm",
        active ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200",
      )}
    >
      {children}
    </button>
  );
}
