# LOOPIE FULL REGENERATION PROMPT PACK


---

# FILE: 00_MASTER_REGENERATION_PROMPT.md

# Prompt 00 — Master Zero-to-Production Regeneration

You are acting simultaneously as a senior product designer, motion designer, staff frontend engineer, full-stack engineer, accessibility specialist, conversion specialist, and release QA lead.

Your task is to rebuild the Loopie marketing website from an empty repository as a production-grade application. The reference export is located under `/reference/loopie/`. Use it to recover the page structure, visible copy, asset relationships, design language, and interaction behavior. Do not ship the raw Webflow HTML, Webflow runtime, jQuery, generated class soup, or copied minified CSS.

## Core objective

Create a clean, maintainable, high-fidelity implementation that feels like the same premium social-product landing page:

- warm, human, spontaneous, trustworthy;
- editorial rather than generic SaaS;
- sophisticated motion without visual noise;
- green-to-bronze brand gradients;
- natural photography and real-life social moments;
- mobile-first conversion through waitlist and city-proposal modals.

The final result must not look like a generic AI-generated landing page. Avoid generic purple gradients, excessive glass cards, random icons, stock dashboard layouts, excessive border radii, and repetitive card grids.

## Required stack and engineering standards

Use:

- Next.js App Router and React;
- TypeScript with `strict: true`;
- a centralized design-token layer in CSS variables;
- semantic React components;
- Framer Motion for reveal and component motion;
- `lottie-web` for scroll-scrubbed Lottie scenes;
- React Hook Form plus Zod for form state and validation;
- server-side API routes/actions for form submission;
- Supabase by default for persistence, isolated behind a repository/service layer;
- Vitest and React Testing Library for unit/component tests;
- Playwright for end-to-end and visual regression tests.

If the existing repository already has compatible tools, preserve them and integrate rather than replacing the stack gratuitously.

## Non-negotiable page order

Implement this exact flow:

1. Transparent navigation over a full-screen video hero.
2. A 400-viewport-height sticky, scroll-scrubbed Lottie story.
3. “Loopie Helps You Change That” application walkthrough.
4. “1:1 or Group — Your Call” cinematic sticky photo section.
5. “Casual Plans / Real People / Right Now” safety and product showcase.
6. “Moments are better, when shared” conversion CTA.
7. FAQ with sticky left column and seven accordions.
8. “Bring Loopie to the next City” proposal CTA.
9. Footer.
10. Waitlist modal.
11. New-city modal.
12. Cookie-consent banner.

Do not remove the Lottie section, replace the three-phone compositions with a single screenshot, flatten the sticky sections into ordinary cards, or omit the forms.

## Exact visible content

### Navigation

- Status badge: `Soon to be live in Budapest`
- `How it works`
- `Safety`
- `Propose New City`
- `FAQs`
- CTA: `Join Waitlist`

### Hero

- H1: `Up for something?`
- Paragraph: `See who's free for coffee, walks, sports and more. Launching in Budapest.`
- CTA: `Join Waitlist`
- Desktop hover tooltip:
  `We’ll notify you when Loopie launches in Budapest this summer.`
  `1 month free. No card required.`

### Application walkthrough

- Heading: `Loopie Helps You Change That`
- Intro: `Open the map and see people nearby who are up for:`
- Activity pills:
  - `Food & Drinks`
  - `Get Active`
  - `Outdoor`
  - `Night Out`
  - `Coffee`
  - `A Walk`
  - `The Gym`
  - `Dinner`
  - `Drinks`
  - `Sports`
  - `Yoga`
  - `Running`
  - `Cycling`
  - `Chill & chat`
- Four numbered steps:
  1. `See who’s around`
  2. `See what they’re doing.`
  3. `Join, or drop your own.`
  4. `Next time invite them again`

### 1:1 or Group section

- Heading line 1: `1:1 or Group —`
- Heading line 2: `Your Call`
- Card 1:
  - eyebrow: `Some days you want:`
  - title: `A quick coffee`
  - continuation: `or post-work drinks`
- Card 2:
  - eyebrow: `Other days:`
  - title: `A walk in the park`
  - continuation: `or a sunset run`
- Card 3:
  - eyebrow: `Or maybe:`
  - title: `Someone for tennis`
  - continuation: `or a gym buddy`

### Safety/product showcase

- `Casual Plans`
- `Real People`
- `Right Now`
- `Follow On Instagram`
- `Join Waitlist`

Floating safety cards:

1. `Approximate Location Only`
   `Your exact location stays private.`
2. `Safe for Women`
   `Meetups are intentional, not random.`
3. `No Annoying Notifications`
   `You control your notifications anytime.`
4. `Intentional connections only`
   `You can’t receive random messages or friend requests, you control it.`

### Main CTA

- `Moments are better,`
- `when shared`
- `Join Waitlist`

### FAQ

1. `Where is Loopie available right now?`
2. `Is it actually free to start?`
3. `How does the map work?`
4. `What happens after 30 days of early access?`
5. `Is this just another ghost town app?`
6. `Is it safe?`
7. `How do I cancel?`

Use the complete answer copy from the reference export, but load it from a typed content file rather than hard-coding it into components.

### City CTA

- `Bring Loopie`
- `to the next City`
- `Add your city — and help us kickstart spontaneous plans where you live.`
- `Propose New City`

### Footer

- Contact: `support@loopie.com`
- About Loopie:
  - `How It Works`
  - `Safety`
  - `FAQs`
- Contribute to Loopie:
  - `Propose New City`
  - `Community Guidelines`
  - `Cookie Settings`
- `© Loopie 2026`
- `Privacy Policy`
- `Terms of Service`

## Visual system

Create these tokens:

```css
:root {
  --color-black: #000000;
  --color-white: #ffffff;
  --color-bg: #f5f5f5;
  --color-cream: #f9f4f1;
  --color-green: #274b1d;
  --color-green-deep: #0b5024;
  --color-bronze: #a47a56;
  --color-gold: #c89866;
  --color-mint: #abc5ac;
  --color-mint-soft: #d7edd2;
  --color-mint-line: #bde1b3;
  --color-warm-glow: #e0c6b4;
  --color-neutral-950: #1e2330;
  --color-neutral-900: #282f40;
  --color-muted: #6f7ea5;
  --color-input-border: #d8dce7;
  --color-input-placeholder: #a3adc6;
  --color-error: #b3261e;
}
```

Use the Raleway variable font. The page background is warm off-white, not pure white.

Desktop container:

- max width: `80rem`;
- horizontal padding: `3rem`;
- tablet padding: `2rem`;
- mobile padding: `1rem`.

Typography:

- hero H1: 64/70 px desktop, 56/64 tablet, 48/54 mobile;
- section H2: 48/54 desktop, 36/44 mobile;
- step/card title: 36/44 desktop;
- FAQ question: 24/32;
- body: 16/24, medium weight;
- buttons: 16 px, semibold.

Brand gradient:

```css
linear-gradient(90deg, #274b1d 0%, #a47a56 100%)
```

Light-on-dark accent gradient:

```css
linear-gradient(180deg, #c89866 0%, #abc5ac 60%)
```

## Responsive behavior

Use these product breakpoints as behavior thresholds:

- large desktop: `>= 1440`;
- desktop/tablet switch: `991`;
- tablet/mobile switch: `767`;
- small mobile: `479`.

Important behaviors:

- hero remains full viewport height;
- mobile navigation becomes a cream dropdown with large dark links;
- desktop Lottie, tablet Lottie, and mobile Lottie use separate JSON files;
- app walkthrough changes from three columns to a vertical layout;
- group cards move vertically on desktop and horizontally on tablet/mobile;
- the safety phones and floating cards recompose instead of shrinking blindly;
- FAQ becomes a single column on mobile;
- footer stacks on mobile;
- modals remain usable within a short mobile viewport.

## Motion principles

- Use motion to explain the product, not to decorate every element.
- Reveal headings and key assets with opacity plus 16–32 px translation.
- Stagger grouped elements by 60–120 ms.
- Button hover: translateY(-5px), not a large scale.
- Phone screens crossfade every 3 seconds only while the section is visible.
- Group cards are linked to section scroll progress.
- FAQ plus icons animate cleanly.
- Mobile menu lines morph into a gradient X.
- Respect `prefers-reduced-motion`: disable scrubbed motion, show representative static states, and keep all content visible.

## Forms and real persistence

Implement functional waitlist and city-proposal submissions. Do not fake success with client-only timers.

Waitlist:

- full name required;
- user must select WhatsApp, email, or both;
- reveal only the inputs for selected channels;
- Hungarian phone country selected by default;
- validate phone as E.164;
- validate email;
- optional updates toggle;
- honeypot;
- rate limiting;
- success state with Instagram link and copyable share URL.

City proposal:

- city required;
- Google Places city autocomplete;
- user must select a real autocomplete result;
- WhatsApp/email notification selection;
- optional updates toggle;
- same abuse protection and success state.

Persist server-side. Never expose a Supabase service-role key to the browser.

## Consent, analytics, and SEO

- Analytics must not load before non-essential cookie consent.
- Support accept, reject, and reopen settings.
- Gate GA4, Microsoft Clarity, Meta Pixel, and reCAPTCHA appropriately.
- Track waitlist submit, city submit, and CTA clicks only after consent.
- Generate metadata, Open Graph, Twitter cards, canonical URL, robots, sitemap, WebPage schema, SoftwareApplication schema, and FAQPage schema.
- Generate schema from the same content/config values used by the UI.
- Do not retain the old 60-day structured-data mismatch.

## Accessibility

- WCAG 2.2 AA target.
- Proper heading order.
- Keyboard-accessible mobile menu and FAQ.
- Modal focus trap, initial focus, Escape close, close button, focus return, and scroll lock.
- Do not close a modal accidentally while a form submission is in progress.
- Visible focus styles.
- Descriptive alt text.
- Decorative images use empty alt.
- Touch targets at least 44×44 px.
- Motion has a reduced-motion alternative.

## Performance

- Use `next/image` for raster images where appropriate.
- Hero video uses MP4/WebM sources, poster, preload metadata or controlled preload, muted autoplay, loop, and playsInline.
- Do not preload every screenshot.
- Lazy-load below-the-fold media.
- Avoid layout shift by declaring aspect ratios.
- Scroll handlers must use requestAnimationFrame or Motion values.
- No unbounded event listeners.
- Target Lighthouse scores above 90 while preserving the visual experience.

