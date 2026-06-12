"use client";
import {
  ArrowUp,
  Aperture,
  Box,
  Camera,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  ExternalLink,
  Glasses,
  ImagePlus,
  Images,
  LoaderCircle,
  Newspaper,
  NotebookPen,
  Search,
  Share2,
  Scissors,
  Sparkles,
  SunMedium,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type RefObject } from "react";
import { toast } from "sonner";

import { ImageLightbox } from "@/components/image-lightbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPromptShare, fetchPromptLibrary, type PromptLibraryItem, type PromptLibraryPayload } from "@/lib/api";
import { resolveApiAssetUrl } from "@/lib/assets";
import type { ImageConversationMode } from "@/store/image-conversations";
import { cn } from "@/lib/utils";

const BANANA_PROMPTS_SNAPSHOT_VERSION = "2026-05-27-sfw";
const BANANA_PROMPTS_URL = `/banana-prompt-quicker/prompts.json?v=${BANANA_PROMPTS_SNAPSHOT_VERSION}`;
const BANANA_PROMPTS_ASSET_BASE_URL = "/banana-prompt-quicker/";
const PROMPT_LIBRARY_API_TIMEOUT_MS = 2200;
const QUICK_PROMPT_COUNT = 3;

const GLASSES_PROMPT = `
Not sure which style of glasses suits you?

1. Facial Feature Analysis:
"Facial Feature Analysis". Place the portrait in the center. Automatically analyze the face (do not use fixed or pre-written labels). Detect and annotate the face shape, eyes, eyebrows, nose, cheeks, and lips. Add thin arrows pointing to each feature. For each feature, provide a short label (e.g., "soft oval face", "almond eyes") and 2-3 brief bullet points describing the actual feature based on the image. Use small rounded info cards with simple icons.

2. Glasses Matching Guide:
"Glasses Matching Guide". Using the uploaded portrait (reproducing the facial features with 100% fidelity) as the subject, generate a clean, modern infographic poster. The style should be minimal, aesthetic, and visually driven, with clear typography, rounded cards, thin lines, subtle shadows, and a premium magazine feel. Title: "Glasses Matching Guide". Automatically analyze the face shape and proportions, then generate recommendations for suitable and unsuitable glasses. Use the same face to show side-by-side try-on comparisons.
`.trim();

