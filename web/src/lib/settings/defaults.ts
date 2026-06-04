import { device } from "$lib/device";
import { defaultLocale } from "$lib/i18n/translations";
import type { CobaltSettings } from "$lib/types/settings";

const defaultSettings: CobaltSettings = {
    schemaVersion: 6,
    advanced: {
        debug: false,
        useWebCodecs: false,
    },
    appearance: {
        theme: "auto",
        language: defaultLocale,
        autoLanguage: true,
        hideRemuxTab: false,
        reduceMotion: false,
        reduceTransparency: false,
    },
    accessibility: {
        disableHaptics: false,
        dontAutoOpenQueue: false,
    },
    save: {
        alwaysProxy: false,
        localProcessing:
            device.supports.defaultLocalProcessing ? "preferred" : "disabled",
        audioBitrate: "128",
        audioFormat: "mp3",
        disableMetadata: false,
        downloadMode: "auto",
        filenameStyle: "basic",
        savingMethod: "download",
        allowH265: false,
        tiktokFullAudio: false,
        convertGif: true,
        videoQuality: "1080",
        subtitleLang: "none",
        youtubeVideoCodec: "h264",
        youtubeVideoContainer: "auto",
        youtubeDubLang: "original",
        youtubeDubBrowserLang: false,
        youtubeHLS: false,
        youtubeBetterAudio: false,
        tiktokH265: false,
        twitterGif: true,
    },
    privacy: {
        disableAnalytics: false,
    },
    processing: {
        customInstanceURL: "",
        customApiKey: "",
        enableCustomInstances: false,
        enableCustomApiKey: false,
        seenCustomWarning: false,
        allowDefaultOverride: false,
        seenOverrideWarning: false,
    }
}

export default defaultSettings;
