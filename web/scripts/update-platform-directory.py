"""Refresh the public directory snapshot and local Simple Icons assets.

Uses the official list pinned to the API image version. Extractor families are grouped;
the extended list is a compatibility catalog, not a list of verified downloads.
"""
import concurrent.futures
import html
import json
import re
import unicodedata
import urllib.request
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
dockerfile = (ROOT.parent / 'Dockerfile').read_text(encoding='utf-8')
SOURCE_VERSION = re.search(r'ARG YTDLP_VERSION=([\d.]+)', dockerfile).group(1)
SOURCE_TAG = '.'.join(part.zfill(2) if index else part for index, part in enumerate(SOURCE_VERSION.split('.')))
SOURCE_URL = f'https://raw.githubusercontent.com/yt-dlp/yt-dlp/{SOURCE_TAG}/supportedsites.md'
ICONS_VERSION = '11.15.0'
ICON_SOURCE = f'https://raw.githubusercontent.com/simple-icons/simple-icons/{ICONS_VERSION}'

def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()

def normalize(value):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower())

primary = [
    ('youtube', 'YouTube', 'youtube'), ('tiktok', 'TikTok', 'tiktok'),
    ('douyin', 'Douyin', 'tiktok'), ('instagram', 'Instagram', 'instagram'),
    ('bilibili', 'Bilibili', 'bilibili'), ('wechat_channels', 'WeChat Channels', 'wechat'),
    ('facebook', 'Facebook', 'facebook'), ('twitter', 'X / Twitter', 'x'),
    ('xiaohongshu', 'Xiaohongshu', 'xiaohongshu'), ('pinterest', 'Pinterest', 'pinterest'),
    ('iqiyi', 'iQIYI', 'iqiyi'), ('kuaishou', 'Kuaishou', 'kuaishou'),
    ('xinpianchang', 'Xinpianchang', ''), ('magnific', 'Magnific', ''),
    ('reddit', 'Reddit', 'reddit'), ('threads', 'Threads', 'threads'),
    ('vimeo', 'Vimeo', 'vimeo'), ('soundcloud', 'SoundCloud', 'soundcloud'),
    ('snapchat', 'Snapchat', 'snapchat'), ('weibo', 'Weibo', 'sinaweibo'),
    ('naver', 'NAVER', 'naver'), ('sooplive', 'SOOP', ''),
    ('niconico', 'Niconico', 'niconico'), ('amazon', 'Amazon Live', 'amazon'),
    ('haokan', 'Haokan', 'baidu'), ('toutiao', 'Toutiao', ''),
    ('sohu', 'Sohu Video', ''), ('kugou', 'Kugou Music', ''),
    ('bsky', 'Bluesky', 'bluesky'), ('cctv', 'CCTV', ''),
    ('dailymotion', 'Dailymotion', 'dailymotion'), ('loom', 'Loom', 'loom'),
    ('newgrounds', 'Newgrounds', ''), ('ok', 'OK.ru', 'odnoklassniki'),
    ('rutube', 'Rutube', ''), ('streamable', 'Streamable', ''),
    ('tumblr', 'Tumblr', 'tumblr'), ('twitch', 'Twitch Clips', 'twitch'),
    ('vk', 'VK', 'vk'), ('tencent_video', 'Tencent Video', ''),
    ('bjnews', 'The Beijing News', ''), ('ourjiangsu', 'Our Jiangsu', ''),
    ('deeplearningai', 'DeepLearning.AI', ''),
]
icons = json.loads(fetch(f'{ICON_SOURCE}/_data/simple-icons.json'))['icons']
icon_map = {normalize(item['title']): item for item in icons}
icon_slugs = {}
for item in icons:
    slug = item.get('slug') or normalize(item['title'].replace('+', 'plus').replace('.', 'dot').replace('&', 'and'))
    icon_slugs[normalize(item['title'])] = slug

rows = []
for ident, name, icon in primary:
    entry = {'id': ident, 'name': name}
    key = normalize(icon)
    if key in icon_map:
        entry.update(logo=icon_slugs[key], color='#' + icon_map[key]['hex'])
    rows.append(entry)

