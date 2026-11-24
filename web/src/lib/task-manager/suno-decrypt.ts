const decodeKey = (value: string) => {
    if (!/^[A-Za-z0-9+/]{22}==$/.test(value)) throw new Error('Invalid playback data');
    return Uint8Array.from(atob(value), char => char.charCodeAt(0));
};

// The source is the encrypted public playback asset, not an MP4 video.
export async function decryptSunoFile(file: File, encryption: { key: string; counter: string }): Promise<File> {
    // Web Crypto decrypts a whole buffer; bound peak memory on mobile devices.
    if (file.size < 16 || file.size > 128 * 1024 * 1024) throw new Error('Unsupported playback size');
    const keyBytes = decodeKey(encryption.key);
    const counter = decodeKey(encryption.counter);
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CTR', false, ['decrypt']);
    const bytes = await crypto.subtle.decrypt({ name: 'AES-CTR', counter, length: 128 }, key, await file.arrayBuffer());
    const header = new Uint8Array(bytes, 4, 4);
    if (String.fromCharCode(...header) !== 'ftyp') throw new Error('Invalid playback container');
    return new File([bytes], 'suno-audio.m4a', { type: 'audio/mp4' });
}
