import { buildPodcastEpisodeResult } from "../podcast.js";

export default async function (patternMatch) {
    return buildPodcastEpisodeResult(patternMatch);
}