excluded = {normalize(name) for _, name, _ in primary} | {normalize(i) for i, _, _ in primary}
excluded.update(['generic', 'unsupportedurl', 'testurl', 'youtube', 'bilibili', 'twitch', 'amazonstore', 'wechat', 'weixin', 'html5', 'html5media', 'commonmistakes', 'go'])
families = {}
for line in fetch(SOURCE_URL).decode('utf-8').splitlines():
    match = re.match(r'\s*- \*\*([^*]+)\*\*', line)
    if not match or 'Currently broken' in line:
        continue
    name = match.group(1).replace('\u200b', '').split(':')[0]
    key = normalize(name)
    if any(key.startswith(base) for base in excluded if len(base) > 3) or key in excluded:
        continue
    # Discard collection-only aliases when their base family is present.
    name = re.sub(r'(?i)(Playlist|Collection|Channel|Season|Series|Episode|User|Profile|Search|Albums|Album|Videos|Video|Clips|Clip|Embed|Article|Show)$', '', name)
    key = normalize(name)
    if not key or key in excluded:
        continue
    entry = {'id': key, 'name': name}
    if key in icon_map and key not in {'bt', 'apple', 'fathom', 'glide'}:
        entry.update(name=icon_map[key]['title'], logo=icon_slugs[key], color='#' + icon_map[key]['hex'])
    families.setdefault(key, entry)

extra = sorted(families.values(), key=lambda item: (not bool(item.get('logo')), item['name'].lower()))
asset_dir = ROOT / 'static/platforms'
asset_dir.mkdir(parents=True, exist_ok=True)
slugs = sorted({row['logo'] for row in rows + extra if row.get('logo')})

def save_icon(slug):
    try:
        content = fetch(f'{ICON_SOURCE}/icons/{slug}.svg')
        (asset_dir / f'{slug}.svg').write_bytes(content)
        return slug
    except Exception:
        return None

with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    saved = set(pool.map(save_icon, slugs))
for row in rows + extra:
    if row.get('logo') not in saved:
        row.pop('logo', None)
        row.pop('color', None)

# Use the platform's own published favicon when there is no matching brand SVG.
official_sites = {
    'iqiyi': 'https://www.iqiyi.com', 'xinpianchang': 'https://www.xinpianchang.com',
    'magnific': 'https://magnific.ai', 'sooplive': 'https://www.sooplive.co.kr',
    'toutiao': 'https://www.toutiao.com', 'sohu': 'https://tv.sohu.com',
    'kugou': 'https://www.kugou.com', 'cctv': 'https://www.cctv.com',
    'newgrounds': 'https://www.newgrounds.com', 'rutube': 'https://rutube.ru',
    'streamable': 'https://streamable.com', 'tencent_video': 'https://v.qq.com',
    'bjnews': 'https://www.bjnews.com.cn', 'ourjiangsu': 'https://www.ourjiangsu.com',
    'deeplearningai': 'https://www.deeplearning.ai',
}

def save_favicon(row):
    site = official_sites.get(row['id'])
    if not site or row.get('logo'):
        return
    filename = f"{row['id']}-favicon"
    existing = list(asset_dir.glob(filename + '.*'))
    if existing:
        row['image'] = '/platforms/' + existing[0].name
        row['imageSource'] = site
        return
    candidates = [site + '/favicon.ico']
    try:
        document = fetch(site).decode('utf-8', errors='replace')
        for tag in re.findall(r'<link\b[^>]*>', document, re.I):
            if re.search(r'rel\s*=\s*[\"\'][^\"\']*(?:icon)', tag, re.I):
                match = re.search(r'href\s*=\s*[\"\']([^\"\']+)', tag, re.I)
                if match:
                    candidates.insert(0, urllib.parse.urljoin(site, html.unescape(match.group(1))))
    except Exception:
        pass
    for url in candidates[:6]:
        try:
            content = fetch(url)
            if content.startswith(b'\x89PNG'):
                extension = 'png'
            elif content.startswith(b'\x00\x00\x01\x00'):
                extension = 'ico'
            elif b'<svg' in content[:500]:
                extension = 'svg'
            elif content.startswith(b'RIFF') and b'WEBP' in content[:16]:
                extension = 'webp'
            else:
                continue
            (asset_dir / f'{filename}.{extension}').write_bytes(content)
            row['image'] = f'/platforms/{filename}.{extension}'
            row['imageSource'] = url
            return
        except Exception:
            pass

with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    list(pool.map(save_favicon, rows))

target = ROOT / 'src/lib/data/platform-directory.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps({'sourceVersion': SOURCE_VERSION, 'sourceUrl': SOURCE_URL, 'primary': rows, 'additional': extra}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(asset_dir / 'README.md').write_text(f'Brand SVGs: Simple Icons {ICONS_VERSION}, https://github.com/simple-icons/simple-icons (CC0).\nBrand names and marks belong to their respective owners. No affiliation is implied.\nRefresh with web/scripts/update-platform-directory.py.\n', encoding='utf-8')
print(f'{len(rows)} primary entries, {len(extra)} extended families, {len(saved - {None})} local logos; extractor version {SOURCE_VERSION}')
