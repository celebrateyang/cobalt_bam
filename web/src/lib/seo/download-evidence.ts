export type DownloadEvidence = {
    checkedAt: string;
    sourceUrl: string;
    bytes: number;
    duration: string;
    summary: string;
    scope: string;
};

const evidence: Record<string, DownloadEvidence> = {
    loom: {
        checkedAt: '2026-11-11',
        sourceUrl: 'https://www.loom.com/share/aa3d8b08bee74d05af5b42989e9f33e9',
        bytes: 17952151,
        duration: '00:02:56.59',
        summary: 'On November 11, 2026, we retrieved one complete public Loom sample: a 2 minute 56 second MP4, 17,952,151 bytes. Its video and audio decoded successfully.',
        scope: 'This was a local extraction and complete source-file check, not a test of every Loom link or a completed save through the production website. Browser saving was not tested in this check. Source restrictions can still prevent a result.',
    },
    tumblr: {
        checkedAt: '2026-11-11',
        sourceUrl: 'https://garfield-69.tumblr.com/post/696499862852780032',
        bytes: 3137316,
        duration: '00:00:21.78',
        summary: 'On November 11, 2026, we retrieved one complete public Tumblr sample: a 21 second MP4, 3,137,316 bytes. Its video and audio decoded successfully.',
        scope: 'This was a local extraction and complete source-file check, not a test of every Tumblr post or a completed save through the production website. Browser saving was not tested in this check. Source restrictions can still prevent a result.',
    },
};

export const getDownloadEvidence = (platform: string): DownloadEvidence | undefined => evidence[platform];
