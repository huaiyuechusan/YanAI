"use client";
import {
  ArrowUp,
  Aperture,
  Box,
  Camera,
  Check,
  ChevronDown,
  Clapperboard,
  ExternalLink,
  Glasses,
  ImagePlus,
  Images,
  LoaderCircle,
  Newspaper,
  NotebookPen,
  Search,
  Scissors,
  Sparkles,
  SunMedium,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type RefObject } from "react";

import { ImageLightbox } from "@/components/image-lightbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchPromptLibrary, type PromptLibraryItem } from "@/lib/api";
import { resolveApiAssetUrl } from "@/lib/assets";
import type { ImageConversationMode } from "@/store/image-conversations";
import { cn } from "@/lib/utils";

const BANANA_PROMPTS_SNAPSHOT_VERSION = "2026-05-27-sfw";
const BANANA_PROMPTS_URL = `/banana-prompt-quicker/prompts.json?v=${BANANA_PROMPTS_SNAPSHOT_VERSION}`;
const BANANA_PROMPTS_ASSET_BASE_URL = "/banana-prompt-quicker/";
const PROMPT_LIBRARY_API_TIMEOUT_MS = 2200;
const QUICK_PROMPT_COUNT = 3;

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

const NATURAL_BEAUTY_PROMPT = `
请对上传的人像照片做自然、真实的轻度美颜精修，目标是像专业摄影师完成的自然修图，而不是明显滤镜或换脸效果。

请严格保留同一个人的身份相似度、五官结构、脸型比例、年龄感、发型轮廓、表情、服装、背景和原始构图。不要改变脸型，不要瘦脸，不要改变眼睛、鼻子、嘴唇的形状，不要让人看起来不像本人。

优化重点：
1. 轻微均匀肤色，降低暗沉、泛红和油光，只去除临时瑕疵、痘印、浮粉和明显斑驳。
2. 保留真实皮肤纹理、毛孔、细纹和自然绒毛，避免塑料感、蜡像感、过度磨皮。
3. 轻微提亮眼神和面部重点区域，保持自然高光与阴影，不制造夸张妆感。
4. 让嘴唇、眉毛、睫毛和发丝更清晰干净，但不要重画五官或添加浓妆。
5. 优化整体白平衡、曝光、对比度和肤色，让照片更通透、干净、自然。

输出效果：真实摄影、人像精修、自然肤质、清爽干净、高清细节、保留本人特征。彻底避免：换脸、五官变形、过度美颜、网红脸、磨皮过强、假毛孔、过锐化、HDR 过重、肤色发灰或发橙。
`.trim();

const PHOTO_ENHANCE_PROMPT = `
请对上传照片做专业摄影后期优化，使它看起来像原照片被更好的相机、更好的镜头和更稳的后期处理呈现出来。

请保持原始主体、人物身份、场景内容、构图、服装、姿态和背景不变，不要新增人物或物体，不要替换背景，不要改变照片含义。

优化重点：
1. 修正曝光、白平衡、色温和色偏，让主体更清晰、色彩更自然。
2. 增强局部清晰度、微对比和材质细节，保留皮肤、头发、布料、建筑、植物等真实纹理。
3. 降低噪点、压缩痕迹、模糊感和灰雾感，但不要造成涂抹、假锐化或边缘光晕。
4. 恢复高光和阴影层次，避免过曝死白、暗部死黑和不自然 HDR。
5. 进行自然的摄影级调色：干净、通透、真实、有质感，不要浓重滤镜。

输出效果：真实照片增强、高清、自然色彩、细节清楚、层次丰富。彻底避免：AI感、插画感、换背景、改变身份、脸部变形、过度锐化、过饱和、油画感、塑料皮肤。
`.trim();

const BACKLIGHT_REPAIR_PROMPT = `
请修复这张暗光、逆光或曝光不均的照片，让主体更清楚，同时保留现场真实氛围。

请保持人物身份、五官结构、肤色基调、服装、背景、姿态和构图不变，不要重塑脸部，不要替换场景，不要添加不属于原图的光效。

优化重点：
1. 提亮面部和主体区域，恢复暗部细节，让人脸更自然可见。
2. 压回过曝高光，保留天空、窗户、灯光、皮肤高光等区域的层次。
3. 平衡冷暖色温，修正偏黄、偏绿、偏蓝或手机夜景模式造成的色偏。
4. 降低暗部噪点和压缩颗粒，同时保留皮肤、头发、衣物和背景纹理。
5. 让整体光影更柔和自然，像经过摄影后期修复的真实照片。

输出效果：自然补光、真实曝光、清晰主体、层次丰富、照片质感。彻底避免：过亮发灰、HDR 过重、脸部蜡像、肤色失真、强行换天、添加镜头光斑、改变原场景。
`.trim();

const DETAIL_RESTORE_PROMPT = `
请对上传照片做高清细节修复和轻度去模糊处理，让它更清晰、更干净，但仍然像同一张真实照片。

请严格保持原始人物身份、脸部比例、五官形状、年龄感、发型、服装、场景和构图。不要改变表情，不要替换背景，不要把照片重新画成插画或写真模板。

优化重点：
1. 提升整体分辨率和边缘清晰度，修复轻微手抖、失焦、压缩造成的模糊。
2. 恢复真实细节：眼睛高光、睫毛、眉毛、发丝、皮肤纹理、衣物纹理和背景材质。
3. 降低噪点、色块、马赛克和压缩痕迹，避免涂抹感。
4. 保持自然颗粒和镜头质感，不要让细节变成假纹理。
5. 适度优化亮度、对比和色彩，让照片清晰但不刺眼。

输出效果：真实高清修复、自然锐化、细节增强、同一张照片更清楚。彻底避免：换脸、五官重绘、假毛孔、过度锐化光晕、AI插画感、塑料皮肤、过度降噪涂抹。
`.trim();