const HAIRSTYLE_PROMPT = `
Not sure which hairstyle suits you?

Based on the front-facing photo uploaded by the user, generate a highly polished landscape 4:3 "AI Hairstyle Aesthetics Upgrade Report / Before-and-After Hairstyle Report". The user's own uploaded photo is the core reference for this generation. Strictly preserve the user's identity likeness, facial structure, face-shape proportions, apparent age, true skin contours, expression and temperament, and original outfit, so anyone can instantly recognize it is the same person. Focus this upgrade on hairstyle design, hair length, bangs treatment, layering, volume, graduated body, hair-end height, and hair color suggestions. Do not alter facial features, slim the face, airbrush or beautify the skin, change clothing, or rely on makeup for improvement. Design the layout as a personal hairstyle upgrade report that blends "fashion hair consultant template + magazine-style fashion advisor template + multi-option comparison + a humorous 'pitfalls to avoid' feel". It should be professional, clear, and well designed, with a light touch of "so these hairstyles really don't suit me" amusement that makes viewers smile — but never a parody, never unflattering, never a negative prank image.

[Overall Layout] Landscape 4:3 composition with a background of mostly white, off-white, and light gray, plus small amounts of light olive green, gray-blue, and soft red as functional accent colors. Do not copy the reference layout exactly; use a coordinated full-page matrix with clear hierarchy tailored to this person's styling. Structure the page as "large original look on the left + large recommended look on the right + best-choice recommendation zone in the lower middle + avoid-these zone at the bottom + hairstyle execution guide at the bottom". The overall visual should feel premium, keep sensible white space, and be information-rich without crowding.

[Title Area] Top main title: AI Hairstyle Aesthetics Upgrade Report. Subtitle: Before-and-After Hairstyle Report. Optional small auxiliary tags: HAIR RESET STYLE PROPOSAL / BEST CUT FOR YOU / Personal Hairstyle Upgrade.

[Central Visual] Left: large Before image of the original hairstyle — keep the user's current hairstyle as true to life as possible, including original length, natural volume, messiness, flatness against the scalp, bangs condition, hair-end condition, and overall energy. Do not secretly improve the original photo or make the "before" look already better. Right: large After image of the recommended hairstyle — still the same person, same face, same brightness, same clothing, and similar lighting and composition, with only the hairstyle upgraded. The new hairstyle should suit this person better: more energetic, more attractive, more face-flattering, more balanced, more effortlessly refined, and realistically achievable. Lean toward natural Korean style, clean cut, relaxed and stylish, low maintenance, everyday-friendly. No exaggerated punk spikes, no influencer-template hairstyles, no excessive slicked-back gel, no obvious dye or bleach, no stage looks.

[Recommended Hairstyle Optimization Direction] Automatically determine the most suitable hairstyle based on the person's real attributes, and note after the key recommendation:
1. More suitable bangs or forehead exposure ratio
2. More natural volume at the crown
3. Better-controlled head volume
4. Cleaner hair ends and layering
5. A more orderly visual sense of hair volume
6. A natural hair color better suited to skin tone and temperament
7. More balanced head-to-face proportions with a fresher look

[Professional Annotations] After adding refined numbered dots, thin arrows, and zoomed-in callouts on the main image, clearly mark these 6 key points:
01 Bangs: explain how the bangs, length, or forehead exposure flatters the features
02 Crown Volume: explain how crown volume boosts energy
03 Side Balance: explain how side volume flatters face width
04 Layers: explain how layering handles heaviness
05 Hair Ends: explain how cleaner, sharper ends add order
06 Hair Color: explain how a natural hair color improves overall clarity

[Mid-Page Info Bar: Key Features] Place a concise info bar near the large image using icons + short labels, not long paragraphs. Automatically analyze and display the person's current hairstyle baseline, for example:
- Face Shape
- Hair Density
- Hair Texture
- Natural Wave
- Forehead Ratio
- Current Length
- Styling Difficulty

[Best Options Recommendation Zone] Show 4 recommended hairstyle option cards with green check markers. Every option must be the same person, changing only the hairstyle — not the face shape or outfit. Each card shows one suitable hairstyle with a name and one advantage description. The recommendations should differ from one another but all stay reasonable: natural, realistic, achievable. For example:
- Soft Layer Cut: light and natural, flatters the face shape
- Korean Clean Style: sharp and fresh, everyday refinement
- Side Part Natural: adds maturity, looks neater
- Airy Texture: more airiness, less heaviness
Each card should make the viewer feel "this one works too, that one is also nice", creating clear comparison and a sense of choice.

[Less Flattering Zone] Show 3 not-recommended hairstyle options with red X markers. These should be instantly recognizable as slightly unsuitable, even a little funny, but with restraint: no parody, nothing absurd, never deliberately making the person ugly — only the contrast of "genuinely not a good fit". For example:
- Too flat against the scalp: widens the face, looks cramped
- Overly thick straight bangs: buries the features, looks stuffy
- Excessive slicked-back gel: ages the look, feels forced
- Too short or too sharp: too fierce, too harsh, unbalanced
These unsuitable options should look mildly amusing yet remain within realistic hairstyles — never exaggerated joke looks.

[Bottom Execution Guide] Add a practical hairstyle execution guide at the bottom, expressed clearly with sparse text:
1. Best hair length / recommended length
2. Trimming focus / styling priorities (bangs, sideburns, crown, ends, layers)
3. Styling method / daily routine (blow-dry, tousle for volume, light styling)
4. Maintenance Cycle / suggested upkeep interval
5. Best hair color / recommended colors
Show recommended colors as 3-4 natural swatches, e.g., natural black, dark brown, gray-brown, soft cool brown. Keep everything natural and understated — no high-saturation bleach or dye.

[Text Style] The whole image should rely on short labels, short headings, and short sentences — no long paragraphs. English-led text with small auxiliary tags. Text must not be garbled; avoid large amounts of meaningless filler. The overall feel should be a "personal face-and-hair demonstration" from a professional facial and hair consultant, with a touch of relaxed, classroom-style delivery.

[Visual Tone] The image should feel like a professional consultation, with a hint of a "pitfalls to avoid" report. The recommendation zone should make viewers think "these styles really do suit me", and the avoid zone should make them think "ha, that one really doesn't work" — yet the whole piece must stay clean, premium, attractive, and well designed, never lowbrow parody.

[Footer Fine Print] This image is an AI styling visual proposal for reference only. For actual styling advice, consult a professional hairstylist in person.

[Strictly Avoid] Do not change the user's identity, swap the face, alter facial features, airbrush the skin, change the outfit, or improve the look via makeup or clothing. Do not generate exaggerated hairstyles, punk spikes, anime looks, stage looks, excessive gel, or heavy bleach. Do not let the multiple hairstyle options look like different people. Do not copy the reference layout exactly. Do not imitate generic hairstyle collage images — instead produce a highly polished, professional, slightly heartfelt personal hairstyle upgrade report.
`.trim();