## Required repository output

Produce:

- working source code;
- typed content/config files;
- cleaned public asset structure;
- API routes/server actions;
- database schema/migration;
- `.env.example`;
- analytics and consent utilities;
- tests;
- visual regression screenshots;
- `README.md`;
- implementation notes documenting deliberate deviations from the reference.

Do not stop after creating a plan. Implement the full page, run all checks, repair failures, and provide a final release report containing commands run, test results, remaining external credentials, and exact verification URLs.


---

# FILE: 01_PROJECT_FOUNDATION_AND_DESIGN_SYSTEM.md

# Prompt 01 — Project Foundation and Design System

Continue from the master prompt. Build the clean foundation before implementing individual sections. Do not create generic placeholder sections.

## 1. Initialize or normalize the application

Use a modern Next.js App Router project with TypeScript strict mode.

Required quality settings:

- strict TypeScript;
- ESLint with no ignored production errors;
- Prettier or repository formatter;
- absolute import alias such as `@/*`;
- deterministic package manager lockfile;
- environment validation at startup;
- no `any` unless justified in a comment;
- no client component unless browser state or browser APIs require it.

Create a structure comparable to:

```text
app/
  api/
    waitlist/route.ts
    city-request/route.ts
  layout.tsx
  page.tsx
  globals.css
components/
  landing/
    Navbar.tsx
    Hero.tsx
    ScrollStory.tsx
    HowItWorks.tsx
    GroupChoice.tsx
    SafetyShowcase.tsx
    SharedMomentsCta.tsx
    FaqSection.tsx
    BringLoopie.tsx
    Footer.tsx
  forms/
    WaitlistModal.tsx
    CityRequestModal.tsx
    NotificationChannelFields.tsx
    PhoneField.tsx
    SuccessPanel.tsx
  consent/
    CookieBanner.tsx
  ui/
    BrandLogo.tsx
    GradientButton.tsx
    GlassButton.tsx
    SectionHeading.tsx
    Reveal.tsx
    Modal.tsx
content/
  loopie.ts
lib/
  analytics/
  consent/
  env.ts
  validation.ts
  rate-limit.ts
  submissions/
  supabase/
public/
  loopie/
    brand/
    video/
    animation/
    app/
    photos/
    icons/
    form/
tests/
docs/
  database.sql
  asset-manifest.md
  reference-differences.md
```

The exact structure may adapt to the repository, but the separation of content, UI, data, analytics, and assets is mandatory.

## 2. Create the single content/config source

Create a strongly typed `content/loopie.ts` containing:

- site config;
- navigation;
- hero copy;
- activity list;
- app steps;
- group cards;
- safety cards;
- FAQ questions and rich answers;
- city CTA;
- footer groups;
- modal copy;
- legal links;
- social links;
- pricing and launch configuration.

The UI, metadata, schema markup, tooltips, footer, and success panels must consume these values. Do not duplicate copy strings across components.

Add comments documenting:

- visible UI uses 30 days;
- old structured data contained 60 days;
- the Instagram username varied in the export;
- launch date and pricing are time-sensitive.

## 3. Global design tokens

Implement the color variables from the master prompt and also add:

```css
:root {
  --container-max: 80rem;
  --page-pad-desktop: 3rem;
  --page-pad-tablet: 2rem;
  --page-pad-mobile: 1rem;

  --radius-sm: 0.75rem;
  --radius-md: 1rem;
  --radius-lg: 1.5rem;
  --radius-pill: 999px;

  --shadow-soft: 0 1px 15px rgb(0 0 0 / 0.05);
  --shadow-warm:
    0 -12px 120px rgb(200 152 102 / 0.20),
    inset 0 4px 4px rgb(255 255 255 / 0.50),
    0 4px 16px rgb(138 90 58 / 0.20);

  --ease-premium: cubic-bezier(0.22, 1, 0.36, 1);
}
```

Add text smoothing and `text-wrap: pretty` to editorial headings and body copy where supported.

## 4. Font loading

Load Raleway Variable locally or through the framework font system. Use weights 100–900. Do not expose or distribute a standalone font file as a deliverable outside the project.

Fallback:

```css
font-family: "Raleway Variable", Raleway, Arial, sans-serif;
```

## 5. Foundational components

### Container

- max width `80rem`;
- centered;
- desktop 48 px horizontal padding;
- tablet 32 px;
- mobile 16 px.

### GradientButton

- green-to-bronze background;
- white text;
- pill shape;
- 14 px vertical padding;
- 20 px left padding, 16 px right padding;
- optional trailing arrow;
- subtle white inset highlights;
- hover translateY(-5px);
- active translateY(-1px);
- focus-visible ring;
- disabled and loading states.

### GlassButton

- semitransparent white background;
- 1–2 px white translucent border;
- backdrop blur;
- white text on dark backgrounds;
- same hover motion;
- do not use it on light surfaces without contrast adjustment.

### GradientText

Implement brand gradient using background clip, with a legible fallback for browsers that do not support text clipping.

### Reveal

A reusable entrance animation supporting:

- direction;
- distance;
- delay;
- duration;
- threshold;
- once/replay;
- reduced-motion fallback.

### Modal shell

Build the accessible shell now, but leave form-specific content for Prompt 09.

- overlay blur;
- background `rgba(0,0,0,.4)`;
- content max 95vh;
- scrolling inside content;
- focus trap;
- Escape;
- focus return;
- body scroll lock;
- animated opacity and translateY(20px);
- 250 ms transitions.

### Accordion shell

- keyboard-accessible buttons;
- `aria-expanded`;
- animated content height;
- plus-to-minus icon;
- no Webflow dropdown dependency.

## 6. Base page shell

- body background `#f5f5f5`;
- page has no horizontal overflow caused by animation;
- navigation is layered above hero;
- main content has deliberate z-index management;
- footer remains in normal document flow.

## 7. Tests

Add baseline tests for:

- content config validity;
- button states;
- modal focus behavior;
- accordion keyboard behavior;
- design token presence;
- no duplicate FAQ IDs.

## Acceptance checklist

- [ ] Type checking passes.
- [ ] Lint passes.
- [ ] Base page renders without hydration warnings.
- [ ] Raleway is loaded correctly.
- [ ] Design tokens are centralized.
- [ ] Shared components match the visual language.
- [ ] Content is stored once and typed.
- [ ] Modal and accordion primitives are keyboard accessible.
- [ ] No placeholder gradients or generic SaaS component library styling remains.


---

# FILE: 02_ASSET_AUDIT_AND_MIGRATION.md

# Prompt 02 — Asset Audit, Recovery, Cleanup, and Migration

Continue from the existing implementation. Audit `/reference/loopie/` and create a clean asset pipeline. Do not leave components pointing at opaque Webflow filenames.

## 1. Inventory the reference export

Recover and classify all assets. The export contains at least these groups.

### Hero

```text
Loopie_Hero_rpbhaw_MLW-.mp4
```

Also recover the hero poster from the reference page or create a poster from the first visually representative video frame.

### App walkthrough phone images

Use the largest available source variants:

```text
69d6b9e66a03670daa96e4a7_e4cbb3695cf23fc81bcd64eb87cb54_MLW-.png
69d6b9e7b381571162014bbf_9a26eb72646919a1053b9275f033bd_MLW-.png
69d6b9e6aaa396861c5ade18_Free iPhone Air-2_MLW-.avif
69d6b9e5e3f2f5f384afb1cd_c8c057fd893186edf399e8652744f1_MLW-.png
```

Rename to:

```text
/public/loopie/app/walkthrough-01.png
/public/loopie/app/walkthrough-02.png
/public/loopie/app/walkthrough-03.avif
/public/loopie/app/walkthrough-04.png
```

### Safety showcase phones

```text
69d72fafbdc208554ff2fe9d_e0ae3600100a7c457d6a326767460_MLW-.avif
69d72faf1a2bb3bd2fbae968_c8c057fd893186edf399e8652744f1_MLW-.png
69d72fafbb3069b1bc7dcabb_plans right_MLW-.avif
```

Rename to:

```text
/public/loopie/app/safety-left.avif
/public/loopie/app/safety-center.png
/public/loopie/app/safety-right.avif
```

### Group section

```text
69e93cf4095cfa920c8a7bb3_Group BG_MLW-.avif
69e93cf4095cfa920c8a7bb3_Group BG-p-1080_MLW-.webp
69e93cf4095cfa920c8a7bb3_Group BG-p-800_MLW-.webp
69e93cf4095cfa920c8a7bb3_Group BG-p-500_MLW-.webp
```

Use the AVIF as the primary source and keep responsive WebP fallbacks if useful.

### Activity icons

Map all 64×64 activity assets to semantic names:

```text
food-drinks
get-active
outdoor
night-out
coffee
walk
gym
dinner
drinks
sports
yoga
running
cycling
chill-chat
```

### Group icons

Map the 96×96 cocktail, tree, and muscle assets to semantic filenames.

### Safety icons and social portrait assets

Recover:

- location pin;
- shield;
- bell;
- handshake;
- dining capsule image;
- three overlapping circular portraits;
- star-struck emoji;
- Instagram icon.

### Form and brand assets

Recover:

- Hungarian flag;
- particles;
- party popper;
- arrows;
- mail;
- link;
- copy;
- copied checkmark;
- globe;
- favicon;
- webclip;
- Loopie SVG logo paths.

## 2. Recover the three Lottie files

Download or otherwise preserve these reference animation files in the project:

```text
https://cdn.prod.website-files.com/69d3aab0ce502c45682bfa47/69e5ef8a23f0d7d9d7313179_v1.json
https://cdn.prod.website-files.com/69d3aab0ce502c45682bfa47/69ea80a3e541e365c6223b98_tablet_lottie_loopie.json
https://cdn.prod.website-files.com/69d3aab0ce502c45682bfa47/69e617fcc2aefb158bed44be_mobile_v6.json
```

Store them as:

```text
/public/loopie/animation/story-desktop.json
/public/loopie/animation/story-tablet.json
/public/loopie/animation/story-mobile.json
```

Do not hotlink production-critical animation files if they can be stored locally.

## 3. Recover missing CSS background images

The Webflow export references these CSS backgrounds:

```text
https://cdn.prod.website-files.com/69d3aab0ce502c45682bfa47/69d76b51f2e90fc376e24c29_CTA%20BG.avif
https://cdn.prod.website-files.com/69d3aab0ce502c45682bfa47/69e9f2b062721d297040bd90_Bring%20BG.avif
```

