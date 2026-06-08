import { promises as fs } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const root = process.cwd();
const dist = path.join(root, 'dist');

const crcTable = new Uint32Array(256).map((_, index) => {
    let c = index;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
    return Buffer.concat([length, typeBuffer, data, checksum]);
};

const pointInPolygon = (px, py, points) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        const intersects =
            yi > py !== yj > py &&
            px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
};

const writePng = async (file, size) => {
    const raw = Buffer.alloc((size * 4 + 1) * size);
    const radius = size * 0.22;
    const scale = size / 128;
    const logoScale = 4 * scale;
    const logoX = 16 * scale;
    const logoY = 32 * scale;
    const logoPolygons = [
        [
            [0, 15.6363],
            [0, 12.8594],
            [9.47552, 8.293],
            [0, 3.14038],
            [0, 0.363525],
            [12.8575, 7.4908],
            [12.8575, 9.21862],
        ],
        [
            [11.1425, 15.6363],
            [11.1425, 12.8594],
            [20.6181, 8.293],
            [11.1425, 3.14038],
            [11.1425, 0.363525],
            [24, 7.4908],
            [24, 9.21862],
        ],
    ].map((polygon) =>
        polygon.map(([x, y]) => [logoX + x * logoScale, logoY + y * logoScale]),
    );

    for (let y = 0; y < size; y += 1) {
        const row = y * (size * 4 + 1);
        raw[row] = 0;
        for (let x = 0; x < size; x += 1) {
            const i = row + 1 + x * 4;
            const dx = Math.max(radius - x, 0, x - (size - radius - 1));
            const dy = Math.max(radius - y, 0, y - (size - radius - 1));
            const outside = dx * dx + dy * dy > radius * radius;

            if (outside) {
                raw[i] = 0;
                raw[i + 1] = 0;
                raw[i + 2] = 0;
                raw[i + 3] = 0;
            } else {
                raw[i] = 74;
                raw[i + 1] = 122;
                raw[i + 2] = 28;
                raw[i + 3] = 255;
            }

            if (logoPolygons.some((polygon) => pointInPolygon(x + 0.5, y + 0.5, polygon))) {
                raw[i] = 255;
                raw[i + 1] = 255;
                raw[i + 2] = 255;
                raw[i + 3] = 255;
            }
        }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    await fs.writeFile(
        file,
        Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            chunk('IHDR', ihdr),
            chunk('IDAT', deflateSync(raw)),
            chunk('IEND', Buffer.alloc(0)),
        ]),
    );
};

await fs.mkdir(path.join(dist, 'icons'), { recursive: true });
await fs.mkdir(path.join(dist, 'popup'), { recursive: true });
await fs.copyFile(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));

const builtPopupPath = path.join(dist, 'src', 'popup', 'index.html');
const popupHtml = await fs.readFile(builtPopupPath, 'utf8');
await fs.writeFile(
    path.join(dist, 'popup', 'index.html'),
    popupHtml.replaceAll('"/assets/', '"../assets/'),
);
await fs.rm(path.join(dist, 'src'), { recursive: true, force: true });

for (const size of [16, 32, 48, 128]) {
    await writePng(path.join(dist, 'icons', `icon-${size}.png`), size);
}
