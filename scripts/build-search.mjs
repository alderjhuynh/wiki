import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WIKI_DIR = path.resolve(__dirname, "..");
const OUTPUT = path.join(WIKI_DIR, "search.json");

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

function cleanText(html) {
  return decodeEntities(stripTags(html))
    .replace(/\s+/g, " ")
    .trim();
}

function excerptFrom(text, maxLen = 200) {
  if (text.length <= maxLen) return text;
  let cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) cut = cut.slice(0, lastSpace);
  return cut + "…";
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "search.json") continue;
    if (entry.name === "scripts") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

function parseFile(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  const relUrl = path.relative(WIKI_DIR, filePath).replace(/\\/g, "/");
  const entries = [];

  let pageTitle = "";
  const h1Match = html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) pageTitle = cleanText(h1Match[1]);
  if (!pageTitle) {
    const tMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (tMatch) pageTitle = cleanText(tMatch[1]).replace(/\s*-\s*AuraSMP Wiki\s*$/i, "").trim();
  }
  if (!pageTitle) pageTitle = path.basename(path.dirname(relUrl)) || "Home";
  if (relUrl === "index.html") pageTitle = "Overview";

  const sectionLabel = pageTitle;

  let subtitle = "";
  const subMatch = html.match(/<p[^>]*class="[^"]*page-subtitle[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  if (subMatch) subtitle = cleanText(subMatch[1]);

  let dek = "";
  const dekMatch = html.match(/<p[^>]*class="[^"]*hero-dek[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  if (dekMatch) dek = cleanText(dekMatch[1]);

  const pageScopeMatch = html.match(/<div[^>]*id="page-content-scope"[^>]*>([\s\S]*?)<\/div>\s*<footer/i);
  const pageScopeText = pageScopeMatch ? cleanText(pageScopeMatch[1]) : "";
  const pageExcerpt = excerptFrom(subtitle || dek || pageScopeText || cleanText(html).slice(0, 300), 200);

  entries.push({
    title: pageTitle,
    url: relUrl,
    section: relUrl === "index.html" ? "Home" : sectionLabel,
    excerpt: pageExcerpt,
  });

  const sectionRegex = /<section[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/gi;
  let m;
  while ((m = sectionRegex.exec(html)) !== null) {
    const id = m[1];
    const inner = m[2];
    const h2Match = inner.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const h2Text = h2Match ? cleanText(h2Match[1]) : id;
    const text = cleanText(inner);
    const withoutHeading = text.replace(h2Text, "").trim().replace(/^\W+/, "");
    const excerpt = excerptFrom(withoutHeading || text, 220);
    entries.push({
      title: h2Text,
      url: `${relUrl}#${id}`,
      section: sectionLabel,
      excerpt,
    });

   const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    let rowCount = 0;
    while ((trMatch = trRegex.exec(inner)) !== null) {
      if (/<th/i.test(trMatch[1])) continue;
      const rowText = cleanText(trMatch[1]);
      if (rowText.length < 10) continue;
      if (rowCount++ >= 15) break;
      const tdMatch = trMatch[1].match(/<td[^>]*>([\s\S]*?)<\/td>/i);
      const rowTitle = tdMatch ? cleanText(tdMatch[1]).slice(0, 60) : h2Text;
      if (rowText.length > 500) continue;
      if (rowTitle && rowTitle.toLowerCase() !== h2Text.toLowerCase()) {
        entries.push({
          title: rowTitle,
          url: `${relUrl}#${id}`,
          section: sectionLabel,
          excerpt: excerptFrom(rowText, 160),
        });
      }
    }
  }

  if (relUrl === "index.html") {
    const idxMatch = html.match(/<ul[^>]*class="[^"]*section-index[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
    if (idxMatch) {
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let li;
      while ((li = liRegex.exec(idxMatch[1])) !== null) {
        const nameMatch = li[1].match(/<span[^>]*class="[^"]*section-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        const descMatch = li[1].match(/<span[^>]*class="[^"]*section-desc[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        const hrefMatch = li[1].match(/href="([^"]+)"/i);
        const name = nameMatch ? cleanText(nameMatch[1]) : "";
        const desc = descMatch ? cleanText(descMatch[1]) : "";
        const href = hrefMatch ? hrefMatch[1] : "";
        if (name && href) {
          entries.push({
            title: name,
            url: href,
            section: "Sections",
            excerpt: desc || name,
          });
        }
      }
    }
  }

  return entries;
}

function build() {
  const files = walk(WIKI_DIR).sort();
  const all = [];
  const seen = new Set();

  for (const f of files) {
    const ents = parseFile(f);
    for (const e of ents) {
      const key = `${e.url}::${e.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      e.excerpt = e.excerpt.replace(/\s+/g, " ").trim();
      if (!e.title || !e.excerpt) continue;
      all.push(e);
    }
  }

  all.sort((a, b) => {
    if (a.url === "index.html") return -1;
    if (b.url === "index.html") return 1;
    return (a.section + a.title).localeCompare(b.section + b.title);
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(all, null, 2) + "\n", "utf8");
  console.log(`[build-search] Wrote ${all.length} entries from ${files.length} files → ${path.relative(process.cwd(), OUTPUT)}`);
  if (all.length < 5) console.warn("[build-search] WARNING: very few entries — check parsing");
  return all;
}

function watchMode() {
  build();
  console.log("[build-search] Watching for changes... (Ctrl+C to exit)");
  const watcher = fs.watch(WIKI_DIR, { recursive: true }, (event, filename) => {
    if (!filename) return;
    if (!filename.endsWith(".html")) return;
    if (filename.includes("search.json")) return;
    console.log(`[build-search] ${event} ${filename} → rebuilding`);
    try {
      build();
    } catch (e) {
      console.error("[build-search] rebuild failed:", e.message);
    }
  });
  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
}

const args = process.argv.slice(2);
if (args.includes("--watch") || args.includes("-w")) {
  watchMode();
} else {
  build();
}