const PHOTO_PORTRAIT_V1_PROMPT = `
# 角色设定（Role Definition）
你是一位资深的视觉艺术家与摄影风格提示词专家，对现代主流审美趋势有敏锐的洞察力。你精通摄影构图、光影运用、氛围营造和人像美学，能够将复杂的视觉概念转化为精准、生动且富有吸引力的文本描述，专门用于指导AI图像生成模型。

# 任务描述（Task Specification）
你的任务是根据一系列预设的、符合大众审美的摄影风格元素，随机组合并生成一条高质量、风格鲜明、让人眼前一亮的真人写真风格AI绘画提示词。

# 任务步骤（Task Steps）
1.  **随机选择一个核心摄影风格**：从以下列表中随机选择一种作为基础风格：
    * 细腻皮肤真实质感风
    * 日常快照抓拍风
    * 高级感时尚人像风
    * 日系清新氛围风
    * 电影感光影故事风
    * 水润通透感写真

2.  **随机确定主体与构图**：随机选择一个主体、一个机位角度和一个景别：
    * **主体**: 少女, 年轻女性, 情侣
    * **机位角度**: 俯视, 仰视, 平视, 侧面
    * **景别**: 脸部特写, 半身肖像, 全身

3.  **随机设定场景与光线**：随机选择一个场景和一个光线类型，确保二者搭配合理：
    * **场景**: 阳光明媚的室外, 简约干净的室内, 夜晚的城市街道, 咖啡馆窗边, 海边, 艺术展厅, 隔着有水汽的玻璃
    * **光线**: 自然柔和的阳光, 戏剧性的侧光勾勒轮廓, 昏暗环境中的一束聚光, 水波反射的晃动光斑, 闪光灯直射的快照感

4.  **随机添加氛围与细节**：随机选择2-3个能增强画面故事性和动态感的细节：
    * **情绪/神态**: 自然松弛, 眼神直视镜头, 高冷魅惑, 温柔低垂, 忧郁安静
    * **动态细节**: 头发被微风吹动, 发丝湿漉漉地贴在脸颊, 手指与环境/物体互动, 画面有动态模糊或轻微晃动感
    * **质感/特效**: 胶片颗粒感, 镜头噪点, 漂浮的粒子, 皮肤上的水珠或微光

5.  **随机确定画面比例**：从以下常用比例中随机选择一个：
    * 3:4
    * 4:3
    * 9:16
    * 16:9

6.  **组合并润色**：将以上步骤选择的元素有机地组合成一段通顺、生动、描述性强的提示词文本。确保语言表达流畅，能够激发创作灵感。

7.  **添加强制性结尾**：在生成提示词的末尾，必须一字不差地加上固定后缀。

# 约束条件（Constraints）
1.  生成的风格必须是大众容易接受的真人写真风格，严禁生成二次元、油画、赛博朋克、哥特等小众或非写实艺术风格。
2.  生成的内容必须健康、积极，不包含任何敏感或不适宜的信息。
3.  最终输出的必须是完整的一段提示词，不能分点或分段。
4.  必须在提示词的末尾添加：“【不改变人脸比例和形象，保留人物原貌，原比例！原比例！原比例！】”。这是强制要求，必须包含。
5.  每次生成的提示词都应具有独特性和随机性，避免重复。

# 响应格式（Response Format）
直接输出最终生成的摄影风格提示词文本，不要包含任何额外的前言、标题、解释或说明。

# 示例和指导（Examples and Guidance）
* **高质量范例1 (细腻质感风):** 采用细腻皮肤真实质感的风格，画面中展现了一个少女的脸部特写，通过略微俯视的镜头角度进行呈现。背景营造出清醒系且阳光的场景氛围，少女有着散乱的头发随风飘动，眼神闪闪发光，其中带着阳光和魅惑的情绪，尽显高冷气质。画面着重勾勒了少女的面部细节，高光处理十分讲究，同时画面呈现出带有摄影机噪点的画质，并且有着蓝白色通透效果。比例3:4。【不改变人脸比例和形象，原比例！原比例！原比例！】
* **高质量范例2 (时尚人像风):** 水后时尚人像，面部大特写，极近距离拍摄，眼神直视镜头，神态自然松弛，清透水感妆容。人物和数尾迷你热带小鱼在鱼缸前景缓缓穿梭，尾鳍透明灵动。水面折射出晃动光纹，碎光斑点在脸庞跳跃，水下漂浮粒子环绕。整体氛围梦幻安静，棕黑色系暗调，高级感浓厚，漂浮失焦、动态模糊与细腻胶片颗粒交错。比例9:16。【不改变人脸比例和形象，原比例！原比例！原比例！】
* **高质量范例3 (快照抓拍风):** 看起来像用拍立得相机偶然拍到的漫不经心的情侣快照。照片要有轻微的晃动感，暗处照相机闪光灯发出的照明扩散到整个照片上。男生女生脸贴脸亲密地看着镜头，前置摄像头的自拍视角。照片不能太清晰，要有胶片拍立得的质感。比例4:3。【不改变人脸比例和形象，原比例！原比例！原比例！】
`.trim();

