# Search and AI discovery maintenance

Official play URL: https://stormbreakers.onrender.com/
English URL: https://stormbreakers.onrender.com/en/
Source: https://github.com/aotefan/stormbreakers

## Implemented

- Build-time React prerendering makes the same visible descriptions, controls, links and FAQs readable without executing JavaScript. JavaScript remains required to play.
- Chinese and English routes have distinct titles/descriptions, self-canonical URLs and reciprocal hreflang links.
- VideoGame, SoftwareSourceCode and WebPage JSON-LD describe actual features and reference the public source. No invented ratings, reviews, affiliations or usage counts.
- Open Graph and Twitter metadata use a real 1200×630 gameplay screenshot.
- robots.txt allows page and asset crawling and points to the two-page XML sitemap. No stale or speculative last-modified dates are added.
- Unknown routes/assets return 404; `/en` redirects to `/en/`. HTML revalidates while hashed assets receive immutable caching.
- llms.txt summarizes the game and links to primary sources. It is supplementary and is not a standardized requirement for Google AI features.
- GitHub README files, repository homepage and topics point readers to the playable demo.

## After deployment

1. Verify the live page source contains the new content and `/healthz` identifies the expected runtime and commit.
2. Verify domain ownership in Google Search Console and Bing Webmaster Tools with an account that owns the site. Submit https://stormbreakers.onrender.com/sitemap.xml there and inspect both language routes. This is not done automatically by committing a sitemap.
3. Monitor actual indexing, impressions, click-through and referrals. Search engines decide whether and when to crawl, index and cite a site.
4. When hosting changes, update `src/site.ts`, the public discovery files and package/README URLs, then rebuild and revalidate.

References: [Google AI features and your website](https://developers.google.com/search/docs/appearance/ai-features), [Google JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Google structured data introduction](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data).

Google's AI features use the same foundational SEO practices. No special schema or text file guarantees inclusion. Hosting cold starts and availability can affect crawling and user experience.