Store local copies as:

```text
/public/loopie/photos/shared-moments-cta.avif
/public/loopie/photos/bring-loopie.avif
```

If an external asset cannot be legally or technically recovered, do not use an empty gradient placeholder. Use the dedicated generation prompts in Prompt 12 and document the replacement in `docs/reference-differences.md`.

## 4. Brand logo

Extract the original inline SVG logo into a reusable `BrandLogo` component with:

- white/light variant;
- bronze/dark variant;
- currentColor where practical;
- accessible label;
- no rasterized logo;
- no dependence on the Webflow embed.

Preserve the interlocking circular arrows mark and the Loopie wordmark proportions.

## 5. Optimization rules

- Keep transparency for phone renders and icons.
- Do not recompress app screenshots so aggressively that text becomes blurry.
- Generate AVIF/WebP derivatives for photographic assets.
- Generate an optimized hero poster.
- Preserve video color and natural skin tones.
- Record dimensions and intended use in `docs/asset-manifest.md`.
- Use meaningful file names.
- Remove duplicate `-p-500`, `-p-800`, and `-p-1080` files when the framework image pipeline makes them unnecessary.
- Do not remove originals until the cleaned versions are verified.

## 6. Component mapping

Create an asset map:

```ts
export const loopieAssets = {
  heroVideo: "/loopie/video/hero.mp4",
  heroPoster: "/loopie/video/hero-poster.webp",
  story: {
    desktop: "/loopie/animation/story-desktop.json",
    tablet: "/loopie/animation/story-tablet.json",
    mobile: "/loopie/animation/story-mobile.json",
  },
  walkthroughPhones: [...],
  safetyPhones: [...],
  activityIcons: {...},
  groupCards: {...},
  safetyIcons: {...},
  photos: {...},
  form: {...},
} as const;
```

Components must consume this map rather than embedding filenames.

## Acceptance checklist

- [ ] Every visible reference asset has a mapped local equivalent.
- [ ] No UI component references an opaque Webflow filename.
- [ ] Three responsive Lottie files are local.
- [ ] CTA and Bring backgrounds are present or documented replacements.
- [ ] Logo is a reusable SVG component.
- [ ] Hero poster exists.
- [ ] Image dimensions and aspect ratios prevent layout shift.
- [ ] Asset licenses/ownership assumptions are documented for production review.


---

# FILE: 03_NAVIGATION_AND_HERO.md

# Prompt 03 — Navigation and Full-Screen Video Hero

Implement the navigation and hero with pixel-conscious behavior. Preserve all existing foundation work.

## Navigation structure

Place the navigation absolutely over the hero.

Desktop:

- top and bottom padding: 24 px;
- max inner width: 84rem;
- left/right padding: 48 px;
- logo at left;
- navigation links centered/right;
- waitlist button at far right;
- transparent background;
- white logo and links;
- subtle top blur/gradient behind the nav without creating a visible rectangular bar.

The original top treatment behaves approximately as:

```css
height: 120px;
backdrop-filter: blur(5px);
mask-image: linear-gradient(to bottom, black 0%, black 50%, transparent 100%);
background: linear-gradient(
  to bottom,
  rgb(164 122 86 / .30) 0%,
  rgb(11 80 36 / 0) 100%
);
```

Status badge next to/below the logo:

- white at roughly 60–70% opacity;
- pill radius;
- 4 px vertical and 12 px horizontal padding;
- subtle inset highlight and warm shadow;
- text uses green-to-bronze gradient;
- Hungarian flag icon;
- copy: `Soon to be live in Budapest`.

Desktop navigation link gap is intentionally generous. Use responsive clamping instead of allowing overlap around 1024–1200 px.

## Mobile navigation

At `<= 991px`:

- show hamburger;
- hide desktop CTA outside the menu if space is insufficient;
- menu opens as a cream panel `#F9F4F1`;
- bottom corners: 24 px;
- 24 px/32 px internal padding depending on viewport;
- dark large links, approximately 28/34 px and bold;
- include the waitlist CTA within the menu;
- navbar logo switches to brown/bronze variant;
- remove the blur layer while open;
- hamburger’s three lines morph into an X;
- X uses a green-to-bronze gradient;
- close menu after an anchor is selected;
- lock focus within the menu when open;
- Escape closes and focus returns to the trigger.

At `<= 767px`, navigation side padding is 16 px.

## Hero layout

Hero requirements:

- full viewport height using `100svh` or a carefully handled `100dvh`;
- minimum height that prevents content collision on short screens;
- background video absolutely fills the section;
- `object-fit: cover`;
- muted, looped, autoplay, playsInline;
- poster fallback;
- dark bottom-biased overlay;
- content aligned near the bottom left;
- bottom padding: 48 px desktop;
- content above overlay and video.

Overlay:

```css
background: linear-gradient(
  180deg,
  transparent 0%,
  rgb(0 0 0 / .8) 90%
);
opacity: .3;
```

## Hero copy

```text
Up for something?

See who's free for coffee, walks, sports and more. Launching in Budapest.
```

Hero content:

- maximum readable width;
- 24 px gap between H1 and paragraph;
- 48 px gap before CTA;
- white text;
- H1 64/70 desktop;
- paragraph 18/26 desktop, medium;
- tablet H1 56/64;
- mobile H1 48/54 and paragraph 16/24.

CTA:

- `Join Waitlist`;
- green-to-bronze gradient;
- arrow icon;
- opens waitlist modal;
- desktop hover moves upward 5 px;
- on hover/focus, show a compact tooltip above the button:
  - warm light surface;
  - 16 px radius;
  - subtle warm shadow;
  - copy:
    `We’ll notify you when Loopie launches in Budapest this summer.`
    `1 month free. No card required.`
- do not show a hover-dependent tooltip on coarse-pointer mobile devices.

## Hero entrance motion

On initial load:

1. logo/nav elements fade and rise gently;
2. H1 fades and rises;
3. paragraph follows;
4. CTA follows.

Keep total entrance under roughly 900 ms. Do not animate the video scale continuously.

## Video resilience

- if autoplay is blocked, show poster without blank flash;
- if reduced motion is enabled, do not autoplay;
- if video fails, retain readable white text and poster;
- no context-menu blocking hacks are required;
- preload only metadata unless measured evidence supports more;
- video must not delay the largest contentful paint unnecessarily.

## Tests

Add tests for:

- hero text and CTA;
- CTA opens waitlist modal;
- mobile menu keyboard behavior;
- mobile menu close on link;
- logo variant changes;
- reduced-motion poster behavior;
- no duplicate `Join Waitlist` controls exposed to screen readers in the same layout state.

## Acceptance checklist

- [ ] Hero is visually full-screen.
- [ ] Video covers without distortion.
- [ ] Copy remains readable over every frame.
- [ ] Desktop and mobile navigation match their intended states.
- [ ] Status badge and flag are present.
- [ ] CTA and tooltip are accurate.
- [ ] No nav overlap at intermediate widths.
- [ ] Keyboard and reduced-motion behavior work.


---

# FILE: 04_SCROLL_STORY_LOTTIE.md

# Prompt 04 — Scroll-Scrubbed Responsive Lottie Story

Implement the tall sticky animation section immediately after the hero. This is a core storytelling scene and must not be replaced with a static blank area.

## Structure

```text
<section class="scroll-story">
  <div class="scroll-story__sticky">
    <responsive Lottie canvas/SVG>
  </div>
</section>
```

Desktop section height:

```css
height: 400svh;
```

Sticky stage:

```css
height: 100dvh;
min-height: 100dvh;
position: sticky;
top: 0;
overflow: hidden;
```

The animation should fill the viewport using an equivalent of:

```text
preserveAspectRatio="xMidYMid slice"
```

## Responsive animation sources

Use:

```text
/loopie/animation/story-desktop.json  for widths > 991px
/loopie/animation/story-tablet.json   for 768px–991px
/loopie/animation/story-mobile.json   for <= 767px
```

Do not load all three files eagerly. Select the active file based on a media-query hook and safely replace the animation on breakpoint changes.

## Scroll control

Use `lottie-web`.

- autoplay: false;
- loop: false;
- renderer: SVG;
- progressive loading where supported;
- map section scroll progress from 0 to 1;
- map progress to frame range 0 to totalFrames−1;
- call `goToAndStop(frame, true)`;
- update using requestAnimationFrame or Framer Motion scroll values;
- clamp progress;
- remove listeners and destroy the instance on unmount/source change.

Recommended progress calculation:

```ts
progress = clamp(
  (viewportTop - sectionTop) /
    (sectionHeight - viewportHeight),
  0,
  1
);
```

Use the framework’s scroll utilities where they are stable, but do not create a render on every raw scroll event.

## Loading state

Before JSON is ready:

- use the page background, not a spinner;
- reserve full viewport size;
- optionally render a subtle brand-colored soft shape;
- fade the animation in after readiness;
- do not cause layout shift.

## Reduced motion

For `prefers-reduced-motion: reduce`:

- reduce the section to approximately 100–120svh;
- show one representative frame or a static exported poster;
- ensure all downstream content follows normally;
- do not trap the user in 400vh of static scrolling.

## Error fallback

If the Lottie JSON fails:

- show a polished static fallback created from a representative frame;
- log one recoverable error in development;
- do not leave an empty 400svh area;
- record missing asset status in the release report.

## Performance

- load the desktop animation only after the hero is interactive, but before it enters the viewport;
- use IntersectionObserver to prepare the asset;
- avoid converting a large SVG to canvas unless testing proves SVG is too expensive;
- pause frame work when the section is well outside the viewport;
- test memory on mobile;
- do not inline hundreds of kilobytes of generated SVG into the React source.

## Visual fidelity

- background and crop must match the reference’s full-bleed composition;
- no browser scrollbars inside the stage;
- no visible jump when the sticky behavior begins or ends;
- section transition from hero should feel continuous;
- section transition into the off-white application walkthrough should be clean.

## Tests

- active animation source changes at breakpoints;
- frame mapping clamps correctly;
- reduced-motion fallback is selected;
- failed JSON renders a fallback;
- instance cleanup occurs;
- no multiple Lottie instances remain after resize.

## Acceptance checklist