const PHOTO_PORTRAIT_V2_PROMPT = `
# 角色设定（Role Definition）
你是一位顶尖的商业摄影师与视觉艺术家，拥有敏锐的时尚洞察力和丰富的人像摄影经验。你擅长捕捉人物的真实情感与状态，并能创造出既符合大众审美又具有独特风格的视觉作品。你精通光影、构图、色彩和质感的运用，能够将抽象的氛围和情绪转化为具体的、可执行的摄影风格描述。
# 任务描述（Task Specification）
你的任务是根据用户的需求，随机创造出多种独特、鲜明、且易于被大众接受的真人写真摄影风格。这些风格描述将作为AI绘画的提示词，需要足够详细、具体、富有画面感，能够引导AI生成高质量、令人眼前一亮的摄影作品。
# 任务步骤（Task Steps）
构思核心场景/情绪 (Core Scene/Emotion)：首先，随机选择一个生活化的场景或一种特定的情绪作为风格的基石。例如：“清晨窗边的慵懒”、“都市夜游的疏离感”、“夏日午后的宁静”、“与宠物互动的温馨一刻”。
确定摄影基调 (Photographic Tone)：从以下主流摄影类型中随机选择一种或两种进行融合，作为整体风格的基调：
日系清新风 (Japanese Fresh Style)：特点是高明度、低饱和度、柔和的光线、干净的画面。
随性抓拍风 (Candid Snapshot Style)：模仿不经意间拍下的瞬间，带有轻微的动态模糊、不完美的构图、真实的生活气息。
时尚杂志风 (Fashion Editorial Style)：强调高级感、清晰的面部轮廓、精致的妆容、富有表现力的姿势和眼神。
电影故事感 (Cinematic Style)：通过特殊的光影（如伦勃朗光、霓虹光）、环境叙事和人物情绪，营造出仿佛电影截图般的氛围。
设计光影与色彩 (Lighting & Color)：随机组合光线类型、方向和色彩方案，这是风格的灵魂。
光线类型：柔和的散射光、硬朗的直射光、傍晚的黄金一小时光、透过百叶窗的光束、水面的反射光等。
色彩方案：整体偏向某种色调（如冷调蓝白、暖调橘棕、低饱和度的莫兰迪色系），并决定对比度的高低。
设定构图与视角 (Composition & Angle)：随机选择一种构图方式来突出主体。
视角：正面、侧面、45度角、俯拍、仰拍。
景别：面部特写、半身像、全身像。
构图：中心构图、三分法构图、引导线构图。
描绘质感与细节 (Texture & Details)：为画面增加决定性的细节和质感，使其与众不同。
皮肤质感：细腻通透的、带有微汗水光的、有雀斑的自然皮肤。
环境/道具细节：空气中的微尘、镜头上的光晕、湿润发丝的细节、衣服的褶皱。
后期质感：添加轻微的胶片颗粒、锐化或柔焦效果。
整合并输出：将以上步骤中随机选择的元素有机地组合成一段通顺、生动、富有感染力的文字描述。确保语言精炼，关键词明确，便于AI理解和执行。
# 约束条件（Constraints）
生成的风格必须是“真人写真”风格，避免生成任何形式的动漫、插画或3D渲染风格。
风格必须新颖且符合大众审美，避免使用过于小众、怪异或已经被滥用的固定风格模板（例如，赛博朋克、哥特幻想、蒸汽朋克等）。
描述应聚焦于氛围、光影、质感、色彩和构图，而不是具体的服装或人物身份。
最终输出的风格描述应是一段完整的文本，不包含步骤拆解或任何额外的解释性文字。
生成的每一种风格都应有其独特的记忆点，避免与其他风格高度雷同。
# 响应格式（Response Format）
直接输出最终生成的摄影风格文字描述，将整段描述包裹在一个代码块中。
# 示例和指导（Examples and Guidance）
示例1 (日系清新 + 随性抓拍):
日系空气感抓拍风格。在一个洒满午后阳光的房间里，采用略微过曝的曝光，营造轻盈通透的氛围。人物侧对镜头，视线望向窗外，仿佛被某物吸引的瞬间被捕捉下来。光线穿过轻薄的白色窗帘，在人物脸上形成柔和的光斑，发丝边缘呈现出金色的轮廓光。画面整体色调偏向淡雅的青蓝色，饱和度较低，强调皮肤的白皙通透感。带有轻微的镜头光晕和空气中的粉尘感，呈现出一种不经意的、温暖而恬静的美。
示例2 (时尚杂志 + 电影故事感):
暗调情绪时尚人像风格。主体位于画面一侧，采用大光圈拍摄，背景被虚化成模糊的光斑。一束精准的戏剧性顶光从斜上方打下，仅照亮人物的半边脸、肩膀和手臂，形成强烈的光影对比（契亚拉斯库罗光影法）。面部表情冷静而疏离，眼神直视镜头，充满故事感。环境色调为浓郁的墨绿或深蓝色，皮肤在暗调背景的映衬下质感细腻，高光部分清晰锐利。画面带有细腻的电影胶片颗粒，营造出一种高级、神秘且宁静的氛围。
`.trim();

