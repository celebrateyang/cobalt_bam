# Extension M3 test samples

Use these after loading the unpacked extension from `extension/dist`.

## TikTok

1. Video
   - `https://www.tiktok.com/@fatfatmillycat/video/7195741644585454894`
2. Video
   - `https://www.tiktok.com/@matryoshk4/video/7231234675476532526`
3. Video
   - `https://www.tiktok.com/@blablabla/video/7120851458451417478`
4. Shortlink
   - `https://vt.tiktok.com/2p4ewa7/`
5. Video
   - `https://www.tiktok.com/@.kyle.films/video/7415757181145877793`

Manual checks:
- Video pages should prefer no-watermark or direct play candidates near the top.
- If the page resolves via embed-style fallback, the popup should explain that reliability may be lower.
- Photo/slideshow posts should show images and original audio when available.

## Instagram

1. Post
   - `https://www.instagram.com/p/CmCVWoIr9OH/`
2. Reel
   - `https://www.instagram.com/reel/DFQe23tOWKz/`
3. Reel with tracking params
   - `https://www.instagram.com/reel/CrVB9tatUDv/?igshid=blaBlABALALbLABULLSHIT==`
4. ddinstagram alt domain
   - `https://ddinstagram.com/p/CmCVWoIr9OH/`
5. d.ddinstagram alt domain
   - `https://d.ddinstagram.com/p/CmCVWoIr9OH/`

Manual checks:
- Post and reel pages should beat generic scan and show readable video/image candidates.
- Carousel posts should expose multiple items instead of one anonymous URL.
- Story pages should either show a page-context result or a clear login / limited-support prompt.