- [ ] Scroll controls animation frame precisely.
- [ ] Desktop/tablet/mobile sources are used.
- [ ] Sticky stage remains stable.
- [ ] No blank 400vh section exists.
- [ ] Reduced motion is humane.
- [ ] Animation does not keep rendering far offscreen.
- [ ] No memory leak occurs after repeated breakpoint changes.


---

# FILE: 05_HOW_IT_WORKS.md

# Prompt 05 — “Loopie Helps You Change That” Product Walkthrough

Build the first off-white product section after the Lottie story.

## Section geometry

Desktop:

- background: `#F5F5F5`;
- vertical padding: 100 px;
- three-column grid:
  - left: 2fr;
  - center: 1fr;
  - right: 1.5fr;
- column gap: 64 px;
- vertically center the main areas.

At `<= 991px`:

- convert to a deliberate vertical composition;
- reduce gaps;
- center the phone;
- keep copy readable and activity pills wrapping naturally;
- do not reorder the numbered steps incorrectly.

## Left column

Heading:

```text
Loopie Helps You Change That
```

Use gradient emphasis on the intended phrase rather than making the entire section neon. Follow the reference hierarchy.

Below the heading:

```text
Open the map and see people nearby who are up for:
```

Then render 14 activity pills:

1. Food & Drinks
2. Get Active
3. Outdoor
4. Night Out
5. Coffee
6. A Walk
7. The Gym
8. Dinner
9. Drinks
10. Sports
11. Yoga
12. Running
13. Cycling
14. Chill & chat

Pill design:

- translucent white `rgba(255,255,255,.5)`;
- pill radius;
- 8 px vertical, 12 px horizontal;
- 4 px gap between icon and label;
- 20 px icon;
- 14/22 medium label;
- very soft shadow;
- wrap with 4 px gaps;
- animate into view with a light stagger.

Add `Join Waitlist` beneath the activity group using the shared gradient button and tooltip.

## Center column

Create a fixed-ratio phone stage.

Desktop:

- width around 280 px;
- aspect ratio approximately 9:19;
- center aligned.

Tablet:

- around 220 px.

Small mobile:

- around 70% of available width with a safe max width.

Stack the four supplied transparent phone images absolutely. Only one is active.

Transition:

- inactive: opacity 0;
- active: opacity 1;
- 400 ms fade;
- active image fades in with roughly 150 ms delay;
- no layout shift;
- preserve crisp UI text.

## Right column

Render four absolute/stacked step panels tied to the active phone:

1. Number 1 — `See who’s around`
2. Number 2 — `See what they’re doing.`
3. Number 3 — `Join, or drop your own.`
4. Number 4 — `Next time invite them again`

Number badge:

- 26 px circle;
- green-to-bronze gradient;
- white number;
- centered.

Step title:

- 36/44 desktop;
- dark neutral;
- zero default heading margins.

Transitions:

- next active panel starts at `translateY(60px)` and opacity 0;
- active becomes Y 0 and opacity 1;
- previous moves to `translateY(-50px)` and opacity 0;
- 350 ms premium ease.

On tablet/mobile, the right stage has a stable minimum height so the page does not jump when titles change.

## Playback behavior

Use IntersectionObserver on the phone stage.

- threshold: approximately 0.3;
- when entering, reset to step 1 and start;
- advance every 3000 ms;
- loop from 4 to 1;
- when leaving, clear interval and reset internal index;
- pause when document is hidden;
- reduced motion: show step 1 by default and provide manual step buttons or a non-animated stacked alternative.

Do not create multiple intervals on repeated intersection changes.

## Accessibility

- active phone image has descriptive alt;
- inactive images use `aria-hidden`;
- step change should not aggressively announce every three seconds;
- expose a static textual list to assistive technology;
- automatic animation must pause under reduced motion;
- buttons remain reachable.

## Tests

- activity list includes all 14 items;
- interval starts and stops correctly;
- phone and step index remain synchronized;
- no duplicate intervals;
- reduced motion works;
- waitlist CTA opens modal.

## Acceptance checklist

- [ ] Three-column desktop composition is balanced.
- [ ] Four phone screens crossfade smoothly.
- [ ] Four step panels remain synchronized.
- [ ] All activity pills and icons exist.
- [ ] Mobile layout has no clipped phone or text.
- [ ] Section uses the original warm editorial aesthetic.


---

# FILE: 06_GROUP_CHOICE_SCROLL_SECTION.md

# Prompt 06 — “1:1 or Group — Your Call” Sticky Cinematic Section

Implement the full-bleed group-choice section after the app walkthrough.

## Background and section geometry

Desktop:

- section height: `200svh`;
- content stage: `100svh`, sticky at top;
- full-bleed supplied group photograph;
- `object-fit: cover`;
- object position near top center;
- dark overlay `rgba(0,0,0,.20)`;
- content container stays above background.

At `<= 991px`:

- section height: approximately `250vh`;
- cards move horizontally instead of vertically;
- keep the sticky stage;
- prevent horizontal document overflow.

## Left heading

Place near the lower left of the sticky stage:

```text
1:1 or Group —
Your Call
```

- white;
- 48/54 desktop;
- 12 px line gap;
- bottom padding around 48 px;
- apply the light gold-to-mint gradient only to `Your Call`.

On mobile center the heading and reduce to the shared mobile section size.

## Right card track

Desktop:

- width approximately 45%;
- full viewport-height sticky area;
- card track positioned near the bottom;
- three cards stacked vertically;
- 48 px gap;
- initial transform leaves only a teaser visible;
- scrolling moves the card track upward to reveal all three.

Each card:

- translucent warm white, roughly `rgba(255,255,255,.80)`;
- backdrop blur around 32 px;
- radius 24 px;
- padding 48 px desktop;
- inset white highlight;
- no harsh dark shadow;
- icon sits inside a solid white rounded square;
- 48 px icon desktop;
- eyebrow 16/24;
- title 36/44;
- gradient only on the first title line.

Content:

Card 1:
```text
Some days you want:
A quick coffee
or post-work drinks
```

Card 2:
```text
Other days:
A walk in the park
or a sunset run
```

Card 3:
```text
Or maybe:
Someone for tennis
or a gym buddy
```

Use the cocktail, tree, and muscle assets.

## Desktop scroll mapping

Use section progress 0–1.

Calculate:

- `cardHeight`;
- visible teaser start approximately `cardHeight * 1.5`;
- translateY from teaser start to 0 as progress moves 0–1.

The original behavior is conceptually:

```ts
const progress = clamp(
  -sectionRect.top / (sectionHeight - viewportHeight),
  0,
  1
);
const visibleStart = cardHeight * 1.5;
const translateY = visibleStart - progress * visibleStart;
```

Implement using motion values or a requestAnimationFrame-coalesced passive listener.

## Tablet/mobile scroll mapping

At `<= 991px`:

- card track becomes a horizontal flex row;
- cards have min-width 80% on tablet and 100% on mobile;
- calculate the true scrollable width;
- delay motion until approximately 10% section progress;
- map remaining progress to translateX from 0 to negative total scroll distance;
- do not create a nested horizontal scrollbar.

At `<= 767px`:

- 16 px gap;
- cards use 20 px padding;
- icon around 28 px;
- card title 28/34.

## Reduced motion

Display all three cards in a normal vertical stack on a static photograph. Remove the 200–250vh scroll choreography.

## Accessibility

- background image receives meaningful alt only if rendered as `<img>`;
- if implemented as decorative background, expose no redundant alt;
- all card content remains in DOM and readable regardless of scroll state;
- do not rely on motion to reveal essential text.

## Tests

- desktop progress maps to vertical movement;
- tablet progress maps to horizontal movement;
- no horizontal page overflow;
- reduced-motion stack is visible;
- resize recalculates dimensions;
- all cards remain reachable.

## Acceptance checklist

- [ ] Full-screen photographic impact is retained.
- [ ] Heading remains readable.
- [ ] Cards use warm translucent surfaces.
- [ ] Desktop vertical and mobile horizontal choreography work.
- [ ] No scroll jank or overflow occurs.
- [ ] Reduced-motion layout is complete.


---

# FILE: 07_SAFETY_AND_PHONE_SHOWCASE.md

# Prompt 07 — Safety, Social Proof, and Three-Phone Showcase

Build the `#safety` section after the group-choice section.

## Section layout

- background: `#F5F5F5`;
- 100 px vertical padding desktop;
- 72 px tablet;
- 48 px mobile;
- centered vertical layout;
- 48 px gap between top copy and phone composition.

## Editorial heading composition

Build three visual rows rather than one plain H2:

Row 1:
```text
Casual Plans   [small wide dining image]
```

Row 2:
```text
[three overlapping circular portraits]   Real People
```

Row 3:
```text
Right Now   [star-struck icon]
```

Details:

- main section text: 48/54 desktop;
- dining image: about 120×52 px in the rendered layout;
- avatars: 52 px circles, overlap by about 20 px;
- star-struck icon: about 48 px;
- `Right Now` uses green-to-bronze gradient;
- preserve natural line wrapping on mobile;
- reveal rows and inline imagery with a subtle stagger.

Below heading:

- glass/outlined `Follow On Instagram` button with Instagram icon;
- gradient `Join Waitlist` button with arrow and tooltip;
- buttons wrap on narrow screens.

## Phone composition

Desktop stage:

- width around 640 px;
- relative grid;
- three phones;
- left and right behind;
- center phone above and centered;
- aspect ratio around 9:19.5;
- center width around 45%;
- left/right positioned symmetrically;
- large blurred warm circle behind the phones:
  - `#E0C6B4`;
  - around 750×750 px;
  - blur about 250 px;
  - pointer-events none.

Do not apply `object-fit: cover` in a way that crops transparent phone frames.

Entrance:

- left phone rises/fades from left;
- center phone rises/fades;
- right phone rises/fades from right;
- keep motion controlled.

## Floating safety cards

Place four cards around the phone composition on desktop:

Top left:
```text
Approximate Location Only
Your exact location stays private.
```

Bottom left:
```text
Safe for Women
Meetups are intentional, not random.
```

Top right:
```text
No Annoying Notifications
You control your notifications anytime.
```

Bottom right:
```text
Intentional connections only
You can’t receive random messages or friend requests, you control it.
```

Card design:

- `rgba(255,255,255,.60)`;
- backdrop blur 32 px;
- radius 12 px;
- padding 24 px;
- warm multi-layer shadow;
- icon in a small white rounded square;
- 28 px icon;
- title 20/30;
- body 16/24.