const CUTIE_3D_STYLE_PROMPT = `
请将主体生成或重绘为 cutie style 的极简 3D 插画。用户可以在这里补充具体主体：一个可爱、圆润、质感柔和的【主体】。

{
  "art_style_profile": {
    "style_name": "Minimalist 3D Illustration",
    "visual_elements": {
      "shape_language": "Soft, rounded, chunky geometry with simplified contours and no sharp edges. Emphasis on friendly, tactile forms.",
      "colors": {
        "primary_palette": "Material-based natural tones (e.g., metallic silver, wooden brown, sky blue, ceramic white). When native material is vibrant, reduce saturation moderately for visual balance.",
        "accent_colors": "Used sparingly to highlight functional or interactive parts (e.g., buttons, handles, lids) — often in warm tones like orange, amber, or rust red.",
        "shading": "Smooth gradients with soft falloff, subtly defining form and volume without strong contrast.",
        "supplementary_colors": "Soft neutral hues (e.g., light beige, cool gray, cream) used for secondary elements to preserve focus on the main form."
      },
      "lighting": {
        "type": "Diffuse ambient light for overall clarity and soft dimensionality",
        "source_direction": "Top-right angled light source to gently model volume",
        "shadow_style": "Soft, elliptical shadows under object, low opacity to maintain lightness and spatial separation"
      },
      "materials": {
        "surface_texture": {
          "General": "Matte or lightly satin for a soft tactile look; minimal texture detail, but distinct material feel (e.g., metallic luster, glass clarity, wood grain hue)",
          "Glass": "Translucent with soft internal glow and diffused refraction at edges",
          "Metal": "Brushed or anodized look with subtle gradient highlights, no mirror reflections"
        },
        "reflectivity": "Low to medium depending on material — minimal gloss, no harsh highlights, always soft-edged"
      },
      "composition": {
        "object_presentation": "Single object centered with generous white space around it, floating or subtly grounded",
        "perspective": "Three-quarter top-side view to give depth and silhouette clarity",
        "background": "Solid neutral tone (e.g., warm gray, off-white, pale sand) — unobtrusive and harmonizing with object tones"
      },
      "typography": {
        "font_style": "Minimal geometric sans-serif (e.g., Inter, Helvetica Neue Light)",
        "text_placement": "Bottom-left corner, small size",
        "color": "Soft gray, blending subtly with the background for minimal visual interference"
      },
      "rendering_style": {
        "technique": "Clean 3D render with soft ambient occlusion and simplified geometry, no texture mapping",
        "detail_level": "Moderate — emphasizing form and color fidelity over micro-details",
        "consistency_rule": "All elements must share the same aesthetic: smooth edges, low-contrast shadows, material-faithful coloring, and a calming visual tone"
      }
    },
    "purpose": "To create clean, emotionally warm 3D visuals that feel natural yet simplified — ideal for tech, product design, lifestyle branding, and modern UI systems. It balances realism and minimalism for visual clarity and user-friendly tone."
  }
}
`.trim();

const XIAOHONGSHU_POSTER_PROMPT = `
你是一个专业的视觉提示词设计助手，帮助用户生成“小红书风格”的图片提示词。请严格按照以下流程工作：

第1步：先询问用户以下问题，并记录答案（中英文都可以）：
1. 你希望海报的布局是竖直还是横向？（vertical or horizontal）
2. 海报的主题领域是什么？比如：城市旅行、美食探索、自然风光、周末闲逛等。
3. 你喜欢哪种拼接风格？例如：手帐风、贴纸风、杂志感、拼贴风。
4. 边框或标签颜色你更喜欢哪种？例如：粉色、亮黄、草绿色、天蓝色。
5. 这张图的使用时间范围是什么？例如：3.25 ~ 5.15。

第2步：根据用户输入填写以下模板，并输出完整 JSON。
- 如果布局选择 vertical 或竖直，则 "aspect_ratio" 为 "3:4"。
- 如果布局选择 horizontal 或横向，则 "aspect_ratio" 为 "4:3"。
- 只输出 JSON，不要输出额外解释。

模板如下，请替换大括号内内容：

{
  "prompt": "A vibrant and playful collage-style poster in a {orientation} layout, themed around {content_area}, featuring a mix of photos, stickers, and hand-drawn elements. The design includes cut-out photos of relevant scenes, speech bubbles, and colorful labels with border colors in {label_color}. The style resembles social media visuals from Xiaohongshu, with a {collage_style} look. Includes both Chinese and English text, such as '城市达人计划' and 'City Guide'.",
  "style": "{collage_style}, pastel color palette, vibrant and cheerful",
  "elements": [
    "speech bubbles",
    "hand-drawn arrows",
    "photo-style stickers (relevant to {content_area})",
    "gradient background",
    "Chinese and English text mixed"
  ],
  "color_scheme": "pastel colors (green, pink, yellow, sky blue, plus {label_color})",
  "composition": "center-aligned main title, scattered photos with decorative borders, dynamic and asymmetrical layout",
  "aspect_ratio": "{aspect_ratio}",
  "additional_notes": "Designed like a Xiaohongshu (Little Red Book) campaign poster, aimed at a young, urban audience exploring {content_area} from {start_date} to {end_date}."
}
`.trim();