const NATURAL_BEAUTY_PROMPT = `
Apply a natural, realistic light beauty retouch to the uploaded portrait photo. The goal is a natural edit like one finished by a professional photographer, not an obvious filter or face-swap effect.

Strictly preserve the same person's identity likeness, facial structure, face-shape proportions, apparent age, hairstyle outline, expression, clothing, background, and original composition. Do not change the face shape, slim the face, or alter the shape of the eyes, nose, or lips. Do not make the person look unlike themselves.

Optimization focus:
1. Slightly even out skin tone; reduce dullness, redness, and oily shine. Remove only temporary blemishes, acne marks, caked powder, and obvious blotchiness.
2. Preserve real skin texture, pores, fine lines, and natural peach fuzz; avoid a plastic or waxy look and over-smoothing.
3. Subtly brighten the eyes and key facial areas while keeping natural highlights and shadows; do not create an exaggerated makeup look.
4. Make the lips, eyebrows, eyelashes, and hair strands cleaner and crisper, but do not redraw facial features or add heavy makeup.
5. Improve overall white balance, exposure, contrast, and skin tone so the photo looks more luminous, clean, and natural.

Output result: real photography, portrait retouching, natural skin texture, clean and fresh, high-definition detail, original features preserved. Strictly avoid: face swapping, distorted features, over-beautification, influencer-style face, heavy smoothing, fake pores, over-sharpening, heavy HDR, grayish or orange skin tones.
`.trim();

const PHOTO_ENHANCE_PROMPT = `
Apply professional photographic post-processing to the uploaded photo so it looks as if the original was shot with a better camera, a better lens, and steadier post-production.

Keep the original subject, person identity, scene content, composition, clothing, pose, and background unchanged. Do not add people or objects, replace the background, or change the photo's meaning.

Optimization focus:
1. Correct exposure, white balance, color temperature, and color casts so the subject is clearer and colors look more natural.
2. Enhance local clarity, micro-contrast, and material detail while preserving the real texture of skin, hair, fabric, architecture, plants, and so on.
3. Reduce noise, compression artifacts, blur, and haze without smearing, fake sharpening, or edge halos.
4. Recover highlight and shadow detail; avoid blown-out whites, crushed blacks, and unnatural HDR.
5. Apply natural, photography-grade color grading: clean, luminous, true to life, with texture — no heavy filters.

Output result: real photo enhancement, high definition, natural colors, clear detail, rich tonal range. Strictly avoid: AI look, illustration look, background replacement, identity change, facial distortion, over-sharpening, oversaturation, oil-painting effect, plastic skin.
`.trim();

const BACKLIGHT_REPAIR_PROMPT = `
Fix this dim, backlit, or unevenly exposed photo so the subject is clearer while preserving the authentic atmosphere of the scene.

Keep the person's identity, facial structure, base skin tone, clothing, background, pose, and composition unchanged. Do not reshape the face, replace the scene, or add lighting effects that were not in the original.

Optimization focus:
1. Brighten the face and subject area, recover shadow detail, and make faces naturally visible.
2. Pull back blown highlights, preserving detail in the sky, windows, lights, skin highlights, and similar areas.
3. Balance warm and cool color temperature; correct yellow, green, or blue casts and color shifts caused by phone night mode.
4. Reduce shadow noise and compression grain while preserving the texture of skin, hair, clothing, and background.
5. Make the overall light and shadow softer and more natural, like a real photo restored through photographic post-processing.

Output result: natural fill light, true exposure, clear subject, rich tonal range, photographic texture. Strictly avoid: overly bright grayness, heavy HDR, waxy faces, distorted skin tones, forced sky replacement, added lens flares, changing the original scene.
`.trim();

const DETAIL_RESTORE_PROMPT = `
Apply high-definition detail restoration and light deblurring to the uploaded photo so it is clearer and cleaner, yet still looks like the same real photo.

Strictly preserve the original person's identity, face proportions, feature shapes, apparent age, hairstyle, clothing, scene, and composition. Do not change the expression, replace the background, or repaint the photo as an illustration or portrait template.

Optimization focus:
1. Improve overall resolution and edge clarity; fix slight blur caused by hand shake, missed focus, or compression.
2. Recover real detail: eye highlights, eyelashes, eyebrows, hair strands, skin texture, clothing texture, and background materials.
3. Reduce noise, color blocking, mosaic artifacts, and compression traces; avoid a smeared look.
4. Keep natural grain and lens character; do not turn detail into fake texture.
5. Moderately improve brightness, contrast, and color so the photo is crisp but not harsh.

Output result: realistic HD restoration, natural sharpening, enhanced detail, the same photo only clearer. Strictly avoid: face swapping, redrawn features, fake pores, over-sharpening halos, AI illustration look, plastic skin, over-denoised smearing.
`.trim();

