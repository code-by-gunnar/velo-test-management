# SEO Implementation Plan

**Current score: 3/10** — robots.txt intentionally blocking during active development. When ready to launch, follow this checklist in order.

## Pre-Launch Checklist (Do on launch day)

### 1. Update robots.txt
**File:** `apps/web/public/robots.txt`
**Status:** Intentionally blocking during dev. Update when ready.

```
User-agent: *
Disallow: /app/
Disallow: /onboarding
Disallow: /accept-invite
Disallow: /reset-password
Disallow: /forgot-password
Disallow: /verify
Allow: /

Sitemap: https://runvelo.app/sitemap.xml
```

### 2. Create sitemap.xml
**File:** `apps/web/public/sitemap.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://runvelo.app/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://runvelo.app/why-velo</loc>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://runvelo.app/pricing</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://runvelo.app/signup</loc>
    <changefreq>never</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://runvelo.app/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
```

### 3. Add Open Graph + Twitter meta tags
**Files:** `index.tsx`, `why-velo.tsx`, `pricing.tsx`

Each public page needs:
```tsx
<meta property="og:type" content="website" />
<meta property="og:title" content="{page title}" />
<meta property="og:description" content="{page description}" />
<meta property="og:url" content="https://runvelo.app/{path}" />
<meta property="og:image" content="https://runvelo.app/og-image.png" />
<meta property="og:locale" content="en_US" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{page title}" />
<meta name="twitter:description" content="{page description}" />
<meta name="twitter:image" content="https://runvelo.app/og-image.png" />
<link rel="canonical" href="https://runvelo.app/{path}" />
```

**Action needed:** Create `og-image.png` (1200x630px) — Velo logo + tagline on brand background.

### 4. Add JSON-LD structured data
**File:** `apps/web/src/pages/_document.tsx`

Organization schema + SoftwareApplication schema. See SEO audit for exact code.

### 5. Add viewport meta to _document.tsx
```tsx
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
```

### 6. Add noindex to auth pages
**Files:** `login.tsx`, `signup.tsx`
```tsx
<meta name="robots" content="noindex, follow" />
```

## Post-Launch (Week 1)

### 7. Google Search Console
- Create property for `runvelo.app`
- Verify via DNS TXT record in Cloudflare
- Submit sitemap
- Monitor crawl errors

### 8. Google Analytics 4
- Create GA4 property
- Add tracking snippet to `_document.tsx` or `_app.tsx`
- Set up conversion goal: signup completion

### 9. Domain migration (vercel.app → runvelo.app)
- Add 301 redirects in next.config.ts:
```ts
async redirects() {
  return [{
    source: '/:path*',
    has: [{ type: 'host', value: 'velo-test-management.vercel.app' }],
    destination: 'https://runvelo.app/:path*',
    permanent: true,
  }]
}
```
- Update all hardcoded URLs in codebase
- Update canonical tags
- Update sitemap domain
- Monitor GSC for 30 days post-migration

## Content Strategy (Month 1-3)

### Target Keywords

| Keyword | Volume | Competition | Velo Angle |
|---------|--------|-------------|------------|
| test management tool | High | High | "for startups, not enterprises" |
| test case management | Medium | Medium | "keyboard-first, 30 seconds" |
| BDD testing tool | Low | Low | "native, not a plugin" |
| QA management software | Medium | High | "AI spec-to-test" |
| CI/CD test results | Medium | Medium | "zero config ingestion" |
| Linear test management | Low | Very Low | Only tool with native Linear |
| AI test case generation | Low | Low | Unique differentiator |

### Blog Posts (planned)

1. "Why 75% of Testing Problems Start Before Testing" — targets requirements quality
2. "BDD Without Gherkin: Native Given-When-Then in Your Test Tool" — targets BDD keywords
3. "Test Management for Startups: What You Actually Need" — targets startup ICP
4. "CI/CD Test Results Without the Dashboard Fatigue" — targets CI integration
5. "From Linear Spec to Test Case in 10 Seconds" — product showcase

### Future Pages

| Page | Purpose | Priority |
|------|---------|----------|
| `/pricing` | Conversion (created as placeholder) | Launch day |
| `/about` | Founder credibility, mission | Post-launch |
| `/blog` | Content hub, SEO traffic | Month 1-2 |
| `/docs` | Help center, integration guides | Month 2-3 |
| `/changelog` | Release notes, trust signal | Month 1 |
| `/compare/testrail` | Competitor keyword capture | Month 2 |

## Technical Notes

- Next.js 16 Pages Router handles SSR meta tags correctly
- Font loading uses `display: "swap"` — good for CLS
- All images are SVG (tiny) — no optimization needed
- Bundle size ~250KB gzipped — acceptable
- No CLS/LCP issues expected from current design