Approximate desktop positions relative to the phone stage:

- top-left: 5% top, -27.5% left;
- bottom-left: 5% bottom, -37.5% left;
- top-right: 5% top, -30% right;
- bottom-right: 5% bottom, -40% right.

Adapt positions based on actual card width; do not let text clip.

## Tablet/mobile recomposition

At `<= 991px`:

- phone stage becomes a two-row or layered composition;
- left/right phone widths around 65%;
- center around 35%;
- floating cards move into a normal vertical list below the phones;
- list width around 80%, centered;
- 24 px gaps;
- remove absolute offsets.

At `<= 767px`:

- cards use full width;
- 12 px gaps;
- phone composition remains legible;
- avoid tiny app screenshots.

At `<= 479px`:

- left/right phone source width can reach 100%;
- center around 50%;
- verify no accidental horizontal overflow.

Navigation links labelled Safety should target `#safety` on desktop and may target the visible card list anchor on smaller layouts only if it improves landing position.

## Accessibility

- meaningful alt for visible app screens;
- decorative portraits can have concise alt or empty alt based on role;
- Instagram link opens safely with `rel="noopener noreferrer"`;
- safety content is real text, not baked into images;
- reduced motion shows final composition.

## Tests

- four safety cards render exact copy;
- correct target anchor behavior by breakpoint;
- phone stage does not overflow;
- buttons work;
- reduced motion;
- external Instagram attributes.

## Acceptance checklist

- [ ] Editorial heading matches the reference composition.
- [ ] Three phones form a layered premium centerpiece.
- [ ] Four cards frame the phones on desktop.
- [ ] Cards become a readable list on mobile.
- [ ] Warm glow and glass effects are subtle.
- [ ] Safety copy remains accessible.


---

# FILE: 08_CTA_FAQ_CITY_AND_FOOTER.md

# Prompt 08 — Shared-Moments CTA, FAQ, City CTA, and Footer

Implement the remaining visible page sections before the modals.

# A. “Moments are better, when shared” CTA

Create an inner full-width photographic panel inside the normal page container.

Panel:

- supplied CTA background image;
- background cover and centered;
- radius 24 px;
- 100 px vertical padding desktop;
- relative positioning;
- green/bronze vertical overlay:
  `linear-gradient(#a47a5680, #0b5024 90%)`;
- overlay opacity around 0.5;
- content centered above overlay.

Heading:

```text
Moments are better,
when shared
```

- white;
- centered;
- 48/54 desktop;
- mobile can increase to 48/54 for impact if it still fits;
- include the supplied decorative underline/swoosh SVG around `when shared`;
- use separate desktop/mobile SVG sizing if needed.

CTA:

- translucent white glass button;
- `Join Waitlist`;
- arrow;
- hover translateY(-5px);
- opens waitlist modal.

Do not replace the photographic CTA with a plain gradient rectangle.

# B. FAQ

Section:

- 100 px vertical padding desktop;
- overflow visible;
- warm blurred circle near bottom-left;
- two-column grid desktop:
  - left approximately .75fr;
  - right 1fr;
  - large visual gap, up to 216 px on wide screens.

Left column is sticky near top:

```text
FAQs
In case of any other questions, contact us via email
support@loopie.com
```

Support link:

- mail icon;
- gradient text;
- hover moves 5 px to the right.

Right column:

- seven accordions;
- 24 px vertical gap;
- bottom border `#BDE1B3`;
- 16 px bottom padding;
- question 24/32 bold;
- plus icon composed from two 1 px lines;
- vertical line rotates/fades to create minus state;
- answer 16/24 medium;
- smooth height animation;
- only one or multiple open states may be supported, but behavior must be consistent and keyboard accessible.

Use the complete reference answers:

## 1. Where is Loopie available right now?

Loopie is currently being tested for launch in Budapest and should be available on App Store and Google by end of August 2026. It’s our founders’ favourite city and the perfect place to make sure Loopie truly works before we bring its spontaneous meetup magic elsewhere.

If you don’t see your city yet, you can join early and help kickstart it locally.

Include a `Propose New City` inline gradient action.

## 2. Is it actually free to start?

Yes. You get 30 days of early access to the map, with no card needed. After that, you choose what works for you:

1. Enjoying Loopie? Continue for a small community fee of 2,490 HUF monthly (around €6), or save 33% by buying a six-month subscription with a 1,665 HUF monthly equivalent.
2. Not ready yet? You can still browse the map for free. Joining and creating meetups will just be limited.

Render prices from config.

## 3. How does the map work?

It’s a live view of your immediate area. Pins show active 1:1 invites and group hangouts in:

- 🍕 Food
- 🌲 Outdoors
- 🎾 Sports
- 🪩 Night Out

You see the location, time, and who’s already going.

## 4. What happens after 30 days of early access?

We’ll remind you a few days before your trial ends, so you have plenty of time to decide.

If you choose not to subscribe, you’ll automatically move to the Free Tier, where you can still explore the map and join or create a limited number of meetups.

## 5. Is this just another ghost town app?

In the early days, you might not see thousands of people on the map, and that’s okay.

We focus on real, kind people and genuine meetups, not fake accounts just to make the app look busy.

See what’s happening nearby, or drop a pin yourself. Sometimes, all it takes is one person to go first.

## 6. Is it safe?

All meetups happen in public places and your exact location is never shared. Users can enable approximate location in Privacy & Security settings.

Users can:

- chat before joining;
- block anyone instantly;
- report anything that feels off.

Women can choose to be visible only to the same gender. Safety reports are taken seriously and respect is mandatory on Loopie.

## 7. How do I cancel?

Users should check subscription details in the App Store or Google Play at least 24 hours before renewal. Loopie also sends a reminder near the end of early access.

Keep the spirit and facts of the reference. Put time-sensitive/legal copy in content config so product owners can review it.

At `<= 767px`, FAQ becomes a single column and sticky positioning is removed.

# C. Bring Loopie to the next City

Create a full-bleed background section after FAQ.

Desktop:

- cover background image;
- content near lower left;
- substantial top padding around 380 px;
- bottom padding 100 px;
- vertical overlay:
  `linear-gradient(180deg, #a47a5680, #274b1d 90%)`;
- white text.

Content:

```text
[globe icon] Bring Loopie
to the next City

Add your city — and help us kickstart spontaneous plans where you live.

Propose New City
```

- `Bring Loopie` uses light gold-to-mint gradient;
- glass button opens city modal;
- mobile background position and padding are adjusted so text stays readable.

# D. Footer

Background remains off-white.

Desktop:

- 100 px top padding;
- 48 px bottom;
- logo/contact/social area;
- link columns;
- generous but controlled gaps;
- 1 px muted divider;
- bottom row with copyright and legal links.

Footer content:

- Loopie logo;
- Contact;
- support email;
- Social / Instagram;
- About Loopie links;
- Contribute links;
- Cookie Settings;
- copyright;
- privacy;
- terms.

Mobile:

- stack columns;
- 24 px gaps;
- bottom row vertical;
- legal links remain easy to tap.

## Tests

- CTA opens waitlist.
- FAQ supports keyboard and ARIA.
- FAQ copy is generated from config.
- city CTA opens city modal.
- footer cookie settings reopens banner.
- anchor links land correctly.
- no time-sensitive text is duplicated.

## Acceptance checklist

- [ ] CTA is photographic and premium.
- [ ] Seven complete FAQ items exist.
- [ ] FAQ left column is sticky on desktop.
- [ ] City section has full-bleed visual impact.
- [ ] Footer contains every reference link group.
- [ ] All CTAs connect to the correct modal.


---

# FILE: 09_MODALS_FORMS_AND_BACKEND.md

# Prompt 09 — Accessible Modals, Dynamic Forms, Validation, and Backend Persistence

Implement both production-ready conversion modals. Preserve the page and all existing interactions.

## Shared modal behavior

Both modal wrappers:

- fixed inset 0;
- z-index above nav and animation;
- dark overlay `rgba(0,0,0,.4)`;
- backdrop blur 4 px;
- centered content;
- card background `#F5F5F5`;
- soft green-to-off-white top gradient;
- 1 px `#D7EDD2` border;
- 16 px radius;
- max height 90–95vh;
- internal scrolling;
- desktop padding 32×48 px, large desktop 48 px vertical;
- mobile 24×16 px;
- animated opacity plus translateY(20px);
- close icon at top-right;
- focus trap;
- body scroll lock;
- Escape closes;
- clicking overlay closes only when safe;
- focus returns to triggering control;
- URL hashes `#waitlist-signup` and `#propose-new-city` may deep-link directly to modals.

Do not let wheel events scroll the page behind the modal.

## Form visual system

Input wrapper:

- white;
- 1 px `#D8DCE7`;
- 12 px radius;
- 12 px vertical and 16 px horizontal padding;
- leading icon;
- focus border `#1E2330`;
- error border `#B3261E`;
- no browser-default oversized outlines.

Labels:

- 14/22;
- semibold;
- dark neutral.

Errors:

- 12 px;
- medium;
- red;
- tied with `aria-describedby`;
- shown only after relevant interaction or submit.

Submit:

- full-width gradient pill;
- loading state;
- disabled state;
- no duplicate submission.

## A. Waitlist modal

Header:

- particles icon;
- title with gradient phrase:
  `Be first in line`;
- description:
  `Join Budapest’s waitlist and we’ll notify you as soon as we launch.`
- Hungarian flag inline.

Fields:

1. Full Name
   - required;
   - placeholder `Enter your full name`.

2. Notification channels
   - label `Notify me when Loopie is available`;
   - custom checkbox `Notify me on WhatsApp`;
   - custom checkbox `Notify me by email`;
   - at least one channel required.

3. WhatsApp phone field
   - initially hidden;
   - appears only when WhatsApp selected;
   - default country Hungary;
   - country search;
   - show country flag and dial code;
   - validate with `libphonenumber-js`;
   - normalize to E.164;
   - maximum 15 digits;
   - errors:
     - Phone number is required
     - Invalid country code
     - Too short
     - Too long
     - Invalid number

4. Email field
   - initially hidden;
   - appears only when email selected;
   - placeholder `Enter your email`;
   - validate with Zod.

5. Optional updates toggle
   - `Send me occasional updates about Loopie`.

6. Honeypot
   - visually hidden from humans;
   - `username` or another non-obvious field;
   - server checks it.

Submit label:

```text
Join Waitlist
```

Footer copy:

```text
By continuing, you agree to our Privacy Policy
This site is protected by reCAPTCHA.
```

### Waitlist success state

- party popper icon;
- `You’re in!`;
- `Thanks for joining the waitlist.`;
- Instagram action;
- share area:
  - `Invite your friend`;
  - link icon;
  - `https://loopiesocial.app`;
  - copy button;
  - after copying, text becomes `Copied` and icon becomes a check for 2 seconds.

### Waitlist failure state

```text
Oops! Something went wrong while submitting the form.
```

Include retry without erasing valid user input.

## B. City proposal modal

Header:

- globe icon;
- gradient `Bring Loopie`;
- second line `to the next City`;
- description:
  `Add your city — and help us kickstart spontaneous plans where you live.`

Fields:

1. City
   - required;
   - placeholder `Pick your city`;
   - Google Places autocomplete restricted to cities;
   - store formatted address and available place ID/country metadata;
   - typed text without choosing a suggestion is invalid;
   - error `Please enter a city` or `Please select a city from the suggestions`.

2. Notification channel section
   - `Notify me when Loopie is available in my city`;
   - same WhatsApp/email behavior as waitlist.

3. Optional updates toggle.

Submit:

```text
Keep me updated
```

Secondary Instagram action:

```text
Follow On Instagram
```

### City success state

- party popper;
- `You’re in!`;
- `We’ll let you know as soon as Loopie is available in your city.`;
- same Instagram and copy/share controls.

## Validation architecture

Create Zod schemas for client and server.

Do not trust the client. The server must validate:

- required name/city;
- at least one channel;
- required selected channel values;
- email format;
- E.164 phone;
- autocomplete selection metadata;
- updates boolean;
- honeypot empty;
- timestamp/time-to-submit threshold;
- payload size.

## Database design

Create migration SQL for at least:

```sql
create table waitlist_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  notify_whatsapp boolean not null default false,
  notify_email boolean not null default false,
  phone_e164 text,
  email text,
  updates_opt_in boolean not null default false,
  launch_city text not null default 'Budapest',
  source text not null default 'landing-page',
  consent_version text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  created_at timestamptz not null default now()
);

create table city_requests (
  id uuid primary key default gen_random_uuid(),
  city_display_name text not null,
  formatted_address text not null,
  place_id text,
  country_code text,
  notify_whatsapp boolean not null default false,
  notify_email boolean not null default false,
  phone_e164 text,
  email text,
  updates_opt_in boolean not null default false,
  source text not null default 'landing-page',
  consent_version text,
  created_at timestamptz not null default now()
);
```

Add sensible unique/deduplication indexes without preventing legitimate multi-channel entries. Use a server-side repository and service role. RLS should deny arbitrary public table access.

## Abuse protection

- rate limit by hashed IP plus route;
- honeypot;
- minimum time-to-submit;
- optional reCAPTCHA token verification;
- do not log raw phone/email;
- generic client-facing errors;
- structured server logs with request ID.

## API response contract

Use consistent JSON:

```ts
type SubmissionResponse =
  | { ok: true; submissionId: string }
  | {
      ok: false;
      code:
        | "VALIDATION_ERROR"
        | "RATE_LIMITED"
        | "BOT_SUSPECTED"
        | "PROVIDER_ERROR";
      fieldErrors?: Record<string, string[]>;
      message: string;
    };
```

## Tests

Unit:

- schemas;
- channel requirements;
- phone normalization;
- city-selection rule;
- honeypot/time rule.

Component:

- dynamic field visibility;
- errors;
- focus movement;
- copy state;
- success/failure.

E2E:

- waitlist by email;
- waitlist by WhatsApp;
- both channels;
- city proposal;
- invalid free-typed city;
- rate-limit response;
- keyboard-only modal use.

## Acceptance checklist

- [ ] Forms submit to a real server endpoint.
- [ ] Data persists.
- [ ] Dynamic fields and validation work.
- [ ] Modals are keyboard accessible.
- [ ] Phone defaults to Hungary.
- [ ] City must come from autocomplete.
- [ ] Success and failure states are complete.
- [ ] Bot and rate-limit controls exist.
- [ ] No secret reaches client bundles.


---

# FILE: 10_COOKIE_ANALYTICS_AND_SEO.md

# Prompt 10 — Cookie Consent, Analytics Gating, Event Tracking, and SEO

Implement privacy-aware analytics and complete search/social metadata. Preserve all existing work.

## A. Cookie banner

Design a compact, polished banner that appears only when consent is unknown.

Visible copy:

```text
We use cookies to improve your experience and analyze site traffic.
By clicking "Accept", you consent to our use of analytics cookies.
```

Actions:

- `Cookie Policy`
- `Reject non-essential`
- `Accept all`

Behavior:

- store consent version and state;
- states: unknown, accepted, rejected;
- animate opacity and translateY(20px), 300 ms;
- no analytics before accepted;
- rejecting must prevent future analytics loading;
- footer `Cookie Settings` reopens the banner;
- users can change a previous decision;
- update consent version cleanly when policy changes;
- do not use dark patterns;
- keyboard accessible;
- mobile layout does not cover modal buttons or essential content.

A localStorage implementation is acceptable for the landing page, but structure it so a CMP can replace it.

## B. Analytics loader

Create one consent-aware analytics module.

Potential providers:

- GA4;
- Microsoft Clarity;
- Meta Pixel;
- reCAPTCHA.

Rules:

- do not insert non-essential scripts until accepted;
- guard against double loading;
- expose provider-neutral event functions;
- cleanly disable providers after rejection/change;
- never call `gtag` or `fbq` blindly;
- development mode can log events without sending.

Events:

```text
page_view
cta_click
waitlist_open
city_modal_open
waitlist_submit_success
waitlist_submit_error
city_submit_success
city_submit_error
instagram_click
faq_open
cookie_accept
cookie_reject
share_copy
```

Attach useful but non-sensitive properties:

- CTA location;
- selected notification channel count;
- launch city;
- FAQ question ID;
- campaign/UTM.

Do not send names, phone numbers, email addresses, or city input text to analytics.

## C. Meta Lead event

Send Meta `Lead` only after the server confirms a valid waitlist submission. Prevent double firing.

## D. SEO metadata

Create metadata from `siteConfig`.

Title:

```text
Loopie App | Find Your People Nearby in Budapest
```

Description:

```text
Meet people nearby for coffee, walks, workouts, or spontaneous plans. No swiping — just real connections in real life. Join Loopie.
```

Include:

- canonical;
- Open Graph title/description/image;
- Twitter summary large image;
- favicon and Apple webclip;
- viewport;
- theme color;
- robots;
- sitemap.

Use a purpose-built OG image, not a low-resolution phone screenshot.

## E. Structured data

Generate JSON-LD from typed content.

### WebPage

- name;
- URL;
- language;
- description;
- about SoftwareApplication.

### SoftwareApplication

- name Loopie;
- category SocialNetworkingApplication;
- operating system iOS, Android;
- free-access/offer information;
- feature list:
  - live map showing nearby people;
  - join 1:1 or group meetups;
  - coffee, sports, outdoor, food and drinks;
  - approximate location;
  - no random messages/friend requests;
  - public meetup locations;
- provider;
- support email;
- social profile.

### FAQPage

Generate from the exact seven UI questions and answers.

Critical:

- do not hand-maintain a separate FAQ schema;
- `earlyAccessDays` must be 30 in both UI and schema unless product config changes;
- no old 60-day answer may remain;
- strip React markup to valid plain text for JSON-LD.

## F. Semantic HTML

- one H1;
- correct H2/H3 hierarchy;
- main/section/nav/footer landmarks;
- meaningful link text;
- form labels;
- FAQ buttons;
- no SEO text hidden only for crawlers.

## G. Security

- CSP compatible with selected analytics and Google Places;
- no inline script requirement where avoidable;
- use nonces if the deployment requires inline JSON-LD;
- sanitize structured data serialization;
- protect API routes from cross-origin abuse.

## Tests

- no provider script before consent;
- scripts load once after accept;
- reject persists;
- settings reopen;
- no PII event properties;
- JSON-LD validates structurally;
- UI FAQ count equals schema count;
- 30-day value is consistent;
- canonical and OG metadata exist.

## Acceptance checklist

- [ ] Consent is honest and reversible.
- [ ] Analytics is fully gated.
- [ ] Events do not contain PII.
- [ ] Meta Lead fires only after success.
- [ ] Metadata and OG are complete.
- [ ] WebPage, SoftwareApplication, and FAQPage schemas are valid.
- [ ] No 30/60-day mismatch remains.


---

# FILE: 11_RESPONSIVE_MOTION_AND_ACCESSIBILITY.md

# Prompt 11 — Responsive Refinement, Motion Choreography, and Accessibility

Perform a dedicated refinement pass across the entire page. Do not add new product sections. Preserve functionality.

## 1. Breakpoint-by-breakpoint composition

Test at minimum:

```text
390×844
430×932
768×1024
991×900
1024×768
1280×800
1440×900
1920×1080
```

### >= 1440

- modal titles can reach 48 px;
- use full 80rem container;
- preserve generous whitespace;
- do not let FAQ gap become absurdly large on ultrawide screens.

### <= 991

- navigation becomes mobile menu;
- app walkthrough stacks;
- desktop Lottie switches to tablet;
- group cards become horizontal;
- safety cards become a normal list;
- section padding around 72 px.

### <= 767

- container padding 16 px;
- mobile Lottie;
- section padding around 48 px;
- section headings 36/44;
- FAQ one column;
- footer stacked;
- modal padding 24×16;
- group cards full width;
- touch targets 44 px.

### <= 479

- bring section uses mobile-specific crop and large top image space;
- phone compositions remain legible;
- modal max height around 90%;
- no CTA text wraps awkwardly;
- no clipped status badge.

## 2. Motion audit

Create a page-level motion map.

### Initial load

- navbar;
- hero heading;
- hero paragraph;
- hero CTA.

### Scroll reveals

Use restrained reveals for:

- app heading;
- activity pills;
- app CTA;
- group heading;
- safety heading rows;
- phone composition;
- safety cards;
- main CTA;
- FAQ left and accordion rows;
- city CTA;
- footer.

Avoid applying identical fade-up to every tiny icon. Group related elements.

### Continuous motion

Only:

