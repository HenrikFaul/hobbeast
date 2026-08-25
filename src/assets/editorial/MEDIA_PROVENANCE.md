# Hobbeast media provenance ledger

## Scope and evidence boundary

This ledger records the repository media bytes, acquisition sources, creators,
licence, normalization boundary and repeatable verification steps for the Hobbeast
editorial system as of 2026-08-24.

The current licensed-stock slice consists of:

- 17 Pexels category photographs under `src/assets/stock/categories/`;
- two Pexels motion sources normalized as the day/night hero MP4 pair; and
- one static day-mobile poster derived from the pre-existing local
  `src/assets/hero-community.jpg` asset.

No ImageGen operation was used to create, edit or derive any media in this current
licensed-stock slice. The Pexels videos contain real subject and camera movement;
they are not still-image pan/zoom simulations. The earlier v1.9.9 generated stills
remain documented in a separate historical section because deleting factual
provenance would make the ledger incomplete. They were not used as source input for
the 17 category photographs, the two new MP4 files or the day-mobile poster.

All SHA-256 values below are lowercase hashes over the exact repository file bytes.
Remote Pexels originals are not vendored, so their canonical content pages and direct
media URLs are the acquisition anchors; the local derivative hashes are the durable
production evidence. This document records repository evidence, not legal advice or
proof of a hosted deployment.

## Licence and use policy for Pexels media