const PHOTO_PORTRAIT_V1_PROMPT = `
# Role Definition
You are a senior visual artist and photography-style prompt expert with keen insight into modern mainstream aesthetic trends. You are skilled in photographic composition, lighting, atmosphere building, and portrait aesthetics, and can translate complex visual concepts into precise, vivid, and compelling text descriptions designed to guide AI image generation models.

# Task Specification
Your task is to randomly combine a set of preset, broadly appealing photographic style elements and generate one high-quality, distinctive, eye-catching real-person portrait-style AI image prompt.

# Task Steps
1.  **Randomly choose a core photographic style** from the following list as the base style:
    * Fine real-skin texture style
    * Casual candid snapshot style
    * High-end fashion portrait style
    * Japanese fresh ambiance style
    * Cinematic light-and-shadow storytelling style
    * Dewy translucent portrait

2.  **Randomly determine subject and composition** — choose one subject, one camera angle, and one shot type:
    * **Subject**: young girl, young woman, couple
    * **Camera angle**: high angle, low angle, eye level, profile
    * **Shot type**: facial close-up, half-body portrait, full body

3.  **Randomly set scene and lighting** — choose one scene and one lighting type, ensuring they pair sensibly:
    * **Scene**: sunny outdoors, minimal clean interior, city street at night, by a cafe window, seaside, art gallery, through misted glass
    * **Lighting**: natural soft sunlight, dramatic side light tracing contours, a single spotlight in a dim setting, shimmering light patterns reflected off water, direct-flash snapshot feel

4.  **Randomly add atmosphere and details** — choose 2-3 details that enhance the frame's narrative and sense of motion:
    * **Mood/expression**: naturally relaxed, gaze straight into the lens, cool and alluring, gently lowered, melancholic and quiet
    * **Dynamic details**: hair stirred by a breeze, wet strands clinging to the cheek, fingers interacting with the environment/objects, slight motion blur or shake in the frame
    * **Texture/effects**: film grain, lens noise, floating particles, water droplets or shimmer on the skin

5.  **Randomly choose an aspect ratio** from these common options:
    * 3:4
    * 4:3
    * 9:16
    * 16:9

6.  **Combine and polish**: organically merge the elements chosen above into one fluent, vivid, highly descriptive prompt. Make sure the language flows well and sparks creative inspiration.

7.  **Append the mandatory ending**: at the end of the generated prompt, add the fixed suffix verbatim.

# Constraints
1.  The generated style must be a broadly appealing real-person portrait style. Anime, oil painting, cyberpunk, gothic, and other niche or non-photorealistic art styles are strictly forbidden.
2.  The content must be wholesome and positive, containing no sensitive or inappropriate material.
3.  The final output must be one complete prompt paragraph — no bullet points or sections.
4.  The prompt must end with: "[Do not change the face proportions or appearance; preserve the person's original look. Original proportions! Original proportions! Original proportions!]". This is mandatory and must be included.
5.  Each generated prompt should be unique and randomized; avoid repetition.

# Response Format
Output only the final photographic-style prompt text, with no extra preamble, headings, explanations, or notes.

# Examples and Guidance
* **High-quality example 1 (fine texture style):** In a fine real-skin texture style, the frame shows a facial close-up of a young girl, presented from a slightly high camera angle. The background creates a crisp, sunlit scene; her tousled hair drifts in the wind and her eyes sparkle with a sunny yet alluring mood, exuding cool elegance. The image emphasizes her facial details with carefully handled highlights, carries a camera-noise texture, and has a translucent blue-white finish. Ratio 3:4. [Do not change the face proportions or appearance. Original proportions! Original proportions! Original proportions!]
* **High-quality example 2 (fashion portrait style):** Post-rain fashion portrait, extreme facial close-up shot at very close range, gaze straight into the lens, naturally relaxed expression, clear dewy makeup. The subject and a few tiny tropical fish drift slowly through a fish-tank foreground, their translucent tail fins fluttering. The water refracts shifting light patterns, scattered light specks dance across the face, and floating underwater particles surround the scene. The overall mood is dreamy and quiet, in dark brown-black tones with a strong premium feel, interlaced with floating defocus, motion blur, and fine film grain. Ratio 9:16. [Do not change the face proportions or appearance. Original proportions! Original proportions! Original proportions!]
* **High-quality example 3 (candid snapshot style):** Looks like a careless couple snapshot accidentally taken with an instant camera. The photo should feel slightly shaky, with the camera flash in the dark diffusing across the entire frame. A boy and girl press cheek to cheek, looking intimately at the camera, from a front-camera selfie perspective. The photo must not be too sharp, and should have an instant-film texture. Ratio 4:3. [Do not change the face proportions or appearance. Original proportions! Original proportions! Original proportions!]
`.trim();