- Lottie scrub;
- app phone auto-cycle;
- group card scroll;
- mobile menu morph;
- accordion open/close.

Do not add background parallax to every section.

## 3. Reduced motion

Under `prefers-reduced-motion`:

- hero uses poster and does not autoplay;
- Lottie uses a static frame and shorter section;
- app phone auto-cycle stops;
- group section becomes a normal card layout;
- reveal elements are immediately visible;
- accordion uses minimal/no height animation;
- smooth scrolling is disabled;
- essential states remain fully visible.

## 4. Accessibility audit

### Navigation

- nav label;
- hamburger has dynamic accessible name;
- menu state exposed;
- anchors receive focus;
- no focus behind open menu.

### Modals

- `role="dialog"`;
- `aria-modal="true"`;
- labelled title;
- described by intro;
- focus trap;
- Escape;
- close button label;
- focus return;
- scroll lock;
- errors announced;
- success announced politely.

### Forms

- native labels or explicit label association;
- channel controls are actual checkboxes;
- custom visuals do not replace semantics;
- dynamic fields preserve logical tab order;
- required state communicated;
- phone country selector keyboard usable;
- Google autocomplete keyboard usable;
- no color-only errors.

### FAQ

- each question is a button;
- `aria-expanded`;
- answer referenced with `aria-controls`;
- plus icon decorative;
- Enter and Space work;
- focus remains stable.

### Contrast

Verify:

- white over hero video;
- gradient text fallback;
- muted footer labels;
- glass cards;
- error text;
- focus rings.

Target WCAG 2.2 AA.

## 5. Touch and viewport behavior

- minimum target 44×44;
- account for iOS safe areas;
- no `100vh` mobile jump without fallback;
- no fixed banner overlapping focused form fields;
- modal input remains visible when keyboard opens;
- smooth anchor offset accounts for nav.

## 6. Content robustness

Test:

- longer city names;
- translated copy expansion up to 30%;
- FAQ answers with multiple paragraphs;
- missing image fallback;
- slow video;
- Lottie JSON failure;
- disabled JavaScript core content visibility where practical.

## 7. Performance motion budget

- no more than one active continuous scroll loop per scene;
- use passive listeners;
- requestAnimationFrame;
- clean up observers/intervals;
- avoid expensive blur on many moving elements;
- avoid animating box-shadow;
- use transform and opacity;
- measure mobile long-task behavior.

## Tests

- axe or equivalent accessibility checks;
- keyboard-only E2E;
- reduced-motion E2E;
- viewport matrix screenshots;
- no horizontal overflow assertion;
- focus return tests;
- modal keyboard visibility where feasible.

## Acceptance checklist

- [ ] Every breakpoint is intentionally composed.
- [ ] Motion map is coherent.
- [ ] Reduced-motion experience is complete.
- [ ] WCAG 2.2 AA issues are repaired.
- [ ] No horizontal overflow exists.
- [ ] Mobile viewport and keyboard behavior are stable.
- [ ] Animation cleanup is verified.


---

# FILE: 12_IMAGE_AND_VIDEO_GENERATION_PROMPTS.md

# Prompt 12 — Fallback Image and Video Generation Prompts

Use these only when an original supplied asset is missing, unusable, or not licensed for the new implementation. Generated replacements must look like one coherent campaign, not unrelated stock images.

## Shared visual direction for all photography

- contemporary Budapest;
- warm, natural human connection;
- diverse adults approximately 23–40;
- candid, documentary-style behavior;
- realistic skin texture;
- natural wardrobe;
- muted green, cream, bronze, dusty rose, and denim palette;
- premium commercial photography without over-retouching;
- no dating-app seduction cues;
- no phones dominating the scene unless requested;
- no fake text, logos, watermarks, or UI;
- no excessive bokeh;
- no plastic AI faces;
- physically correct hands and glasses;
- authentic Central European environment.

---

## Asset A — Hero video

Create a seamless 10–12 second cinematic website hero video, 16:9, 4K master, showing three adult friends having a relaxed spontaneous conversation in a green Budapest park during a bright but soft spring afternoon. One woman stands casually beside a low stone wall while a Black woman and an East Asian man sit on the wall. They hold reusable drinks, laugh naturally, listen, and react to one another. The camera is mostly locked with subtle human movement, mild breeze in clothing and trees, and realistic background activity. Frame wide enough for full-screen responsive cropping. Preserve darker visual space in the lower-left area so white landing-page text remains readable. Natural documentary commercial style, realistic motion, no dramatic slow motion, no visible brands, no text, no watermarks, no exaggerated smiles, no romantic framing, no uncanny faces or hands.

Negative direction: artificial studio lighting, hyper-saturated grass, influencer posing, shallow-focus portrait look, camera shake, fast cuts, zooms, drone footage, duplicated people, distorted cups, text.

Deliver:
- 3840×2160 master;
- optimized MP4 H.264;
- optional WebM;
- representative poster WebP.

---

## Asset B — Group section background

Create a cinematic horizontal 2880×1536 photograph of a small diverse group of young adults socializing outdoors in Budapest, seated casually with non-alcoholic drinks and snacks in a leafy urban park or garden. Candid friendship, warm late-afternoon light, natural body language, premium lifestyle campaign quality. Keep the lower-left and central-left areas relatively uncluttered for large white heading text. The image must survive full-viewport `object-fit: cover` cropping on desktop and mobile. Rich but restrained greens, warm bronze skin highlights, cream and denim clothing. No brand logos, no text, no posed stock-photo grin, no romantic couple focus, no distorted hands or glassware.

---

## Asset C — Shared-moments CTA background

Create a wide premium lifestyle photograph intended as the background of a rounded website CTA panel. A group of friends share a simple real-life moment outdoors after work—laughing over coffee or casual drinks at golden hour in Budapest. Composition should be immersive but not busy, with central negative space for two lines of large white text. Natural greens and warm bronze tones, slightly darker exposure so overlay text remains legible. Documentary commercial photography, realistic faces and hands, no visible logos, no text, no watermarks. 2400×1200 or wider.

---

## Asset D — Bring Loopie background

Create a tall-responsive website background photo for a section titled “Bring Loopie to the next City.” Show an atmospheric Budapest urban park or riverside at dusk with small groups of people meeting naturally in the middle/background. The image should communicate a city coming alive through spontaneous connections. Leave strong dark negative space in the lower-left for white copy and a CTA. Use deep green, warm bronze, muted city lights, and realistic twilight. The image must crop gracefully from wide desktop to tall mobile. No skyline cliché, no tourist postcard treatment, no text, no logos, no neon cyberpunk colors.

---

## Asset E — Dining capsule image

Create a realistic horizontal lifestyle photo of three or four adults sharing food at an outdoor garden restaurant, warm daylight, candid conversation, lush greenery. Designed to be cropped into a compact rounded capsule approximately 2.3:1. Faces and table details must remain recognizable at 120×52 px. No logos, no text, no awkward cut-off faces.

---

## Asset F — Three circular profile portraits

Generate three separate, visually coherent profile portraits of adult women for small overlapping circular avatars:

1. woman in a mustard-yellow top, neutral blue-grey background;
2. smiling woman with dark wavy hair and warm natural light;
3. woman in a patterned colorful blouse with expressive but natural pose.

Head-and-shoulders, centered, realistic, clean background, commercial app profile quality, no glamour retouching, no text. Each at least 1024×1024 and safe for circular crop.

---

## Asset G — App walkthrough screens

Design four cohesive iOS app screens for a real-life spontaneous meetup app named Loopie. Use a warm cream base, dark neutral typography, green and bronze accents, soft map styling, rounded but not childish cards, realistic Budapest locations, and inclusive user avatars.

Screen 1: live map with nearby people and activity pins.
Screen 2: activity detail with time, public location, attendees, and join action.
Screen 3: create a spontaneous plan with category, time, approximate location, and group/1:1 choice.
Screen 4: friendly chat with safety/report affordances.

Present each inside the same realistic transparent iPhone frame, high-resolution portrait, no malformed text. All text must be intentionally typeset, not image-model gibberish. Prefer designing the UI in Figma/code and compositing it into the device rather than asking an image model to render legible UI.

---

## Asset H — Safety phone screens

Create three additional coherent Loopie iPhone mockups:

- left: privacy and approximate-location settings;
- center: live map / nearby activities;
- right: chat screen showing respectful conversation and safety controls.

Same device frame, palette, typography, and screen scale as the walkthrough set. Transparent background.

---

## Asset I — Emoji-like activity icons

Create a consistent set of soft 3D emoji-style icons on transparent backgrounds:

- food and drinks;
- get active;
- tree/outdoor;
- party/night out;
- coffee;
- walk;
- gym;
- dinner;
- drinks;
- basketball/sports;
- yoga;
- running;
- cycling;
- chill and chat;
- location pin;
- shield;
- bell;
- handshake;
- globe;
- star-struck face;
- cocktail;
- tree;
- flexed arm.

Friendly premium emoji rendering, soft realistic shading, no outlines, no text, centered, 1:1, transparent PNG/AVIF, consistent camera and lighting.

## Asset QA

Generated assets are rejected if:

- people look duplicated or anatomically wrong;
- hands, drinks, phones, or glasses are malformed;
- visual style differs between sections;
- text readability zones are missing;
- colors fight the green/bronze UI;
- resolution is insufficient;
- app screenshots contain fake illegible text;
- assets look like generic dating-app advertising.


---

# FILE: 13_VISUAL_QA_REGRESSION_AND_RELEASE.md

# Prompt 13 — Visual QA, Regression Testing, Performance, and Release Evidence

Perform a complete verification pass. Do not merely state that the page looks good.

## 1. Build and static checks

Run and repair:

```text
install with frozen lockfile
typecheck
lint
unit tests
production build
```

No ignored failures.

## 2. E2E journey coverage

Test:

1. landing page loads;
2. hero video/poster works;
3. nav anchors work;
4. mobile menu opens/closes;
5. waitlist opens from every CTA location;
6. waitlist submits by email;
7. waitlist submits by WhatsApp;
8. waitlist submits with both channels;
9. invalid forms block correctly;
10. city modal opens from nav, FAQ, section, and footer;
11. autocomplete selection required;
12. success state copy button works;
13. FAQ keyboard behavior;
14. cookie accept;
15. cookie reject;
16. cookie settings reopen;
17. analytics does not load before consent;
18. reduced motion;
19. legal and social links;
20. API error/retry states.

