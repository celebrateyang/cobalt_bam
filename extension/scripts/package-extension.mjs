import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'release');
const outFile = path.join(outDir, 'freesavevideo-extension.zip');

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

const dosDateTime = (date) => {
    const year = Math.max(date.getFullYear(), 1980);
    const dosTime =
        (date.getHours() << 11) |
        (date.getMinutes() << 5) |
        Math.floor(date.getSeconds() / 2);
    const dosDate =
        ((year - 1980) << 9) |
        ((date.getMonth() + 1) << 5) |
        date.getDate();
    return { dosDate, dosTime };
};

const writeUInt16 = (value) => {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value);
    return buffer;
};

const writeUInt32 = (value) => {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(value);
    return buffer;
};

const collectFiles = async (dir) => {
    const files = [];
    const walk = async (current) => {
        for (const entry of await fs.readdir(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else {
                files.push(full);
            }
        }
    };
    await walk(dir);
    return files;
};

await fs.mkdir(outDir, { recursive: true });

const output = createWriteStream(outFile);
const centralDirectory = [];
let offset = 0;

for (const file of await collectFiles(dist)) {
    const stat = await fs.stat(file);
    const data = await fs.readFile(file);
    const relativeName = path.relative(dist, file).replaceAll('\\', '/');
    const name = Buffer.from(relativeName, 'utf8');
    const checksum = crc32(data);
    const { dosDate, dosTime } = dosDateTime(stat.mtime);

    const localHeader = Buffer.concat([
        writeUInt32(0x04034b50),
        writeUInt16(20),
        writeUInt16(0x0800),
        writeUInt16(0),
        writeUInt16(dosTime),
        writeUInt16(dosDate),
        writeUInt32(checksum),
        writeUInt32(data.length),
        writeUInt32(data.length),
        writeUInt16(name.length),
        writeUInt16(0),
        name,
    ]);

    output.write(localHeader);
    output.write(data);

    centralDirectory.push({
        name,
        checksum,
        size: data.length,
        offset,
        dosDate,
        dosTime,
    });

    offset += localHeader.length + data.length;
}

const centralStart = offset;

for (const file of centralDirectory) {
    const header = Buffer.concat([
        writeUInt32(0x02014b50),
        writeUInt16(20),
        writeUInt16(20),
        writeUInt16(0x0800),
        writeUInt16(0),
        writeUInt16(file.dosTime),
        writeUInt16(file.dosDate),
        writeUInt32(file.checksum),
        writeUInt32(file.size),
        writeUInt32(file.size),
        writeUInt16(file.name.length),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt32(0),
        writeUInt32(file.offset),
        file.name,
    ]);
    output.write(header);
    offset += header.length;
}

const centralSize = offset - centralStart;
output.end(
    Buffer.concat([
        writeUInt32(0x06054b50),
        writeUInt16(0),
        writeUInt16(0),
        writeUInt16(centralDirectory.length),
        writeUInt16(centralDirectory.length),
        writeUInt32(centralSize),
        writeUInt32(centralStart),
        writeUInt16(0),
    ]),
);

await new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
});

console.log(`Wrote ${outFile}`);
