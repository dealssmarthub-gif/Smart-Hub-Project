// Site description, social-preview text and image. Describes only what the
// live site offers; no wallet, escrow, Reserve & Pay or Pay Later until those
// are wired (see appMode LIVE_HIDDEN_PATHS).

export const SITE_TITLE = "NAFLIS Mall — Campus marketplace & student hub";

export const SITE_DESCRIPTION =
  "Buy and sell with students on your campus, and keep up with campus notices, events, lecture notes and past questions.";

/** 1200×630 card in public/. Relative: crawlers that need an absolute URL get it once the production domain is set. */
export const SOCIAL_IMAGE = "/og-image.png";

export function siteMeta() {
  return [
    { title: SITE_TITLE },
    { name: "description", content: SITE_DESCRIPTION },
    { name: "author", content: "NAFLIS" },
    { property: "og:title", content: SITE_TITLE },
    { property: "og:description", content: SITE_DESCRIPTION },
    { property: "og:type", content: "website" },
    { property: "og:image", content: SOCIAL_IMAGE },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: SITE_TITLE },
    { name: "twitter:description", content: SITE_DESCRIPTION },
    { name: "twitter:image", content: SOCIAL_IMAGE },
  ];
}