## 3. Screenshot matrix

Capture full-page and focused screenshots at:

```text
390×844
430×932
768×1024
991×900
1024×768
1280×800
1440×900
1920×1080
```

Capture additional component states:

- mobile menu open;
- waitlist default;
- waitlist email selected;
- waitlist WhatsApp selected;
- waitlist validation errors;
- waitlist success;
- city modal;
- FAQ open;
- cookie banner;
- group section beginning/middle/end;
- Lottie beginning/middle/end;
- safety phones.

Store baselines under a dedicated visual regression folder.

## 4. Visual comparison criteria

Compare against the supplied reference export and screenshots.

Check:

- section order;
- hero crop;
- logo scale;
- nav spacing;
- status badge;
- typography size and line breaks;
- container width;
- gradient direction;
- button padding;
- Lottie crop;
- phone sizes;
- group-card trajectory;
- safety-card placement;
- CTA radius/background;
- FAQ spacing;
- city section crop;
- footer alignment;
- modal density.

Do not accept “roughly similar” when spacing or composition is clearly wrong.

## 5. Overflow and layout checks

Automate:

```js
document.documentElement.scrollWidth <= window.innerWidth + 1
```

Run at every viewport and while:

- menu open;
- modal open;
- group scroll at each state;
- safety section visible.

Check for cumulative layout shift.

## 6. Accessibility

Run automated checks and manual keyboard verification.

Repair:

- missing names;
- invalid ARIA;
- focus traps;
- low contrast;
- heading order;
- error announcements;
- touch-target size;
- focus visibility.

## 7. Performance

Measure production build.

Targets:

- no serious Lighthouse accessibility/SEO issues;
- performance above 90 where realistic;
- no uncompressed multi-megabyte images;
- hero video optimized;
- Lottie not blocking first paint;
- no scroll long tasks;
- no animation memory leak;
- no duplicate analytics scripts.

Use bundle analysis and document large dependencies.

## 8. Cross-browser

Verify at minimum:

- Chromium;
- Firefox;
- WebKit/Safari emulation where available.

Pay special attention to:

- backdrop-filter fallback;
- `svh`/`dvh`;
- video autoplay;
- mask-image nav blur;
- gradient text;
- modal mobile keyboard;
- Google Places dropdown z-index.

## 9. Release documentation

Produce:

```text
docs/release-report.md
docs/visual-diff-report.md
docs/accessibility-report.md
docs/performance-report.md
```

Include:

- commands run;
- pass/fail counts;
- screenshots;
- known deviations;
- missing credentials;
- environment variables;
- deployment URL;
- rollback instructions.

## Acceptance checklist

- [ ] All static checks pass.
- [ ] All critical E2E journeys pass.
- [ ] Screenshot matrix exists.
- [ ] No horizontal overflow exists.
- [ ] Accessibility issues are repaired.
- [ ] Performance bottlenecks are documented and fixed.
- [ ] Cross-browser behavior is verified.
- [ ] Release report contains evidence, not assertions.


---

# FILE: 14_FINAL_INTEGRATION_AUDIT.md

# Prompt 14 — Final Integration Audit and Completion Gate

Audit the entire implementation as if it were about to receive paid traffic. Do not add speculative features. Repair omissions and regressions.

## 1. Compare implementation against the required page inventory

Confirm every item exists and works:

- [ ] transparent desktop nav;
- [ ] cream mobile menu;
- [ ] logo variants;
- [ ] launch badge with Hungarian flag;
- [ ] full-screen hero video;
- [ ] hero tooltip;
- [ ] 400svh responsive Lottie story;
- [ ] activity pills;
- [ ] four phone walkthrough states;
- [ ] four step states;
- [ ] sticky group background;
- [ ] three group cards;
- [ ] editorial safety heading;
- [ ] three safety phones;
- [ ] four safety cards;
- [ ] photographic shared-moments CTA;
- [ ] seven FAQ items;
- [ ] support email;
- [ ] city CTA background;
- [ ] footer link groups;
- [ ] waitlist modal;
- [ ] city modal;
- [ ] conditional channel inputs;
- [ ] phone validation;
- [ ] Google city autocomplete;
- [ ] success/failure states;
- [ ] share copy state;
- [ ] cookie banner;
- [ ] analytics gating;
- [ ] WebPage, SoftwareApplication, FAQPage schema;
- [ ] backend persistence;
- [ ] rate limiting and bot controls;
- [ ] tests and release evidence.

Anything unchecked must be implemented before completion.

## 2. Content consistency gate

Search the repository and confirm:

- `60 days` does not survive accidentally;
- 30-day copy comes from config;
- pricing appears in one configured source;
- Instagram URL is consistent;
- support email is consistent;
- launch date/status is centralized;
- no `Lorem ipsum`;
- no `TODO` visible to users;
- no old Webflow URLs in components except documented source references;
- no broken `F` currency suffix where HUF/Ft is intended.

## 3. Technical hygiene gate

- no jQuery;
- no Webflow runtime;
- no copied minified CSS;
- no giant inline SVG animation snapshot;
- no event-listener leaks;
- no duplicate intervals;
- no uncontrolled modal focus;
- no client-exposed secret;
- no silent API failure;
- no analytics before consent;
- no direct database write from browser;
- no unexplained `any`;
- no console error/warning in production.

## 4. Conversion gate

Verify each CTA’s destination:

- hero Join Waitlist → waitlist;
- nav Join Waitlist → waitlist;
- app Join Waitlist → waitlist;
- safety Join Waitlist → waitlist;
- shared-moments CTA → waitlist;
- nav Propose New City → city;
- FAQ Propose New City → city;
- city section → city;
- footer Propose New City → city.

Track CTA location in analytics without PII.

## 5. Failure resilience

Simulate:

- video failure;
- Lottie failure;
- missing image;
- Google Maps unavailable;
- Supabase unavailable;
- rate limited;
- reCAPTCHA unavailable;
- clipboard denied;
- analytics blocked;
- offline after first paint.

Provide graceful visible behavior.

## 6. Final deliverable

Only declare completion after:

- all checks pass;
- release reports are updated;
- final full-page screenshots are captured;
- production build succeeds;
- deployment preview is verified;
- external credentials still required are clearly listed.

Return a concise completion report with:

1. implementation summary;
2. files/components created;
3. tests and exact results;
4. performance/accessibility results;
5. deployment URL;
6. external configuration still needed;
7. deliberate deviations from the reference and why.

Do not finish with a plan or with “the rest can be added later.”


---

# FILE: README.md

# Loopie — Full Zero-to-Production Regeneration Prompt Pack

This package rebuilds the Loopie landing experience from an empty repository while preserving the reference page’s product story, visual hierarchy, copy, interaction model, responsive behavior, forms, consent flow, SEO, and conversion journey.

## Recommended execution order

1. `00_MASTER_REGENERATION_PROMPT.md`
2. `01_PROJECT_FOUNDATION_AND_DESIGN_SYSTEM.md`
3. `02_ASSET_AUDIT_AND_MIGRATION.md`
4. `03_NAVIGATION_AND_HERO.md`
5. `04_SCROLL_STORY_LOTTIE.md`
6. `05_HOW_IT_WORKS.md`
7. `06_GROUP_CHOICE_SCROLL_SECTION.md`
8. `07_SAFETY_AND_PHONE_SHOWCASE.md`
9. `08_CTA_FAQ_CITY_AND_FOOTER.md`
10. `09_MODALS_FORMS_AND_BACKEND.md`
11. `10_COOKIE_ANALYTICS_AND_SEO.md`
12. `11_RESPONSIVE_MOTION_AND_ACCESSIBILITY.md`
13. `12_IMAGE_AND_VIDEO_GENERATION_PROMPTS.md`
14. `13_VISUAL_QA_REGRESSION_AND_RELEASE.md`
15. `14_FINAL_INTEGRATION_AUDIT.md`

Run the prompts sequentially against the same repository. Every later prompt must preserve all earlier functionality and visual work.

## Reference input expected by the prompts

Place the supplied website export and assets under:

```text
/reference/loopie/
  Loopie App _ Find Your People Nearby in Budapest.htm
  Loopie App _ Find Your People Nearby in Budapest_files/
```

The implementation should not ship this raw Webflow export. It is a visual/content reference and asset source only.

## Preferred implementation

- Next.js App Router
- React
- TypeScript in strict mode
- CSS variables plus either Tailwind CSS or CSS Modules
- Framer Motion for entrance and layout transitions
- `lottie-web` for scroll-scrubbed Lottie playback
- React Hook Form and Zod
- Supabase or another server-side persistence layer
- Vitest/React Testing Library and Playwright

Use the repository’s supported stable versions rather than blindly forcing package versions.

## Source-of-truth decisions that must be centralized

The reference contains a few inconsistencies. Do not reproduce them in multiple hard-coded locations.

```ts
export const siteConfig = {
  brandName: "Loopie",
  launchCity: "Budapest",
  launchStatus: "Soon to be live in Budapest",
  launchTarget: "end of August 2026",
  earlyAccessDays: 30,
  earlyAccessTooltip: "1 month free. No card required.",
  monthlyPriceHuf: 2490,
  sixMonthMonthlyEquivalentHuf: 1665,
  supportEmail: "support@loopie.com",
  instagramUrl: "https://www.instagram.com/loopie_socialapp/",
  shareUrl: "https://loopiesocial.app",
};
```

Important:

- The visible FAQ says **30 days**, while an older structured-data block says **60 days**. Generate all UI and JSON-LD from `earlyAccessDays`.
- The export contains both underscore and dot variants of the Instagram username. Use one configured URL everywhere.
- Format HUF consistently as `2,490 HUF` or `2 490 Ft`, based on the chosen content style.
- Launch timing must be editable in one file because it is time-sensitive.

## Definition of done

- The finished page follows the exact section order and conversion journey.
- All supplied visual assets are mapped or intentionally replaced.
- The hero video, Lottie story, phone transitions, scroll-linked cards, reveals, FAQ, modals, dynamic form fields, city autocomplete, consent banner, analytics gating, schema markup, and backend submissions work.
- Desktop, tablet, and mobile layouts are intentionally designed, not merely compressed.
- There are no placeholder sections, broken links, fake submissions, console errors, hydration warnings, or horizontal overflow.
- Reduced-motion users receive an elegant static/low-motion experience.
- The implementation includes tests, documentation, `.env.example`, and release evidence.