const PHOTO_PORTRAIT_V2_PROMPT = `
# Role Definition
You are a top commercial photographer and visual artist with sharp fashion instincts and deep portrait-photography experience. You excel at capturing authentic emotion and presence, and you can create visual concepts that feel both widely appealing and stylistically distinctive. You are fluent in light, composition, color, and texture, and can turn abstract moods into concrete, executable photographic style descriptions.
# Task Specification
Your task is to create multiple randomized, vivid, and broadly appealing real-person portrait photography styles based on the user's needs. These style descriptions will be used as AI image prompts, so they must be detailed, concrete, visually evocative, and strong enough to guide high-quality image generation.
# Task Steps
Choose a core scene or emotion: Start by randomly selecting an everyday scene or specific mood as the style foundation, such as lazy morning light by a window, urban-night detachment, quiet summer afternoon, or a warm moment with a pet.
Define the photographic tone: Randomly choose or combine one or two mainstream photography types as the base tone:
Japanese fresh style: High brightness, low saturation, soft light, and clean frames.
Candid snapshot style: Mimics an unplanned captured moment with slight motion blur, imperfect framing, and everyday realism.
Fashion editorial style: Emphasizes premium polish, clean facial contours, refined makeup, expressive posing, and direct gaze.
Cinematic style: Uses distinctive lighting, environmental storytelling, and character emotion to create the feeling of a film still.
Design light and color: Randomly combine light type, direction, and color palette as the soul of the image.
Light types: soft diffused light, hard direct light, golden-hour evening light, window-blind beams, reflected light from water, and similar options.
Color palette: Lean the full image toward a chosen tone, such as cool blue-white, warm orange-brown, or low-saturation Morandi colors, and determine contrast strength.
Set composition and angle: Choose a composition approach that highlights the subject.
Angles: front, profile, 45-degree angle, high angle, or low angle.
Shot scale: facial close-up, half-body portrait, or full-body portrait.
Composition: centered composition, rule of thirds, or leading lines.
Describe texture and details: Add decisive details and textures that make the image memorable.
Skin texture: delicate translucent skin, subtle dewy sweat, or natural freckled skin.
Environment and prop details: dust in the air, lens flare, damp hair detail, clothing folds.
Post-processing texture: add subtle film grain, sharpening, or soft-focus effects.
Integrate and output: Organically combine the chosen elements into one fluent, vivid, emotionally engaging paragraph. Keep the wording concise, clear, and easy for AI to execute.
# Constraints
The generated style must be a real-person portrait style, avoiding anime, illustration, or 3D render styles.
The style must feel fresh and broadly appealing. Avoid niche, strange, or overused fixed templates such as cyberpunk, gothic fantasy, or steampunk.
Focus on mood, lighting, texture, color, and composition rather than specific clothing or character identity.
The final output must be one complete paragraph with no step breakdown or extra explanatory text.
Each generated style should have a distinct memorable point and should not closely resemble other styles.
# Response Format
Output only the final photographic style description, wrapped in a single code block.
# Examples and Guidance
Example 1 (Japanese fresh style + candid snapshot):
Japanese airy candid snapshot style. In a room filled with afternoon sunlight, use slightly overexposed exposure to create a light, translucent atmosphere. The subject turns sideways to the camera and looks out the window, as if captured in the instant something drew their attention. Light passes through thin white curtains and forms soft patches across the face, with golden rim light along the hair. The overall palette leans toward pale blue-green with low saturation, emphasizing clear, luminous skin. Add slight lens flare and dust-in-air texture for an unplanned, warm, peaceful beauty.
Example 2 (fashion editorial + cinematic mood):
Dark emotional fashion portrait style. The subject sits to one side of the frame with a wide aperture, while the background becomes blurred points of light. A precise dramatic top light falls diagonally from above, illuminating only half the face, shoulder, and arm, forming strong chiaroscuro contrast. The expression is calm and distant, with a direct gaze full of story. The environment uses rich ink green or deep blue tones; against the dark background, the skin texture feels fine and the highlights are crisp. Add delicate cinematic film grain for a premium, mysterious, quiet atmosphere.
`.trim();

