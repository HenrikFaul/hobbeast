# Hobbeast editorial media provenance

## Scope and evidence boundary

This ledger covers the original editorial media introduced for the v1.9.9 visual
system. The four source scenes were created in the OpenAI built-in ImageGen mode
from text-only prompts on 2026-08-24. No Loopie image, video frame, logo or other
downloaded third-party media was supplied as generation input or copied into these
files. The Loopie capture remains reference-only.

The generated people are synthetic adults and must not be represented as real
Hobbeast members, testimonials or documentary evidence of a named Budapest place.
The ImageGen backend model identifier was not exposed by the built-in tool. The
ephemeral source PNG masters are not shipped, so the production-normalized files
and their SHA-256 values below are the durable provenance anchors.

## Successful built-in ImageGen prompts

### IG-01 — Budapest night hero

> Photorealistic wide Hobbeast landing hero: five adult friends laughing together on a Budapest summer night near the Erzsébet Square ferris wheel; people grouped on the right with generous dark negative space on the left for interface copy; warm city lights; subtle forest green, coral and chartreuse wardrobe/details; candid human connection, cinematic editorial photography, no logos, no text, no UI.

Derived production files:

- `hero-budapest-night.jpg` — canonical shipped still and JPEG fallback.
- `hero-budapest-night.webp` — desktop WebP still.
- `hero-budapest-night-mobile.webp` — portrait mobile crop.
- `hero-budapest-night-motion.mp4` — 10-second H.264 Ken Burns loop.
- `hero-budapest-night-motion.webm` — 10-second VP9 Ken Burns loop.

### IG-02 — Board-game discovery

> Photorealistic editorial lifestyle image of a board-game night in a leafy Budapest garden inspired by the atmosphere of Dürer Kert: a diverse group of adult friends around a table, genuine laughter and natural gestures, warm string lights, people are the focus, premium candid photography, no branding, no logos, no text.

Derived production file: `explore-boardgame.webp`.

### IG-03 — Riverside badminton

> Photorealistic editorial lifestyle image of adult friends playing casual badminton beside the Danube in a modern Budapest park inspired by Kopaszi-gát, golden hour, lively movement and laughter, people are the focus, dynamic premium photography, no branding, no logos, no text.

Derived production file: `events-riverside-badminton.webp`.

### IG-04 — Népsziget dog walk

> Photorealistic editorial lifestyle image of four adult friends walking two dogs on a leafy Népsziget path in Budapest, glimpses of the Danube, late-summer light, relaxed conversation and genuine smiles, people are the focus, premium candid photography, no branding, no logos, no text.

Derived production file: `about-nepsziget-dogwalk.webp`.

A fifth Buda Hills scene was attempted, but the built-in ImageGen run stopped on
quota before producing an image. No fifth source or derivative is part of this
delivery.

## Shipped-file manifest

All hashes are lowercase SHA-256 over the repository file bytes.

| File | Production metadata | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `about-nepsziget-dogwalk.webp` | WebP, 1280×853, sRGB, 8-bit | 172964 | `21b48fa5c551db87bf2300be0add4482842b52ecdf3236407b7fe12627e2ce79` |
| `events-riverside-badminton.webp` | WebP, 1280×853, sRGB, 8-bit | 136826 | `6d514b1dd39df7e186689dba5c7fae40f82b941968b9a43ef595fae99eaf5aa4` |
| `explore-boardgame.webp` | WebP, 1280×853, sRGB, 8-bit | 97736 | `d306a59b99082bfbe09e7aec0aa76ede2aefa571eacc14e17bc4e845f8815ed3` |
| `hero-budapest-night-mobile.webp` | WebP, 768×1024, sRGB, 8-bit | 46048 | `a24410a78f29cc5d03fe06e27c3d2ee5dbc608e85651ac919821538a7f7f5851` |
| `hero-budapest-night.jpg` | JPEG, 1672×941, sRGB, quality 80 | 168829 | `8a1925487a20108881855cbb6bdb4a14e3ca08251794d09b7bfa34af86df8a2f` |
| `hero-budapest-night.webp` | WebP, 1672×941, sRGB, 8-bit | 84434 | `233c470a5cd0e0c53a77795ccc182c15e0fdfad27025cb636e2f151486163ff2` |
| `hero-budapest-night-motion.mp4` | H.264 High, 1280×720, 24 fps, 10.000 s, 240 frames, no audio, faststart | 832872 | `30446378c5bef4f8665bf6e268592a51483b8cea303801169f449398ec2760d8` |
| `hero-budapest-night-motion.webm` | VP9 Profile 0, 1280×720, 24 fps, 10.000 s, no audio | 509867 | `4bc5e40fcdc68e09ccc4bc685b62cf7b68d56ad605da7a64008eeefdd8e011a2` |