const HANDWRITTEN_NOTES_PROMPT = `
Create concise, visually structured notes on the topic "{{topic}}". Notes must fit clearly within a {{orientation}} layout (horizontal/vertical), featuring:

- Moderate Font Size: Comfortable readability.
- Clear Structure:
  - Main points highlighted with "background colors" or "wavy underlines~".
  - Regular notes in standard ink.
  - Emphasis notes in a different ink color.
- Illustrations:
  - Include relevant sketches or hand-drawn style illustrations.
  - Allow fountain pen-style doodles or annotations directly on illustrations.
- Annotations:
  - Simulate notes, corrections, and additional quirky doodles resembling spontaneous annotations, using marker pen style.
  - Incorporate collage-style photo extracts relevant to the topic, annotated or doodled upon.
- Language Text Accuracy Constraint (Strict):
   - When generating text in "{{language}}", abide by recognized dictionaries and standard grammar rules.
   - For languages like 中文 (Chinese) or others with complex scripts:
     - Ensure each character or symbol is correct, standard, and used appropriately.
     - Double-check stroke order, avoid non-existent variants, and verify usage before finalizing the notes.

User Settings (to be defined before image generation):
- Topic: User-defined.
- Orientation: Horizontal or Vertical.
- Language: English/中文 or any chosen language.
- Color Scheme: Main notes, emphasis notes, highlight style.
- Illustration Style: Detailed hand-drawn, minimalist sketches, or annotated magazine/photo cut-outs.

Once parameters are set, generate notes in the chosen language adhering strictly to the selected formatting and visual guidelines.
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
  {
    id: "natural-beauty",
    title: "自然美颜精修",
    description: "保留本人五官 + 轻度肤质优化",
    prompt: NATURAL_BEAUTY_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: Sparkles,
  },
  {
    id: "photo-portrait-v1",
    title: "写真随机风格 V1",
    description: "随机组合真人写真提示词",
    prompt: PHOTO_PORTRAIT_V1_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: Aperture,
  },
  {
    id: "photo-portrait-v2",
    title: "写真随机风格 V2",
    description: "商业摄影感真人写真描述",
    prompt: PHOTO_PORTRAIT_V2_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: Clapperboard,
  },
  {
    id: "cutie-3d-style",
    title: "3D Cutie 风格",
    description: "圆润软萌 + 极简3D插画",
    prompt: CUTIE_3D_STYLE_PROMPT,
    mode: "generate",
    imageSize: "1:1",
    imageCount: "1",
    icon: Box,
  },
  {
    id: "xiaohongshu-poster",
    title: "小红书风格海报",
    description: "先问参数 + 输出海报 JSON",
    prompt: XIAOHONGSHU_POSTER_PROMPT,
    mode: "generate",
    imageSize: "3:4",
    imageCount: "1",
    icon: Newspaper,
  },
  {
    id: "handwritten-notes",
    title: "手写笔记风格",
    description: "结构化笔记 + 手绘批注",
    prompt: HANDWRITTEN_NOTES_PROMPT,
    mode: "generate",
    imageCount: "1",
    icon: NotebookPen,
  },
  {
    id: "photo-enhance",
    title: "照片质感优化",
    description: "曝光色彩 + 清晰度整体增强",
    prompt: PHOTO_ENHANCE_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: Camera,
  },
  {
    id: "backlight-repair",
    title: "暗光逆光修复",
    description: "自然补光 + 高光阴影恢复",
    prompt: BACKLIGHT_REPAIR_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: SunMedium,
  },
  {
    id: "detail-restore",
    title: "高清细节修复",
    description: "去糊去噪 + 保留真实纹理",
    prompt: DETAIL_RESTORE_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: WandSparkles,
  },
];

type PromptPickerItem = Omit<PromptLibraryItem, "id"> & { id?: string };

const promptIconMap: Record<string, LucideIcon> = {
  aperture: Aperture,
  box: Box,
  camera: Camera,
  clapperboard: Clapperboard,
  glasses: Glasses,
  newspaper: Newspaper,
  "notebook-pen": NotebookPen,
  scissors: Scissors,
  sparkles: Sparkles,
  "sun-medium": SunMedium,
  "wand-sparkles": WandSparkles,
};

const defaultPromptIconById: Record<string, string> = {
  glasses: "glasses",
  hairstyle: "scissors",
  "natural-beauty": "sparkles",
  "photo-portrait-v1": "aperture",
  "photo-portrait-v2": "clapperboard",
  "cutie-3d-style": "box",
  "xiaohongshu-poster": "newspaper",
  "handwritten-notes": "notebook-pen",
  "photo-enhance": "camera",
  "backlight-repair": "sun-medium",
  "detail-restore": "wand-sparkles",
};

const defaultPromptItems: PromptPickerItem[] = promptPresetOptions.map((preset, index) => ({
  id: preset.id,
  title: preset.title,
  description: preset.description,
  prompt: preset.prompt,
  mode: preset.mode,
  image_size: preset.imageSize || "",
  image_count: preset.imageCount || "",
  icon: defaultPromptIconById[preset.id],
  quick_access: index < QUICK_PROMPT_COUNT,
  sort_order: (index + 1) * 10,
  category: "内置快捷",
}));

type BananaPromptStatus = "idle" | "loading" | "success" | "error";

function normalizePromptMode(value?: string): ImageConversationMode {
  const normalized = (value || "").toLowerCase();
  if (["edit", "image", "image-to-image", "i2i", "图生图"].includes(normalized)) {
    return "edit";
  }
  return "generate";
}

function getPromptModeLabel(value?: string) {
  return normalizePromptMode(value) === "edit" ? "图生图" : "文生图";
}

function summarizeBananaPrompt(item: PromptPickerItem) {
  const cleaned = item.prompt
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_`>\-[\]{}()【】「」]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const firstSentence =
    cleaned
      .split(/(?<=[。！？.!?])\s+/)
      .find((sentence) => sentence.length >= 10)
      ?.trim() || cleaned;

  if (!firstSentence) {
    return item.sub_category ? `${item.sub_category}类提示词，可一键填入当前输入框。` : "可一键填入当前输入框的创作提示词。";
  }

  return firstSentence.length > 86 ? `${firstSentence.slice(0, 86)}...` : firstSentence;
}

function getPromptCategoryLabel(item: PromptPickerItem) {
  return [item.category, item.sub_category].filter(Boolean).join(" / ") || "未分类";
}

function getBananaPromptPreviewUrl(item: PromptPickerItem) {
  const candidate = item.preview || item.reference_image_urls?.[0];
  if (!candidate) {
    return "";
  }
  if (candidate.startsWith("/")) {
    return resolveApiAssetUrl(candidate);
  }

  try {
    const url = new URL(candidate);
    const jsDelivrPrefix = "/gh/glidea/banana-prompt-quicker@main/";
    if (url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith(jsDelivrPrefix)) {
      return resolveApiAssetUrl(`${BANANA_PROMPTS_ASSET_BASE_URL}${url.pathname.slice(jsDelivrPrefix.length)}`);
    }
    if (url.hostname === "raw.githubusercontent.com" && url.pathname.startsWith("/glidea/banana-prompt-quicker/main/")) {
      return resolveApiAssetUrl(`${BANANA_PROMPTS_ASSET_BASE_URL}${url.pathname.slice("/glidea/banana-prompt-quicker/main/".length)}`);
    }
    return resolveApiAssetUrl(candidate);
  } catch {
    return resolveApiAssetUrl(`${BANANA_PROMPTS_ASSET_BASE_URL}${candidate.replace(/^\.?\//, "")}`);
  }
}