- **Licence:** [Pexels License](https://www.pexels.com/license/), checked 2026-08-24.
- The selected pages were marked `Free download` / `Free to use` when acquired.
- Attribution is not required by the licence, but Hobbeast retains creator credit in
  this ledger as a provenance control.
- Do not imply that a depicted person or creator endorses Hobbeast, is a Hobbeast
  member or supplied a testimonial. Do not redistribute the unaltered source as a
  stock product, resell an unaltered copy or use a depicted person/brand as a
  trademark.
- Re-check the canonical page and current licence before re-acquiring or repurposing
  an original. Production serves local normalized derivatives and does not hotlink
  Pexels CDN media.

## Licensed category photographs

All 17 source URLs below returned `HTTP 200 image/jpeg` on 2026-08-24. Each shipped
derivative is a metadata-stripped, sRGB, 8-bit, 3:2 WebP at 720×480. The source page,
creator and direct source media are recorded separately so page attribution is not
lost when CDN filenames are normalized locally.

| Local production file | Hobbeast category | Canonical Pexels page | Creator | Direct source media | Bytes | SHA-256 |
| --- | --- | --- | --- | --- | ---: | --- |
| `src/assets/stock/categories/sport.webp` | Sport & Mozgás | [Friends playing soccer](https://www.pexels.com/photo/a-group-of-friends-playing-soccer-5235779/) | cottonbro studio | [source JPEG](https://images.pexels.com/photos/5235779/pexels-photo-5235779.jpeg) | 65554 | `88380dd58a91a72c11ad203cd4bd3bf4af594f0010a370e390f9a7926f28648b` |
| `src/assets/stock/categories/extreme.webp` | Extrém & Kalandsport | [Group climbers](https://www.pexels.com/photo/group-climbers-posing-together-7591300/) | Pavel Danilyuk | [source JPEG](https://images.pexels.com/photos/7591300/pexels-photo-7591300.jpeg) | 44228 | `292a961e3a94979821f4b717629bf0907c7144305e681c7a67ba9381e8b813ed` |
| `src/assets/stock/categories/nature.webp` | Természet & Túra | [People hiking in a forest](https://www.pexels.com/photo/people-hiking-in-a-forest-7625040/) | PNW Production | [source JPEG](https://images.pexels.com/photos/7625040/pexels-photo-7625040.jpeg) | 56712 | `0c25bb37d58d637e4d4edcf3226c4ed556dac87131d4a782f9f2a75d3a603bad` |
| `src/assets/stock/categories/creative.webp` | Kreatív & Kézműves | [Group pottery workshop](https://www.pexels.com/photo/group-pottery-workshop-with-focus-on-artist-34248156/) | Nurgül Kelebek | [source JPEG](https://images.pexels.com/photos/34248156/pexels-photo-34248156.jpeg) | 35024 | `70cbd16652ce31c96eb043140046ff0ded9e8d0c554613718f840e5b7fe25e7c` |
| `src/assets/stock/categories/music.webp` | Zene | [Band practising together](https://www.pexels.com/photo/a-band-practicing-together-7802575/) | Pavel Danilyuk | [source JPEG](https://images.pexels.com/photos/7802575/pexels-photo-7802575.jpeg) | 32952 | `3a70cb5dbea64065eb5d35da064e89befa8795e3f67281ded35b516d4bf86dd6` |
| `src/assets/stock/categories/dance.webp` | Tánc | [Group fitness class](https://www.pexels.com/photo/group-of-people-in-a-fitness-class-5936039/) | David Awokoya | [source JPEG](https://images.pexels.com/photos/5936039/pexels-photo-5936039.jpeg) | 35414 | `66635c3631ca14da8360ecf0ad5bfc6de096b200e38b11f840cebb7faa47d4a0` |
| `src/assets/stock/categories/board-games.webp` | Társasjáték & Gondolkodás | [Friends playing a board game](https://www.pexels.com/photo/friends-playing-a-board-game-together-8111352/) | Pavel Danilyuk | [source JPEG](https://images.pexels.com/photos/8111352/pexels-photo-8111352.jpeg) | 27934 | `a0ae4abaf404c585d252be6474ff5b7e5b2e1ea2b5bbe9eee957e0af4ca25817` |
| `src/assets/stock/categories/gaming.webp` | Gaming & E-sport | [Friends playing console games](https://www.pexels.com/photo/friends-playing-together-on-a-game-console-7856028/) | Ron Lach | [source JPEG](https://images.pexels.com/photos/7856028/pexels-photo-7856028.jpeg) | 25430 | `cf628a99ba28717361b1660a926f808f33b80ee284f93033df4393c51780ae4b` |
| `src/assets/stock/categories/gastronomy.webp` | Gasztronómia | [Friends cooking outdoors](https://www.pexels.com/photo/friends-cooking-together-outdoors-in-sunlight-36967641/) | shutter Rwanda | [source JPEG](https://images.pexels.com/photos/36967641/pexels-photo-36967641.jpeg) | 76470 | `869c945a83a30c68507ea5c9f5bf69e42b8b6eecd323f004ca2bdbddc49e0202` |
| `src/assets/stock/categories/photo-film.webp` | Fotó & Film | [Group of photographers](https://www.pexels.com/photo/group-of-photographers-taking-photos-outdoors-36725925/) | Khadysha Goins | [source JPEG](https://images.pexels.com/photos/36725925/pexels-photo-36725925.jpeg) | 50052 | `caaccd37c8fd094b0f8c999f92777ba64e18015c01ecf8a1612fedc9afd241e0` |
| `src/assets/stock/categories/tech.webp` | Technológia & Tudomány | [Adults in a robotics workshop](https://www.pexels.com/photo/men-and-woman-sitting-and-working-at-workshop-9242838/) | Mikhail Nilov | [source JPEG](https://images.pexels.com/photos/9242838/pexels-photo-9242838.jpeg) | 24210 | `434f53c614d6aa6daa4b859d2838b886c7644673dfe78368d7a7f9fd045eb059` |
| `src/assets/stock/categories/learning.webp` | Irodalom & Tanulás | [Group reading and discussing](https://www.pexels.com/photo/group-of-people-reading-book-sitting-on-chair-711009/) | Helena Lopes | [source JPEG](https://images.pexels.com/photos/711009/pexels-photo-711009.jpeg) | 22828 | `8bb576cf6a241129d672795516a6c9ddaa9abec8947d5bb1360ec90948c728cd` |
| `src/assets/stock/categories/animals.webp` | Állatok | [People with their dogs](https://www.pexels.com/photo/photo-of-people-with-their-dogs-12265349/) | Taras Chuiko | [source JPEG](https://images.pexels.com/photos/12265349/pexels-photo-12265349.jpeg) | 61538 | `9513667dd01ae269fa730e15a3db074220dbd3d94693ceb1aef91d7ad38d9362` |
| `src/assets/stock/categories/travel.webp` | Utazás & Felfedezés | [Friends exploring a city](https://www.pexels.com/photo/women-travelers-visiting-city-with-backpacks-using-smart-phone-4881135/) | Ketut Subiyanto | [source JPEG](https://images.pexels.com/photos/4881135/pexels-photo-4881135.jpeg) | 28990 | `1868c76325f71fbb78af93e67b855d4751db54369cd706ae005541ad26f25503` |
| `src/assets/stock/categories/fashion.webp` | Divat & Szépség | [Fashion designers laughing](https://www.pexels.com/photo/group-of-fashion-designers-laughing-9850088/) | Ron Lach | [source JPEG](https://images.pexels.com/photos/9850088/pexels-photo-9850088.jpeg) | 26294 | `85a2eecce08c4177b00112f826b9872ef8df2430663890bb0e1f3a7d0c84ce27` |
| `src/assets/stock/categories/volunteering.webp` | Önkéntesség & Közösség | [Volunteers cleaning a park](https://www.pexels.com/photo/group-of-volunteers-cleaning-park-together-36713507/) | Vitaly Gariev | [source JPEG](https://images.pexels.com/photos/36713507/pexels-photo-36713507.jpeg) | 30688 | `a2fcdf8bc543de1490b68162fb4818036bdeaf8791e64e1a87199758f9fe264b` |
| `src/assets/stock/categories/performing-arts.webp` | Színház & Előadóművészet | [Actors holding scripts](https://www.pexels.com/photo/people-holding-scripts-6895796/) | cottonbro studio | [source JPEG](https://images.pexels.com/photos/6895796/pexels-photo-6895796.jpeg) | 24192 | `2e383c6b344e3f255bed94f1a01833d116d03050c8b31c6e5a0155deb75d20fa` |

The category set contains exactly 17 files and totals **668510 bytes**. The largest
file is `gastronomy.webp` at 76470 bytes; every category derivative is below the
256000-byte image ceiling.

### Category-image transformation record

The historical shell transcript was not retained. Repository inspection proves the
output envelope (WebP, 720×480, sRGB, 8-bit, metadata stripped), but does not prove
the exact encoder build, quality flag or focal-gravity value used for every image.
The following is therefore an **equivalent reproducible normalization recipe**, not
a claimed verbatim historical command and not a byte-identical reconstruction:

```powershell
magick SOURCE.jpeg -auto-orient -strip `
  -resize "720x480^" -gravity center -extent 720x480 `
  -colorspace sRGB -quality 92 OUTPUT.webp
```

For a re-derivation, preserve each shipped image's visible focal crop rather than
blindly assuming center gravity. After conversion, the resulting file must be
visually reviewed and assigned a new SHA-256; it must not be represented as the
existing byte-identical artifact unless its hash matches this ledger.

## Licensed real-motion hero videos

Both production MP4s were added in repository commit
`fff7f6a47d4c9d40f290ed4a89d231e2eea75ebb`. The source and output files contain
video only; no audio stream is present.

### Day hero — people walking in nature

- **Canonical page:** [People walking together while enjoying nature](https://www.pexels.com/video/people-walking-together-while-enjoying-looking-the-nature-7348438/)
- **Creator:** RDNE Stock project
- **Licence:** [Pexels License](https://www.pexels.com/license/), checked 2026-08-24
- **Direct source:** [7348438-hd_1920_1080_24fps.mp4](https://videos.pexels.com/video-files/7348438/7348438-hd_1920_1080_24fps.mp4)
- **Observed source metadata:** H.264, 1920×1080, 24/1 fps, 7.291667 s,
  175 frames, video-only, 4461375 bytes.
- **Transformation:** editorial trim, 1920×1080 to 1280×720 downscale, H.264 High
  transcode, `yuv420p`, audio removal, bitrate reduction and MP4 faststart placement.
- **Production file:** `src/assets/editorial/hero-together-day.mp4`
- **Observed production metadata:** H.264 High, 1280×720, `yuv420p`, constant
  24/1 average and nominal frame rate, 7.208333 s, 173 frames, video-only,
  1171886 bytes.
- **SHA-256:** `f0dea909d1fda5a8e8ae6673c26e09ceb2a155aa5fd3b27759a25f24d150ac7c`
- **MP4 atom evidence:** `ftyp` byte 4, `moov` byte 36, `mdat` byte 2965;
  `moov < mdat` confirms faststart ordering.

### Night hero — group celebrating with sparklers

- **Canonical page:** [Group celebrating at night with sparklers](https://www.pexels.com/video/group-celebrating-at-night-with-sparklers-32915480/)
- **Creator:** UI Team VEHYPE
- **Licence:** [Pexels License](https://www.pexels.com/license/), checked 2026-08-24
- **Direct source:** [14028026_1920_1080_24fps.mp4](https://videos.pexels.com/video-files/32915480/14028026_1920_1080_24fps.mp4)
- **Observed source metadata:** H.264, 1920×1080, 24000/1001 fps,
  13.138125 s, video-only, 17274202 bytes.
- **Transformation:** selected editorial excerpt, 1920×1080 to 1280×720
  downscale, H.264 High transcode, `yuv420p`, audio removal, bitrate reduction and
  MP4 faststart placement.
- **Production file:** `src/assets/editorial/hero-together-night.mp4`
- **Observed production metadata:** H.264 High, 1280×720, `yuv420p`, nominal
  24/1 frame rate, average frame rate 4248/191 (approximately 22.241 fps),
  7.958333 s, 177 frames, video-only, 1272999 bytes. This is observed VFR evidence;
  the ledger does not misrepresent the file as constant-frame-rate 24 fps.
- **SHA-256:** `73055e0427b970d58bc3de1b4149f73bdddc85143bafbf4de7cc7f427075cc62`
- **MP4 atom evidence:** `ftyp` byte 4, `moov` byte 36, `mdat` byte 3206;
  `moov < mdat` confirms faststart ordering.

The two production videos total **2444885 bytes**, leaving 55115 bytes below the
2500000-byte aggregate ceiling. Each is below the 1500000-byte per-file ceiling.

### Equivalent video transcode envelope

The exact historical in-points, encoder build and command transcript were not
retained. The byte-level output metadata and SHA-256 values above are authoritative.
The following describes an **equivalent delivery envelope** only; it must not be
presented as the historical command or as a byte-identical rebuild:

```powershell
ffmpeg -ss EDITORIAL_IN_POINT -i SOURCE.mp4 -t TARGET_DURATION -an `
  -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,format=yuv420p" `
  -r 24 -c:v libx264 -profile:v high -preset slow -crf 25 `
  -maxrate 1300k -bufsize 2600k -movflags +faststart OUTPUT.mp4
```

Use `TARGET_DURATION=7.208333` for the day envelope and `7.958333` for the night
envelope. A rebuilt night clip may become CFR and therefore differ from the current
177-frame VFR artifact; assign it a new hash rather than claiming equivalence.

## Day mobile poster

The day-mobile poster is not a new Pexels or generated image. It is a normalized
portrait crop of the already shipped local day hero JPEG.

| Role | File | Metadata | Bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| Existing local source | `src/assets/hero-community.jpg` | JPEG, 1600×900, sRGB, 8-bit, quality 82 | 200150 | `ba5b8806b371bfc79cfb958587a3adf92bf9fd0e604718c38db71e4fa4f71668` |
| Production mobile derivative | `src/assets/editorial/hero-community-day-mobile.webp` | WebP, 768×1024, sRGB, 8-bit | 48788 | `3435fa31816e6b770013269db40f4362006a40d5b1fafbf5e54183e8ee20be42` |

Git evidence places the original JPEG introduction at commit
`c105b7acbb0656d0dd9a62c425fb543c8e795796` and its current 200150-byte
normalization at commit `8e3562197721a313b0f2e193bdcc4086e66432c3`.
Those commits do not contain an upstream creator/licence record, so this delivery
does not invent one. The unresolved upstream provenance of that legacy JPEG remains
a historical documentation gap; the current slice proves only the local parent →
mobile-derivative relationship.

The exact crop command was not retained. An equivalent portrait normalization is:

```powershell
magick src/assets/hero-community.jpg -auto-orient -strip `
  -resize "768x1024^" -gravity center -extent 768x1024 `
  -colorspace sRGB -quality 92 `
  src/assets/editorial/hero-community-day-mobile.webp
```

The shipped focal crop and SHA-256 remain authoritative; a new conversion must be
visually checked and re-hashed.

## Retired simulated-motion derivatives

The following v1.9.9 files were deleted in commit
`fff7f6a47d4c9d40f290ed4a89d231e2eea75ebb` and are not part of the current runtime:

| Retired file | Former bytes | Former SHA-256 | Reason |
| --- | ---: | --- | --- |
| `src/assets/editorial/hero-budapest-night-motion.mp4` | 832872 | `30446378c5bef4f8665bf6e268592a51483b8cea303801169f449398ec2760d8` | Still-image pan/zoom; no real subject motion |
| `src/assets/editorial/hero-budapest-night-motion.webm` | 509867 | `4bc5e40fcdc68e09ccc4bc685b62cf7b68d56ad605da7a64008eeefdd8e011a2` | Still-image pan/zoom; no real subject motion |

The obsolete Ken Burns generation recipe and its old validation claim are
intentionally not retained as current instructions. The replacement motion is the
licensed, real-motion Pexels day/night MP4 pair documented above.

## Historical v1.9.9 still provenance — unchanged

This section preserves factual provenance for stills that remain in the repository.
It is not part of the current no-ImageGen stock acquisition workflow.

The four source scenes below were created in the OpenAI built-in ImageGen mode from
text-only prompts on 2026-08-24. No Loopie image, video frame, logo or downloaded
third-party media was supplied as generation input. The generated people are
synthetic adults and must not be represented as real Hobbeast members, testimonials
or documentary evidence of a named Budapest place. The backend model identifier was
not exposed and the ephemeral source PNG masters are not shipped.

### IG-01 — Budapest night hero

> Photorealistic wide Hobbeast landing hero: five adult friends laughing together on a Budapest summer night near the Erzsébet Square ferris wheel; people grouped on the right with generous dark negative space on the left for interface copy; warm city lights; subtle forest green, coral and chartreuse wardrobe/details; candid human connection, cinematic editorial photography, no logos, no text, no UI.

Derived stills: `hero-budapest-night.jpg`, `hero-budapest-night.webp` and
`hero-budapest-night-mobile.webp`.

### IG-02 — Board-game discovery

> Photorealistic editorial lifestyle image of a board-game night in a leafy Budapest garden inspired by the atmosphere of Dürer Kert: a diverse group of adult friends around a table, genuine laughter and natural gestures, warm string lights, people are the focus, premium candid photography, no branding, no logos, no text.

Derived still: `explore-boardgame.webp`.

### IG-03 — Riverside badminton

> Photorealistic editorial lifestyle image of adult friends playing casual badminton beside the Danube in a modern Budapest park inspired by Kopaszi-gát, golden hour, lively movement and laughter, people are the focus, dynamic premium photography, no branding, no logos, no text.

Derived still: `events-riverside-badminton.webp`.

### IG-04 — Népsziget dog walk

> Photorealistic editorial lifestyle image of four adult friends walking two dogs on a leafy Népsziget path in Budapest, glimpses of the Danube, late-summer light, relaxed conversation and genuine smiles, people are the focus, premium candid photography, no branding, no logos, no text.

Derived still: `about-nepsziget-dogwalk.webp`.

A fifth Buda Hills attempt stopped on quota and produced no shipped asset.

| Historical still | Production metadata | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `src/assets/editorial/about-nepsziget-dogwalk.webp` | WebP, 1280×853, sRGB, 8-bit | 172964 | `21b48fa5c551db87bf2300be0add4482842b52ecdf3236407b7fe12627e2ce79` |
| `src/assets/editorial/events-riverside-badminton.webp` | WebP, 1280×853, sRGB, 8-bit | 136826 | `6d514b1dd39df7e186689dba5c7fae40f82b941968b9a43ef595fae99eaf5aa4` |
| `src/assets/editorial/explore-boardgame.webp` | WebP, 1280×853, sRGB, 8-bit | 97736 | `d306a59b99082bfbe09e7aec0aa76ede2aefa571eacc14e17bc4e845f8815ed3` |
| `src/assets/editorial/hero-budapest-night-mobile.webp` | WebP, 768×1024, sRGB, 8-bit | 46048 | `a24410a78f29cc5d03fe06e27c3d2ee5dbc608e85651ac919821538a7f7f5851` |
| `src/assets/editorial/hero-budapest-night.jpg` | JPEG, 1672×941, sRGB, quality 80 | 168829 | `8a1925487a20108881855cbb6bdb4a14e3ca08251794d09b7bfa34af86df8a2f` |
| `src/assets/editorial/hero-budapest-night.webp` | WebP, 1672×941, sRGB, 8-bit | 84434 | `233c470a5cd0e0c53a77795ccc182c15e0fdfad27025cb636e2f151486163ff2` |

## Runtime, accessibility and performance requirements

- The static poster remains the LCP asset; do not preload either video.
- Render no `<video>` or `<source>` node and issue no video request when
  `prefers-reduced-motion: reduce`, Save-Data or a constrained connection is active.
  CSS-only hiding is insufficient.
- Motion is decorative, muted and non-essential. Keep `aria-hidden="true"`,
  `playsInline`, no audio stream and all messaging in HTML.
- Pause when the hero leaves the viewport or the document becomes hidden. Keep the
  keyboard-operable pause/resume control for motion lasting more than five seconds.
- Mobile uses a static portrait poster. Eligible desktop clients dynamically import
  only the selected day or night MP4 after poster readiness and the idle gate.
- `scripts/performance-budgets.json` enforces 1500000 bytes per video and
  2500000 bytes across exactly two built hero variants. It also enforces 256000 bytes
  per image.

## Repeatable byte-level verification

```powershell
# Repository image metadata and hashes.
Get-ChildItem src/assets/stock/categories -File | Sort-Object Name | ForEach-Object {
  magick identify -format '%m %wx%h %[colorspace] %z-bit' -- $_.FullName
  Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
}

# Current hero video stream/container evidence.
Get-ChildItem src/assets/editorial/hero-together-*.mp4 -File | Sort-Object Name | ForEach-Object {
  ffprobe -v error `
    -show_entries stream=index,codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,duration,nb_frames:format=duration,size,bit_rate `
    -of json -- $_.FullName
  Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName
}

# Poster lineage bytes.
magick identify -verbose -- src/assets/editorial/hero-community-day-mobile.webp
Get-FileHash -Algorithm SHA256 -LiteralPath src/assets/hero-community.jpg
Get-FileHash -Algorithm SHA256 -LiteralPath src/assets/editorial/hero-community-day-mobile.webp

# Build-output performance gate.
bun run build
bun run quality:performance
```

The current licensed-stock files total **3162183 bytes**: 668510 bytes of category
WebPs, 2444885 bytes of real-motion MP4s and a 48788-byte day-mobile poster.

## v1.13.0 community-moment video library

The community-moment section serves exactly one session-stable editorial scene at
a time. All four derivatives use real subject motion; no still image was animated
or represented as video. The source pages and Pexels licence were checked on
2026-08-25. The displayed people are stock-video models and are not represented as
Hobbeast members, testimonials, or participants in a named Hungarian event.

| Production file | Scene | Canonical source / creator | Source metadata | Production metadata | Bytes | SHA-256 |
| --- | --- | --- | --- | --- | ---: | --- |
| `src/assets/editorial/moments/moment-guitar-teaching.mp4` | Friends learning guitar | [Man teaching friend how to play the guitar](https://www.pexels.com/video/man-teaching-friend-how-to-play-the-guitar-7424219/) · Gustavo Fring | H.264 High, 3840×2160, 30000/1001 fps, 13.8138 s, 26308243 bytes, SHA-256 `0e064db2205aa7e5ab96ac79b729babb6e55dde9142f239e9e007e8f3ce687bb` | H.264 High, 960×540, CFR 24 fps, 7 s, 168 frames, video-only, faststart | 406098 | `c2e9cc2d84b8c1152964651c8c8cc316c458c64fc762ad94a1f3fa9c263008c7` |
| `src/assets/editorial/moments/moment-reading-hammock.mp4` | Reading and talking beside a hammock | [Man reading a book while lying down on a hammock](https://www.pexels.com/video/man-reading-a-book-while-lying-down-on-a-hammock-6263352/) · Uriel Mont | H.264 High, 1920×1080, 25 fps, 10.005 s, 6442438 bytes, SHA-256 `612f5b70b87e5d45832b09fad19f2a3da207be62546ddc8c748c5dfde983d9d1` | H.264 High, 960×540, CFR 24 fps, 7 s, 168 frames, video-only, faststart | 822452 | `c1c715b4bd34057961dd56b8c8697a88eac7a60f9b42c3b55485eef140d3b92a` |
| `src/assets/editorial/moments/moment-singing-together.mp4` | Friends singing together | [A group of friends singing and dancing](https://www.pexels.com/video/a-group-of-friends-singing-and-dancing-6760657/) · Kampus Production | H.264 High, 2560×1440, 25 fps, 15.486667 s, 15492311 bytes, SHA-256 `2eed872c5ea63bb7b62c3d7638fd929842325a2df297255afa89d95a30ba5a8a` | H.264 High, 960×540, CFR 24 fps, 7 s, 168 frames, video-only, faststart | 733748 | `6714fa23bd0d5398e80e80e73fe168c6660a2872685e18179b761a7b196c88cc` |
| `src/assets/editorial/moments/moment-hiking-friends.mp4` | Friends hiking together | [Friends hiking together](https://www.pexels.com/video/friends-hiking-together-5061783/) · Kamaji Ogino | H.264 High, 3840×2160, 30000/1001 fps, 11.077733 s, 29807839 bytes, SHA-256 `91274e832978b39de06068f4bc636cab91d7e6fd2c06f8b43840a999a89a5030` | H.264 High, 960×540, CFR 24 fps, 7 s, 168 frames, video-only, faststart | 798708 | `13b2cee863f94da7b97af4db78b248e47aee73551ed882b653f4d46a309daf6b` |

All production MP4s place `moov` before `mdat`. They were normalized with FFmpeg
8.1.1 to H.264 High, `yuv420p`, 960×540, 24 fps, seven seconds, no audio,
`-crf 27 -maxrate 900k -bufsize 1800k -movflags +faststart`. Editorial source
in-points were 1.5 s (guitar), 1.5 s (hammock), 0.5 s (singing), and 1 s (hiking).

| Poster derivative | Bytes | SHA-256 |
| --- | ---: | --- |
| `moment-guitar-teaching.webp` | 45730 | `71d862fd474e0bfca2620e2f202817a0a8e41a6a5da3cb5301f793d775c82ff9` |
| `moment-hiking-friends.webp` | 57828 | `a96ac1aadbf74c406e20c3db3203731c7779388de501f78f2d22198dd1f6f104` |
| `moment-reading-hammock.webp` | 113376 | `30e937325ddc21e85984c7c15905b4056bb4af391d2032234d355b0ec0b8e714` |
| `moment-singing-together.webp` | 31222 | `378ddf5c6277007a5f957cc966f014cb88dce7878759d81b504a34429b42c3c8` |

Posters are single frames extracted 2.5 seconds into their normalized parent
video, scaled to 960×540 and encoded as WebP quality 84. Each is below the
256000-byte image ceiling; each MP4 is below the 1500000-byte video ceiling.

### Editorial candidate backlog — not shipped and not runtime-referenced

These canonical pages form a reviewed creative shortlist for future rounds. They
are not downloaded production assets and must receive a fresh licence, model/property,
scene, performance and visual review before any future use:

- [Peaceful sunset by the lake with two friends](https://www.pexels.com/video/peaceful-sunset-by-the-lake-with-two-friends-35177979/)
- [Group of friends at dusk by the lake](https://www.pexels.com/video/group-of-friends-at-dusk-by-the-lake-37082325/)
- [Couple lying on a hammock](https://www.pexels.com/video/couple-lying-on-a-hammock-5364829/)
- [Friends playing a board game](https://www.pexels.com/video/friends-playing-board-game-8058014/)
- [Friends playing Connect Four](https://www.pexels.com/video/friends-playing-connect-four-8757837/)
- [A group of people dancing in the street](https://www.pexels.com/video/a-group-of-people-dancing-in-the-street-27580032/)
- [Friends walking in the street](https://www.pexels.com/video/friends-walking-in-the-street-6139250/)
- [A group of friends admiring a mountain landscape](https://www.pexels.com/video/a-group-of-friends-admiring-a-mountain-landscape-11759805/)
- [Group of friends dancing together while holding beer](https://www.pexels.com/video/group-of-friends-dancing-together-while-holding-beer-5935438/)
- [A group of people hiking up a snowy mountain](https://www.pexels.com/video/a-group-of-people-hiking-up-a-snowy-mountain-20320769/)
- [A woman teaching her partner how to play guitar](https://www.pexels.com/video/a-woman-teaching-her-partner-how-to-play-guitar-4647497/)
- [A man and woman playing guitar in a room](https://www.pexels.com/video/a-man-and-woman-playing-guitar-in-a-room-17688623/)

### Runtime boundary for community moments

- Only the selected MP4 is dynamically imported after the section approaches the
  viewport; the other three videos are not requested.
- Reduced-motion, Save-Data and 2G-class connections receive the poster only.
- The video is muted, decorative and loops without an audio stream; all meaning is
  repeated in HTML.
- Motion pauses when the document becomes hidden and exposes an accessible pause
  control after playback is ready.
- Selection is random once per browser session and stable during navigation. A
  user-triggered “Másik történet” action changes it; there is no automatic carousel.