const CUTIE_3D_STYLE_PROMPT = `
Generate or redraw the subject as a minimalist 3D cutie-style illustration. The user may add a specific subject here: a cute, rounded, softly textured [subject].

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
You are a professional visual prompt-design assistant helping the user create image prompts in a Xiaohongshu-style social poster format. Follow this process strictly:

Step 1: Ask the user these questions first and record the answers in either English or Chinese:
1. Should the poster layout be vertical or horizontal?
2. What is the poster's topic area, such as city travel, food discovery, natural scenery, or weekend wandering?
3. What collage style do you prefer, such as journal, sticker, magazine, or scrapbook style?
4. What border or label color do you prefer, such as pink, bright yellow, grass green, or sky blue?
5. What date range or usage period should the image cover, such as 3.25 to 5.15?

Step 2: Fill the template below from the user's input and output complete JSON.
- If the layout is vertical, set "aspect_ratio" to "3:4".
- If the layout is horizontal, set "aspect_ratio" to "4:3".
- Output JSON only, with no additional explanation.

Template. Replace the brace placeholders:

{
  "prompt": "A vibrant and playful collage-style poster in a {orientation} layout, themed around {content_area}, featuring a mix of photos, stickers, and hand-drawn elements. The design includes cut-out photos of relevant scenes, speech bubbles, and colorful labels with border colors in {label_color}. The style resembles social media visuals from Xiaohongshu, with a {collage_style} look. Includes both English and optional Chinese-style social poster text, such as 'City Explorer Plan' and 'City Guide'.",
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
   - For languages like Chinese or others with complex scripts:
     - Ensure each character or symbol is correct, standard, and used appropriately.
     - Double-check stroke order, avoid non-existent variants, and verify usage before finalizing the notes.

User Settings (to be defined before image generation):
- Topic: User-defined.
- Orientation: Horizontal or Vertical.
- Language: English/Chinese or any chosen language.
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
    title: "Not sure which glasses fit?",
    description: "Facial feature analysis + eyewear guide",
    prompt: GLASSES_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: Glasses,
  },
  {
    id: "hairstyle",
    title: "Not sure which hairstyle fits?",
    description: "AI hairstyle aesthetics upgrade report",
    prompt: HAIRSTYLE_PROMPT,
    mode: "edit",
    imageSize: "4:3",
    imageCount: "1",
    icon: Scissors,
  },
  {
    id: "natural-beauty",
    title: "Natural Beauty Retouch",
    description: "Preserve facial features + light skin refinement",
    prompt: NATURAL_BEAUTY_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: Sparkles,
  },
  {
    id: "photo-portrait-v1",
    title: "Random Portrait Style V1",
    description: "Randomly combined real-person portrait prompt",
    prompt: PHOTO_PORTRAIT_V1_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: Aperture,
  },
  {
    id: "photo-portrait-v2",
    title: "Random Portrait Style V2",
    description: "Commercial photography-style real-person portrait description",
    prompt: PHOTO_PORTRAIT_V2_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: Clapperboard,
  },
  {
    id: "cutie-3d-style",
    title: "3D Cutie Style",
    description: "Rounded cute forms + minimalist 3D illustration",
    prompt: CUTIE_3D_STYLE_PROMPT,
    mode: "generate",
    imageSize: "1:1",
    imageCount: "1",
    icon: Box,
  },
  {
    id: "xiaohongshu-poster",
    title: "Xiaohongshu-style Poster",
    description: "Ask parameters first + output poster JSON",
    prompt: XIAOHONGSHU_POSTER_PROMPT,
    mode: "generate",
    imageSize: "3:4",
    imageCount: "1",
    icon: Newspaper,
  },
  {
    id: "handwritten-notes",
    title: "Handwritten Notes Style",
    description: "Structured notes + hand-drawn annotations",
    prompt: HANDWRITTEN_NOTES_PROMPT,
    mode: "generate",
    imageCount: "1",
    icon: NotebookPen,
  },
  {
    id: "photo-enhance",
    title: "Photo Texture Enhancement",
    description: "Exposure, color, and clarity enhancement",
    prompt: PHOTO_ENHANCE_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: Camera,
  },
  {
    id: "backlight-repair",
    title: "Low-light Backlight Repair",
    description: "Natural fill light + highlight and shadow recovery",
    prompt: BACKLIGHT_REPAIR_PROMPT,
    mode: "edit",
    imageCount: "1",
    icon: SunMedium,
  },
  {
    id: "detail-restore",
    title: "HD Detail Restoration",
    description: "Deblur and denoise + preserve natural texture",
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
  category: "Built-in Quick",
}));

type BananaPromptStatus = "idle" | "loading" | "success" | "error";

function normalizePromptMode(value?: string): ImageConversationMode {
  const normalized = (value || "").toLowerCase();
  if (["edit", "image", "image-to-image", "i2i", "\u56fe\u751f\u56fe"].includes(normalized)) {
    return "edit";
  }
  return "generate";
}

function getPromptModeLabel(value?: string) {
  return normalizePromptMode(value) === "edit" ? "\u56fe\u751f\u56fe" : "Text-to-image";
}

function summarizeBananaPrompt(item: PromptPickerItem) {
  const cleaned = item.prompt
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_`>\-[\]{}()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const firstSentence =
    cleaned
      .split(/(?<=[.!?])\s+/)
      .find((sentence) => sentence.length >= 10)
      ?.trim() || cleaned;

  if (!firstSentence) {
    return item.sub_category ? `${item.sub_category} prompt. Click once to fill the current input.` : "Creative prompt that can be inserted into the current input with one click.";
  }

  return firstSentence.length > 86 ? `${firstSentence.slice(0, 86)}...` : firstSentence;
}