function normalizeBananaPromptsPayload(payload: unknown) {
  const maybeItems = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "prompts" in payload && Array.isArray((payload as { prompts: unknown }).prompts)
      ? (payload as { prompts: unknown[] }).prompts
      : [];

  return maybeItems.filter(isBananaPromptItem);
}

function getPromptItemKey(item: PromptPickerItem, index = 0) {
  return item.id || `${item.title}-${item.created || item.prompt.slice(0, 32)}-${index}`;
}

function getPromptIdentityKey(item: PromptPickerItem) {
  return item.id || `${item.title}-${item.prompt}`;
}

function getPromptSortOrder(item: PromptPickerItem, index: number) {
  return typeof item.sort_order === "number" ? item.sort_order : 10000 + index;
}

function mergePromptItems(primaryItems: PromptPickerItem[], secondaryItems: PromptPickerItem[]) {
  const secondaryById = new Map(secondaryItems.filter((item) => item.id).map((item) => [item.id, item]));
  const merged = primaryItems.map((item) => (item.id && secondaryById.has(item.id) ? secondaryById.get(item.id)! : item));
  const seen = new Set(merged.map(getPromptIdentityKey));
  secondaryItems.forEach((item) => {
    const key = getPromptIdentityKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  });
  return merged;
}

function uniquePromptItems(items: PromptPickerItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getPromptIdentityKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sortPromptItems(items: PromptPickerItem[]) {
  return [...items].sort((a, b) => getPromptSortOrder(a, 0) - getPromptSortOrder(b, 0));
}

function getPromptIcon(item: PromptPickerItem) {
  const iconKey = item.icon || (item.id ? defaultPromptIconById[item.id] : "");
  return promptIconMap[iconKey || ""] || Images;
}

function getPromptDescription(item: PromptPickerItem) {
  return item.description || summarizeBananaPrompt(item);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("提示词管理接口响应超时")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function isBananaPromptItem(value: unknown): value is PromptPickerItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<PromptPickerItem>;
  return typeof item.title === "string" && typeof item.prompt === "string";
}

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
  const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
  const [bananaPromptStatus, setBananaPromptStatus] = useState<BananaPromptStatus>("idle");
  const [bananaPromptError, setBananaPromptError] = useState("");
  const [bananaPrompts, setBananaPrompts] = useState<PromptPickerItem[]>(defaultPromptItems);
  const [bananaPromptQuery, setBananaPromptQuery] = useState("");
  const [bananaPromptCategory, setBananaPromptCategory] = useState("全部");
  const [bananaPromptRetryKey, setBananaPromptRetryKey] = useState(0);
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
  const quickPromptItems = useMemo(() => {
    const selected = sortPromptItems(bananaPrompts.filter((item) => item.quick_access)).slice(0, QUICK_PROMPT_COUNT);
    if (selected.length >= QUICK_PROMPT_COUNT) {
      return selected;
    }
    const selectedIds = new Set(selected.map((item) => item.id).filter(Boolean));
    const fallbackItems = defaultPromptItems
      .filter((item) => item.quick_access && (!item.id || !selectedIds.has(item.id)))
      .slice(0, QUICK_PROMPT_COUNT - selected.length);
    return [...selected, ...fallbackItems];
  }, [bananaPrompts]);
  const morePromptItems = useMemo(
    () => uniquePromptItems([...quickPromptItems, ...bananaPrompts]),
    [bananaPrompts, quickPromptItems],
  );
  const activePresetId = quickPromptItems.find((item) => item.prompt === prompt)?.id;
  const bananaPromptCategories = useMemo(() => {
    const categories = Array.from(new Set(morePromptItems.map(getPromptCategoryLabel))).sort((a, b) => a.localeCompare(b, "zh-CN"));
    return ["全部", ...categories];
  }, [morePromptItems]);
  const filteredBananaPrompts = useMemo(() => {
    const query = bananaPromptQuery.trim().toLowerCase();
    return morePromptItems.filter((item) => {
      const categoryLabel = getPromptCategoryLabel(item);
      const matchesCategory = bananaPromptCategory === "全部" || categoryLabel === bananaPromptCategory;
      if (!matchesCategory) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [item.title, item.description, item.prompt, item.category, item.sub_category, item.author]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [bananaPromptCategory, bananaPromptQuery, morePromptItems]);

  const handleBananaPromptSelect = (item: PromptPickerItem) => {
    onModeChange(normalizePromptMode(item.mode));
    onPromptChange(item.prompt);
    if (item.image_size) {
      onImageSizeChange(item.image_size);
    }
    if (item.image_count) {
      onImageCountChange(item.image_count);
    }
    setIsPromptLibraryOpen(false);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleClearPrompt = () => {
    onPromptChange("");
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  useEffect(() => {
    const controller = new AbortController();
    const loadBananaPrompts = async () => {
      setBananaPromptStatus("loading");
      setBananaPromptError("");
      try {
        let items: PromptPickerItem[] = [];
        let apiErrorMessage = "";
        try {
          const payload = await withTimeout(fetchPromptLibrary(), PROMPT_LIBRARY_API_TIMEOUT_MS);
          items = normalizeBananaPromptsPayload(payload);
        } catch (error) {
          apiErrorMessage = error instanceof Error ? error.message : "";
          items = [];
        }
        if (items.length === 0) {
          const response = await fetch(BANANA_PROMPTS_URL, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!response.ok) {
            throw new Error(`本地资源返回 ${response.status}`);
          }
          items = normalizeBananaPromptsPayload(await response.json());
        }
        if (items.length === 0) {
          throw new Error("未读取到可用提示词");
        }
        setBananaPrompts(sortPromptItems(mergePromptItems(defaultPromptItems, items)));
        setBananaPromptError(apiErrorMessage);
        setBananaPromptStatus("success");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : "提示词加载失败";
        setBananaPromptError(message);
        setBananaPrompts(defaultPromptItems);
        setBananaPromptStatus("error");
      }
    };

    void loadBananaPrompts();
    return () => {
      controller.abort();
    };
  }, [bananaPromptRetryKey]);

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-rose-100/70 px-4 py-4">
        <div className="text-base font-bold text-stone-950">Prompt 创作台</div>
        <div className="mt-1 text-sm text-stone-500">图像生成 · 参考图编辑</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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

        <div className="mb-4 grid grid-cols-2 gap-2">
          <ModeButton active={mode === "generate"} onClick={() => onModeChange("generate")}>
            文生图
          </ModeButton>
          <ModeButton active={mode === "edit"} onClick={() => onModeChange("edit")}>
            图生图
          </ModeButton>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-white/45 p-3">
          <div>
            <div className="text-xs text-stone-500">模型</div>
            <div className="mt-1 text-sm font-bold text-stone-950">gpt-image-2</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">生成张数</div>
            <div className="mt-1 text-sm font-bold text-stone-950">{Math.max(1, Math.min(10, Number(imageCount) || 1))} / 最多 10</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">剩余额度</div>
            <div className="mt-1 text-sm font-bold text-stone-950">{availableQuota}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">活动任务</div>
            <div className="mt-1 text-sm font-bold text-stone-950">{activeTaskCount} 个处理中</div>
          </div>
        </div>

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
                  className="group size-16 overflow-hidden rounded-lg border border-rose-100 bg-rose-50/70 transition hover:border-rose-200"
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
                  className="absolute -top-1 -right-1 inline-flex size-5 items-center justify-center rounded-full border border-rose-100 bg-white text-stone-500 transition hover:border-rose-200 hover:text-rose-600"
                  aria-label={`移除参考图 ${image.name || index + 1}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mb-3 space-y-2 px-1">
          <div className="grid grid-cols-2 gap-2">
            {quickPromptItems.map((item, index) => {
              const active = item.id === activePresetId;
              const PresetIcon = getPromptIcon(item);
              return (
                <button
                  key={getPromptItemKey(item, index)}
                  type="button"
                  onClick={() => handleBananaPromptSelect(item)}
                  className={cn(
                    "flex min-h-14 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition",
                    active
                      ? "border-rose-100 bg-[#2d1d26] text-white shadow-sm"
                      : "border-rose-100 bg-white/72 text-stone-800 hover:border-rose-200 hover:bg-white",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
                      active ? "bg-white/15 text-white" : "bg-rose-50 text-rose-500",
                    )}
                  >
                    <PresetIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.title}</span>
                    <span className={cn("mt-0.5 block truncate text-xs", active ? "text-white/70" : "text-stone-500")}>
                      {getPromptDescription(item)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleClearPrompt}
              disabled={!prompt}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-100 bg-white/75 px-3 text-sm font-medium text-stone-700 transition hover:border-rose-200 hover:bg-white disabled:cursor-not-allowed disabled:border-stone-100 disabled:bg-stone-50 disabled:text-stone-300"
            >
              <X className="size-4" />
              清空提示词
            </button>
            <button
              type="button"
              onClick={() => setIsPromptLibraryOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-100 bg-white/75 px-3 text-sm font-medium text-stone-700 transition hover:border-rose-200 hover:bg-white"
            >
              <Images className="size-4" />
              更多提示词
            </button>
          </div>
        </div>

        <Dialog open={isPromptLibraryOpen} onOpenChange={setIsPromptLibraryOpen}>
          <DialogContent className="flex h-[84vh] w-[min(94vw,1040px)] max-w-none flex-col overflow-hidden rounded-lg p-0">
            <DialogHeader className="border-b border-rose-100 px-5 pt-5 pb-4 sm:px-6">
              <div className="flex flex-col gap-3 pr-10 sm:flex-row sm:items-start sm:justify-between sm:pr-12">
                <div className="min-w-0">
                  <DialogTitle className="text-xl font-semibold text-stone-950">更多提示词</DialogTitle>
                  <DialogDescription className="mt-2 leading-6 text-stone-500">
                    包含当前三个快捷提示词{morePromptItems.length > 0 ? `，已加载 ${morePromptItems.length} 条` : ""}
                    ，点击使用会填入提示词并自动切换文生图或图生图模式。
                  </DialogDescription>
                </div>
                <Button
                  type="button"
                  asChild
                  variant="outline"
                  className="h-9 shrink-0 rounded-lg border-rose-100 bg-white/75 text-stone-700"
                >
                  <a href="/prompt-manager">
                    <ExternalLink className="size-4" />
                    管理提示词
                  </a>
                </Button>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                  <Input
                    value={bananaPromptQuery}
                    onChange={(event) => setBananaPromptQuery(event.target.value)}
                    placeholder="搜索标题、作者、分类或提示词内容"
                    className="h-10 rounded-lg border-rose-100 bg-white/70 pl-9 text-sm shadow-none focus-visible:bg-white"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {bananaPromptCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setBananaPromptCategory(category)}
                      className={cn(
                        "h-9 shrink-0 rounded-lg border px-3 text-xs font-medium transition",
                        category === bananaPromptCategory
                          ? "border-rose-100 bg-[#2d1d26] text-white"
                          : "border-rose-100 bg-white/75 text-stone-600 hover:border-rose-200 hover:text-stone-900",
                      )}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto bg-rose-50/35 px-4 py-4 sm:px-6">
              {bananaPromptStatus === "loading" || bananaPromptStatus === "idle" ? (
                <div className="flex h-full min-h-[260px] items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-stone-500">
                    <LoaderCircle className="size-4 animate-spin" />
                    正在读取提示词库
                  </div>
                </div>
              ) : bananaPromptStatus === "error" ? (
                <div className="flex h-full min-h-[260px] items-center justify-center text-center">
                  <div className="max-w-sm">
                    <div className="text-base font-semibold text-stone-900">提示词库加载失败</div>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{bananaPromptError || "请稍后重试。"}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 rounded-lg border-rose-100 bg-white"
                      onClick={() => {
                        setBananaPromptStatus("idle");
                        setBananaPromptRetryKey((key) => key + 1);
                      }}
                    >
                      重新加载
                    </Button>
                  </div>
                </div>
              ) : filteredBananaPrompts.length === 0 ? (
                <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-stone-500">
                  没有匹配的提示词
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {filteredBananaPrompts.map((item, index) => {
                    const previewUrl = getBananaPromptPreviewUrl(item);
                    return (
                      <article
                        key={`${item.title}-${item.created || index}`}
                        className="overflow-hidden rounded-lg border border-rose-100 bg-white/85 shadow-sm"
                      >
                        <div className="aspect-[4/3] bg-stone-100">
                          {previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={`${item.title} 示例图`}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-stone-400">
                              <Images className="size-8" />
                            </div>
                          )}
                        </div>
                        <div className="flex min-h-[214px] flex-col gap-3 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={normalizePromptMode(item.mode) === "edit" ? "info" : "success"}>
                              {getPromptModeLabel(item.mode)}
                            </Badge>
                            <Badge variant="outline">{getPromptCategoryLabel(item)}</Badge>
                          </div>
                          <div className="min-w-0">
                            <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-stone-950">
                              {item.title}
                            </h3>
                            <p className="mt-2 line-clamp-3 text-xs leading-5 text-stone-500">
                              {getPromptDescription(item)}
                            </p>
                          </div>
                          <div className="mt-auto flex items-center justify-between gap-3">
                            <div className="min-w-0 truncate text-xs text-stone-400">
                              {item.author ? `作者 ${item.author}` : "提示词管理"}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                            className="h-8 shrink-0 rounded-lg text-white"
                              onClick={() => handleBananaPromptSelect(item)}
                            >
                              使用
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <div className="yan-panel-strong rounded-lg">
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
              className="min-h-[170px] resize-none rounded-lg border-0 bg-transparent px-4 pt-4 pb-4 text-[15px] leading-7 text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0"
            />

            <div className="border-t border-rose-100 bg-white/80 px-3 py-3">
              <div className="flex flex-col gap-3">
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                  {mode === "edit" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="col-span-2 h-10 rounded-lg border-rose-100 bg-white/85 px-3 text-sm font-medium text-stone-700 shadow-none"
                      onClick={onPickReferenceImage}
                    >
                      <ImagePlus className="size-4" />
                      <span>{referenceImages.length > 0 ? "继续添加参考图" : "上传参考图"}</span>
                    </Button>
                  )}
                  <div className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-50 px-3 text-xs font-medium text-stone-600">
                    <span className="mr-1">额度</span>{availableQuota}
                  </div>
                  {activeTaskCount > 0 && (
                    <div className="col-span-2 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-3 text-xs font-medium text-amber-700">
                      <LoaderCircle className="size-3 animate-spin" />
                      {activeTaskCount}<span> 个任务处理中</span>
                    </div>
                  )}
                  <div className="flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-100 bg-white/85 px-3">
                    <span className="text-sm font-medium text-stone-700">张数</span>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      step="1"
                      value={imageCount}
                      onChange={(event) => onImageCountChange(event.target.value)}
                      className="h-7 w-[44px] border-0 bg-transparent px-0 text-center text-sm font-medium text-stone-700 shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <div
                    ref={sizeMenuRef}
                    className="relative col-span-2 flex h-9 items-center gap-2 rounded-lg border border-rose-100 bg-white/85 px-3 text-sm"
                  >
                    <span className="font-medium text-stone-700">比例</span>
                    <button
                      type="button"
                      className="flex h-7 min-w-0 flex-1 items-center justify-between bg-transparent text-left text-sm font-bold text-stone-700"
                      onClick={() => setIsSizeMenuOpen((open) => !open)}
                    >
                      <span className="truncate">{imageSizeLabel}</span>
                      <ChevronDown className={cn("size-4 shrink-0 opacity-60 transition", isSizeMenuOpen && "rotate-180")} />
                    </button>
                    {isSizeMenuOpen ? (
                      <div className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-full overflow-hidden rounded-lg border border-white/80 bg-white p-2 shadow-[0_24px_80px_-32px_rgba(84,38,62,0.35)]">
                        {imageSizeOptions.map((option) => {
                          const active = option.value === imageSize;
                          return (
                            <button
                              key={option.label}
                              type="button"
                              className={cn(
                                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-stone-700 transition hover:bg-rose-50",
                                active && "bg-rose-50 font-medium text-stone-950",
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

                </div>

                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  disabled={!prompt.trim() || (mode === "edit" && referenceImages.length === 0)}
                  className="yan-gradient inline-flex h-11 w-full shrink-0 items-center justify-center rounded-lg text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:brightness-100"
                  aria-label={mode === "edit" ? "编辑图片" : "生成图片"}
                >
                  <ArrowUp className="size-4" />
                  <span>{mode === "edit" ? "编辑图片" : "生成图片"}</span>
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
        "rounded-lg px-2.5 py-1.5 text-xs font-medium transition sm:px-4 sm:py-2 sm:text-sm",
        active ? "bg-[#2d1d26] text-white" : "bg-rose-50 text-stone-600 hover:bg-rose-100",
      )}
    >
      {children}
    </button>
  );
}
