/**
 * Scene data for the scroll-scrub journey — THE file you fill in per build.
 *
 * Single-shot (the default): ONE entry in `scenes`, whose `clip` is the single
 * continuous film. Chapter copy still comes from `chapters` below, rendered as
 * semantic sections over that one clip.
 *
 * Multi-leg (opt-in): one entry per seam-locked leg, in journey order. Every
 * `poster` MUST be the exact first frame of the encoded clip beside it — never
 * a design board or an imagined destination still.
 *
 * Keep this array a module constant. Changing its identity on every render
 * intentionally rebuilds the media controller.
 */
import type {
  ScrollScrubScene,
  ScrollScrubTheme,
} from "@/components/scroll-scrub/scroll-scrub";

/** Brand tokens for the journey layer. Set these from the design brief. */
export const scrollScrubTheme: ScrollScrubTheme = {
  accent: "<accent hex>",
  background: "<background hex>",
  ink: "<ink hex>",
  muted: "<muted ink hex>",
};

export const scrollScrubScenes: ScrollScrubScene[] = [
  {
    body: "<one sentence that earns the next scroll>",
    clip: "/assets/world/scene-01.mp4",
    id: "scene-01",
    kicker: "<kicker>",
    label: "<nav label>",
    mobileClip: "/assets/world/scene-01-mobile.mp4",
    mobilePoster: "/assets/world/scene-01-mobile-poster.png",
    poster: "/assets/world/scene-01-poster.png",
    tags: ["<proof tag>"],
    title: "<scene headline>",
  },
];