function getPromptCategoryLabel(item: PromptPickerItem) {
  return [item.category, item.sub_category].filter(Boolean).join(" / ") || "Uncategorized";
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
    timeoutId = setTimeout(() => reject(new Error("Prompt management API timed out")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function buildPromptShareTitle(prompt: string) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "Untitled Prompt";
  }
  return cleaned.length > 24 ? `${cleaned.slice(0, 24)}...` : cleaned;
}

function shareUrlFromId(shareId: string) {
  if (typeof window === "undefined") {
    return `/prompt-manager?share=${encodeURIComponent(shareId)}`;
  }
  return `${window.location.origin}/prompt-manager?share=${encodeURIComponent(shareId)}`;
}

async function sharePromptPayload(payload: PromptLibraryPayload) {
  const data = await createPromptShare(payload);
  const shareUrl = shareUrlFromId(data.share_id);
  if (navigator.share) {
    try {
      await navigator.share({ title: payload.title, text: payload.description || payload.title, url: shareUrl });
      return "shared";
    } catch {
      // Fall back to clipboard below when native sharing is cancelled or unavailable.
    }
  }
  await navigator.clipboard.writeText(shareUrl);
  return "copied";
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
  const [bananaPromptCategory, setBananaPromptCategory] = useState("All");
  const [bananaPromptRetryKey, setBananaPromptRetryKey] = useState(0);
  const sizeMenuRef = useRef<HTMLDivElement>(null);
  const lightboxImages = useMemo(
    () => referenceImages.map((image, index) => ({ id: `${image.name}-${index}`, src: image.dataUrl })),
    [referenceImages],
  );
  const imageSizeOptions = [
    { value: "", label: "Unspecified" },
    { value: "1:1", label: "1:1 (Square)" },
    { value: "16:9", label: "16:9 (Landscape)" },
    { value: "4:3", label: "4:3 (Landscape)" },
    { value: "3:4", label: "3:4 (Portrait)" },
    { value: "9:16", label: "9:16 (Portrait)" },
  ];
  const imageSizeLabel = imageSizeOptions.find((option) => option.value === imageSize)?.label || "Unspecified";
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
    return ["All", ...categories];
  }, [morePromptItems]);
  const filteredBananaPrompts = useMemo(() => {
    const query = bananaPromptQuery.trim().toLowerCase();
    return morePromptItems.filter((item) => {
      const categoryLabel = getPromptCategoryLabel(item);
      const matchesCategory = bananaPromptCategory === "All" || categoryLabel === bananaPromptCategory;
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

  const handleCopyPrompt = async () => {
    const cleaned = prompt.trim();
    if (!cleaned) {
      toast.error("No prompt to copy");
      return;
    }
    await navigator.clipboard.writeText(cleaned);
    toast.success("Prompt copied");
  };

  const handleSharePrompt = async () => {
    const cleaned = prompt.trim();
    if (!cleaned) {
      toast.error("No prompt to share");
      return;
    }
    try {
      const result = await sharePromptPayload({
        title: buildPromptShareTitle(cleaned),
        description: mode === "edit" ? "Image-to-image prompt" : "Text-to-image prompt",
        prompt: cleaned,
        mode,
        image_size: imageSize,
        image_count: imageCount,
      });
      toast.success(result === "shared" ? "Share opened" : "Share link copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Share failed");
    }
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
            throw new Error(`Local resource returned ${response.status}`);
          }
          items = normalizeBananaPromptsPayload(await response.json());
        }
        if (items.length === 0) {
          throw new Error("No usable prompts were loaded");
        }
        setBananaPrompts(sortPromptItems(mergePromptItems(defaultPromptItems, items)));
        setBananaPromptError(apiErrorMessage);
        setBananaPromptStatus("success");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to load prompts";
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
        <div className="text-base font-bold text-stone-950">Prompt Studio</div>
        <div className="mt-1 text-sm text-stone-500">Image generation - reference editing</div>
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
            Text-to-image
          </ModeButton>
          <ModeButton active={mode === "edit"} onClick={() => onModeChange("edit")}>
            Image-to-image
          </ModeButton>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-white/45 p-3">
          <div>
            <div className="text-xs text-stone-500">Model</div>
            <div className="mt-1 text-sm font-bold text-stone-950">gpt-image-2</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Image Count</div>
            <div className="mt-1 text-sm font-bold text-stone-950">{Math.max(1, Math.min(10, Number(imageCount) || 1))} / max 10</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Local Quota</div>
            <div className="mt-1 text-sm font-bold text-stone-950">{availableQuota}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Active Tasks</div>
            <div className="mt-1 text-sm font-bold text-stone-950">{activeTaskCount} itemsRunning</div>
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
                  aria-label={`Preview reference image ${image.name || index + 1}`}
                >
                  <img
                    src={image.dataUrl}
                    alt={image.name || `Reference image ${index + 1}`}
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
                  aria-label={`Remove reference image ${image.name || index + 1}`}
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
              onClick={() => void handleCopyPrompt()}
              disabled={!prompt}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-100 bg-white/75 px-3 text-sm font-medium text-stone-700 transition hover:border-rose-200 hover:bg-white disabled:cursor-not-allowed disabled:border-stone-100 disabled:bg-stone-50 disabled:text-stone-300"
              aria-label="Copy current prompt"
            >
              <Copy className="size-4" />
              Copy
            </button>
            <button
              type="button"
              onClick={() => void handleSharePrompt()}
              disabled={!prompt}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-100 bg-white/75 px-3 text-sm font-medium text-stone-700 transition hover:border-rose-200 hover:bg-white disabled:cursor-not-allowed disabled:border-stone-100 disabled:bg-stone-50 disabled:text-stone-300"
              aria-label="Share current prompt"
            >
              <Share2 className="size-4" />
              Share
            </button>
            <button
              type="button"
              onClick={handleClearPrompt}
              disabled={!prompt}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-100 bg-white/75 px-3 text-sm font-medium text-stone-700 transition hover:border-rose-200 hover:bg-white disabled:cursor-not-allowed disabled:border-stone-100 disabled:bg-stone-50 disabled:text-stone-300"
            >
              <X className="size-4" />
              Clear prompt
            </button>
            <button
              type="button"
              onClick={() => setIsPromptLibraryOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-100 bg-white/75 px-3 text-sm font-medium text-stone-700 transition hover:border-rose-200 hover:bg-white"
            >
              <Images className="size-4" />
              More Prompts
            </button>
          </div>
        </div>

        <Dialog open={isPromptLibraryOpen} onOpenChange={setIsPromptLibraryOpen}>
          <DialogContent className="flex h-[84vh] w-[min(94vw,1040px)] max-w-none flex-col overflow-hidden rounded-lg p-0">
            <DialogHeader className="border-b border-rose-100 px-5 pt-5 pb-4 sm:px-6">
              <div className="flex flex-col gap-3 pr-10 sm:flex-row sm:items-start sm:justify-between sm:pr-12">
                <div className="min-w-0">
                  <DialogTitle className="text-xl font-semibold text-stone-950">More Prompts</DialogTitle>
                  <DialogDescription className="mt-2 leading-6 text-stone-500">
                    Includes the current three quick prompts{morePromptItems.length > 0 ? `, loaded ${morePromptItems.length} items` : ""}
                    . Click a prompt to fill it and automatically switch between text-to-image and image-to-image mode.
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
                    Manage Prompts
                  </a>
                </Button>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                  <Input
                    value={bananaPromptQuery}
                    onChange={(event) => setBananaPromptQuery(event.target.value)}
                    placeholder="Search title, author, category, or prompt content"
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
                    Loading prompt library
                  </div>
                </div>
              ) : bananaPromptStatus === "error" ? (
                <div className="flex h-full min-h-[260px] items-center justify-center text-center">
                  <div className="max-w-sm">
                    <div className="text-base font-semibold text-stone-900">Prompt library failed to load</div>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{bananaPromptError || "Please try again later."}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 rounded-lg border-rose-100 bg-white"
                      onClick={() => {
                        setBananaPromptStatus("idle");
                        setBananaPromptRetryKey((key) => key + 1);
                      }}
                    >
                      Reload
                    </Button>
                  </div>
                </div>
              ) : filteredBananaPrompts.length === 0 ? (
                <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-stone-500">
                  No matching prompts
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
                              alt={`${item.title} sample image`}
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
                              {item.author ? `Author ${item.author}` : "Prompt Management"}
                            </div>
                            <Button
                              type="button"
                              size="sm"
                            className="h-8 shrink-0 rounded-lg text-white"
                              onClick={() => handleBananaPromptSelect(item)}
                            >
                              Use
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
                mode === "edit" ? "Describe how you want to modify this reference image. You can paste images directly." : "Enter the scene you want to generate. You can also paste images directly."
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void onSubmit();
                }
              }}
              className="min-h-[220px] resize-y rounded-lg border-0 bg-transparent px-4 pt-4 pb-4 text-[15px] leading-7 text-stone-900 shadow-none placeholder:text-stone-400 focus-visible:ring-0"
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
                      <span>{referenceImages.length > 0 ? "Add more reference images" : "Upload reference image"}</span>
                    </Button>
                  )}
                  <div className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-50 px-3 text-xs font-medium text-stone-600">
                    <span className="mr-1">Local Quota</span>{availableQuota}
                  </div>
                  {activeTaskCount > 0 && (
                    <div className="col-span-2 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-3 text-xs font-medium text-amber-700">
                      <LoaderCircle className="size-3 animate-spin" />
                      {activeTaskCount}<span> tasks running</span>
                    </div>
                  )}
                  <div className="flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-100 bg-white/85 px-3">
                    <span className="text-sm font-medium text-stone-700">Count</span>
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
                    <span className="font-medium text-stone-700">Ratio</span>
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
                  aria-label={mode === "edit" ? "Edit Image" : "Generate Image"}
                >
                  <ArrowUp className="size-4" />
                  <span>{mode === "edit" ? "Edit Image" : "Generate Image"}</span>
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
