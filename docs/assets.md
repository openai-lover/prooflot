# Visual assets

The current introduction and product screens share `public/assets/intro-passport-v2.png`. The earlier `public/assets/glass-version.png`, generated on 2026-11-10, remains available for existing references. Both have transparent backgrounds. No user API key or external stock image is required. The character/robot drafts were rejected and are not used or included in the source archive.

## Exact generation prompt

Use case: product-mockup. Asset type: refined editorial product still life for a serious Korean financial analytics application. A small architectural arrangement of three THIN rectangular translucent optical-glass plates, slightly offset like precisely versioned documents, balanced at a subtle angle. One deep muted cobalt glass plate, two almost-clear frosted white glass plates, finely chamfered crisp edges and extremely restrained satin aluminum edge details. NO characters, NO robot, NO eyes, NO faces, NO mascots, NO cute rounded toys, NO shield, NO coins, NO orb, NO stars, NO floating UI badges. Quiet, sophisticated industrial design, premium camera/product photography aesthetic, physically realistic restrained reflections and refraction, large soft studio light, compact centered 3/4 composition. Think precision glass samples shot for an architecture magazine, not game art, not neon, not sci-fi. Transparent background with subtle contact shadow only. No text, letters, logos, numbers, graphics or symbols. At most 3 plates, lots of negative space around the object. Square 1024x1024.

The UI itself is implemented in HTML/CSS with code-native charts and symbols. The image is a decorative product still life, not evidence of a working feature.

## Full-screen introduction redesign

`public/assets/intro-passport-v2.png` is a new 1254 × 1254 transparent PNG generated with the built-in image tool for the November 13 introduction redesign. Its use is decorative; all text, controls, report lines and cards are native HTML/CSS/SVG.

Generation direction (summary): a premium, photorealistic software passport in optical glass, one deep cobalt face with a white code-bracket symbol, two clear offset layers behind it, carefully beveled silver edges and restrained soft studio lighting; isolated with transparency; no people, characters, mascots, coins, surrounding UI or text. The continuous object links the registration, report and purchased-license scenes. No stock photography or paid external asset API was used.

`public/assets/fonts/PretendardVariable-1.3.9.woff2` is the unmodified variable font from the official [Pretendard](https://github.com/orioncactus/pretendard) npm package, retrieved from [pretendard@1.3.9 on unpkg](https://unpkg.com/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2). Its SIL Open Font License and attribution are retained in `public/assets/fonts/Pretendard-LICENSE.txt`. It is served locally and now used throughout the product as well as the introduction.

The introduction's 62-point chart, −0.98% return, 1.54% drawdown, 61 completed decisions and two warnings come from `docs/wallet-product-evidence.json` (Signal Check). The panels explicitly identify themselves as a demonstration. These are illustrative historical results, not a new execution triggered by watching the animation.

The original first-visit storage key is retained. The main screen now also loads the shared image; the browser reuses it for the studio, purchase panel and introduction. The 13-second timeline uses requestAnimationFrame, pauses when the document is hidden, and stops when closed or complete. Reduced-motion users receive a static final scene with manual chapter selection. Introduction screenshots are in `docs/screenshots/intro-v2-*.jpg`; the November 14 product redesign is in `docs/screenshots/*-v3*.jpg`.

The intro exit uses the native View Transition API to connect the glass object to the destination when visible. A fade is used when the API is unavailable, and motion is omitted for reduced-motion users. All headings, buttons, checks and charts remain live HTML/CSS/SVG. No new generated performance claims or placeholder results were introduced for the product redesign.
