# Extension M2 test samples

Use these samples for manual regression after loading `extension/dist` in Chrome.

## Douyin

1. Short link / slides share
   - `https://v.douyin.com/UNCzQqhJ3SI`
2. Note page
   - `https://www.douyin.com/note/7505833844370607414`
3. Standard video page
   - Add one current public `https://www.douyin.com/video/:id` sample here after verification.
4. Share video page
   - Add one current public `https://www.douyin.com/share/video/:id` sample here after verification.
5. `jingxuan` modal page
   - Add one current public `https://www.douyin.com/jingxuan?modal_id=:id` sample here after verification.

Manual checks:
- Start playback for 1-2 seconds before scanning on video pages.
- The default result should show at most 1-3 high-confidence candidates.
- Prefer direct `douyinvod` / `bytevod` / `zjcdn` style URLs over noisy generic results.
- If direct MP4 is unavailable, the popup should explain whether playback or login is needed.

## Bilibili

1. 1080p video
   - `https://www.bilibili.com/video/BV18i4y1m7xV/`
2. 1080p vertical video
   - `https://www.bilibili.com/video/BV1uu411z7VV/`
3. Shortlink
   - `https://b23.tv/av32430100`
4. Multi-page / part id
   - `https://www.bilibili.com/video/BV1uo4y1K72s?spm_id_from=333.788.videopod.episodes&p=6`
5. Bilibili.tv
   - `https://www.bilibili.tv/en/video/4789599404426256`

Manual checks:
- Scan after the page player is ready.
- Do not show `data.bilibili.com/log` or other analytics noise.
- Video and audio streams should be clearly labeled instead of appearing as anonymous direct links.
- The popup should preserve download, copy, and open-in-FreeSaveVideo actions.