## Derivation policy and reproducible recipes

The original shell transcript is not retained. The commands below are
reproducible recipes matching the shipped dimensions, formats and motion policy;
they are not represented as verbatim historical command logs. Replace `MASTER.png`
with the corresponding built-in ImageGen source master.

```powershell
# Desktop hero stills.
magick MASTER.png -strip -resize "1672x941^" -gravity center -extent 1672x941 -quality 80 hero-budapest-night.jpg
magick MASTER.png -strip -resize "1672x941^" -gravity center -extent 1672x941 -quality 80 hero-budapest-night.webp

# Subject-preserving portrait crop for static mobile delivery.
magick MASTER.png -strip -resize "768x1024^" -gravity east -extent 768x1024 -quality 80 hero-budapest-night-mobile.webp

# The three supporting scenes use the same normalization envelope.
magick MASTER.png -strip -resize "1280x853^" -gravity center -extent 1280x853 -quality 80 OUTPUT.webp
```

The motion pair is an original local pan/zoom derivative of the IG-01 still, not
generated or extracted from the Loopie reference. A reproducible 10-second,
24-fps version can be produced as follows:

```powershell
ffmpeg -loop 1 -i hero-budapest-night.jpg -vf "zoompan=z='1+0.04*on/239':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=240:s=1280x720:fps=24,format=yuv420p" -frames:v 240 -an -c:v libx264 -profile:v high -crf 24 -g 48 -keyint_min 48 -sc_threshold 0 -movflags +faststart hero-budapest-night-motion.mp4
ffmpeg -i hero-budapest-night-motion.mp4 -an -c:v libvpx-vp9 -pix_fmt yuv420p -crf 34 -b:v 0 -row-mt 1 -g 48 hero-budapest-night-motion.webm
```

## Media verification evidence

`ffprobe` reports exactly one video stream and no audio stream in either motion
file. Both variants are 1280×720, 24 fps and 10.000 seconds. The MP4 contains 240
frames. A binary atom-order check reports `ftyp` at byte 4, `moov` at byte 36 and
`mdat` at byte 3646; `moov < mdat` proves faststart placement.

Re-run the evidence checks with:

```powershell
ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,duration,nb_frames:format=duration,size,bit_rate -of json -- src/assets/editorial/hero-budapest-night-motion.mp4
ffprobe -v error -show_entries stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,duration,nb_frames:format=duration,size,bit_rate -of json -- src/assets/editorial/hero-budapest-night-motion.webm
node -e "const fs=require('fs');const b=fs.readFileSync(process.argv[1]);for(const atom of ['ftyp','moov','mdat'])console.log(atom,b.indexOf(Buffer.from(atom)));" src/assets/editorial/hero-budapest-night-motion.mp4
Get-ChildItem src/assets/editorial -File | ForEach-Object { "{0}  {1}" -f (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant(), $_.Name }
```

## Runtime and accessibility requirements

- The static hero poster remains the LCP asset; do not preload either video.
- Render no `<video>` or `<source>` node when `prefers-reduced-motion: reduce`,
  Save-Data or a constrained connection is active. CSS-only hiding is insufficient.
- Motion is decorative, muted and non-essential. Keep `aria-hidden="true"`,
  `playsInline`, no audio stream, and preserve all messaging in HTML.
- Pause when the hero leaves the viewport or the document becomes hidden. Provide
  a keyboard-operable pause/resume control for motion lasting more than five seconds.
- Use the portrait WebP poster on mobile by default. Desktop motion may mount only
  after the poster has loaded and the browser is idle.

## Performance gates

`scripts/performance-budgets.json` enforces a 1,500,000-byte per-video ceiling and
a 2,500,000-byte aggregate ceiling for the two hashed hero motion variants. The
aggregate gate also requires exactly two matches so a missing MP4 or WebM fallback
cannot pass silently. `scripts/check-performance-budget.mjs` treats the new
`minMatches` and `maxMatches` keys as optional; existing budget entries retain their
previous required/optional behavior.
