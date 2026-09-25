import fs from "node:fs";
import path from "node:path";
const configPath = process.env.SOURCES_FILE || path.join(process.cwd(), "config", "sources.json");
export function loadSources() {
  return JSON.parse(fs.readFileSync(configPath, "utf8")).filter((x) => x.enabled !== false);
}
export function feedUrl(source) {
  if (source.type === "rsshub") {
    return `${(process.env.RSSHUB_URL || "http://rsshub:1200").replace(/\/$/, "")}${source.path}`;
  }
  if (source.type === "gnews") {
    const qs = new URLSearchParams({hl:"zh-CN",gl:"CN",ceid:"CN:zh-Hans",q:source.query});
    return `https://news.google.com/rss/search?${qs.toString()}`;
  }
  if (source.type === "rss") return source.url;
  if (source.type === "json" || source.type === "xpath") {
    const base=(process.env.SELF_FEED_BASE||process.env.PUBLIC_URL||"http://app:8088").replace(/\/$/,"");
    return `${base}/internal/source/${encodeURIComponent(source.name)}`;
  }
  throw new Error(`未知来源类型: ${source.type}`);
}
export const GROUP_META = {
  fast:{title:"Football Wire · 快讯",refreshSeconds:Number(process.env.REFRESH_FAST_SECONDS||60)},
  official:{title:"Football Wire · 官方",refreshSeconds:Number(process.env.REFRESH_OFFICIAL_SECONDS||120)},
  media:{title:"Football Wire · 国际媒体",refreshSeconds:Number(process.env.REFRESH_MEDIA_SECONDS||180)},
  cn:{title:"Football Wire · 中文媒体",refreshSeconds:Number(process.env.REFRESH_CN_SECONDS||300)}
};
