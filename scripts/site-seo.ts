import { basename } from "node:path";
import type { HtmlTagDescriptor, Plugin } from "vite";

export const sitePages = ["index.html", "solar-system.html", "moon-landing.html", "iss.html", "about.html"] as const;

const creator = {
  "@type": "Person",
  name: "Yaseen Feroz",
  url: "https://yaseenferoz.github.io/yaseen-feroz/",
};

function siteOrigin(value: string | undefined): string | undefined {
  if (!value?.trim()) return;

  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash ||
      url.username || url.password || url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new Error("SITE_URL must be the public HTTPS origin at the root of the site.");
  }
  return url.origin;
}

const pagePath = (file: string) => file === "index.html" ? "/" : `/${file}`;

export function siteSeo(siteUrl: string | undefined, verification: string | undefined): Plugin {
  const origin = siteOrigin(siteUrl);
  const verificationCode = verification?.trim();

  return {
    name: "universal-cosmos-seo",
    transformIndexHtml(html, context) {
      const file = basename(context.filename);
      if (!sitePages.some((page) => file === page)) return;

      const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
      const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1];
      if (!title || !description) throw new Error(`Missing title or description in ${file}.`);

      const isHome = file === "index.html";
      const isAbout = file === "about.html";
      const url = origin && `${origin}${pagePath(file)}`;
      const tags: HtmlTagDescriptor[] = [
        { tag: "meta", attrs: { property: "og:type", content: isHome || isAbout ? "website" : "article" } },
        { tag: "meta", attrs: { property: "og:site_name", content: "Universal Cosmos" } },
        { tag: "meta", attrs: { property: "og:title", content: title } },
        { tag: "meta", attrs: { property: "og:description", content: description } },
        ...(url ? [
          { tag: "link", attrs: { rel: "canonical", href: url } },
          { tag: "meta", attrs: { property: "og:url", content: url } },
        ] : []),
        ...(isHome && verificationCode ? [{
          tag: "meta",
          attrs: { name: "google-site-verification", content: verificationCode },
        }] : []),
      ];
      if (origin && url && (isHome || isAbout)) {
        const website = { "@type": "WebSite", name: "Universal Cosmos", url: `${origin}/`, creator };
        tags.push({
          tag: "script",
          attrs: { type: "application/ld+json" },
          children: JSON.stringify({
            "@context": "https://schema.org",
            ...(isHome ? website : { "@type": "AboutPage", name: "About Universal Cosmos", url, mainEntity: website }),
          }).replaceAll("<", "\\u003c"),
        });
      }
      return tags.map((tag) => ({ ...tag, injectTo: "head" }));
    },
    generateBundle() {
      const robots = "User-agent: *\nAllow: /\n";
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: origin ? `${robots}\nSitemap: ${origin}/sitemap.xml\n` : robots,
      });
      if (!origin) return;

      const urls = sitePages.map((file) => `  <url><loc>${origin}${pagePath(file)}</loc></url>`).join("\n");
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}
