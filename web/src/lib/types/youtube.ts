import type { CobaltErrorResponse } from './api';

export type YouTubeVideo = {
    id: string;
    url: string;
    title: string;
    channel: string;
    thumbnail: string;
    duration: number | null;
};

export type YouTubeSearchResponse = {
    status: 'ok';
    query: string;
    items: YouTubeVideo[];
} | CobaltErrorResponse;
