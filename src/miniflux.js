import { feedUrl, GROUP_META } from "./sources.js";

function authHeader() {
  const user = process.env.MINIFLUX_USERNAME || "admin";
  const pass = process.env.MINIFLUX_PASSWORD || "change-this-password";
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}
const base = () => (process.env.MINIFLUX_URL || "http://miniflux:8080").replace(/\/$/, "");

async function api(path, options = {}) {
  const res = await fetch(`${base()}${path}`, {
    ...options,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Miniflux ${res.status} ${path}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function waitForMiniflux(timeoutMs = 180000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(`${base()}/readyz`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("等待 Miniflux 就绪超时");
}

async function ensureCategory(title) {
  const categories = await api("/v1/categories");
  const found = categories.find((c) => c.title === title);
  if (found) return found;
  return api("/v1/categories", {
    method: "POST",
    body: JSON.stringify({ title })
  });
}

export async function bootstrapSources(sources) {
  await waitForMiniflux();
  const categories = {};
  for (const [group, meta] of Object.entries(GROUP_META)) {
    categories[group] = await ensureCategory(meta.title);
  }

  let feeds = await api("/v1/feeds");
  const created = [];
  const sourceByFeedId = {};

  for (const source of sources) {
    const url = feedUrl(source);
    let feed = feeds.find((f) => f.feed_url === url);

    if (!feed) {
      try {
        const made = await api("/v1/feeds", {
          method: "POST",
          body: JSON.stringify({
            feed_url: url,
            category_id: categories[source.group].id,
            crawler: false,
            ignore_http_cache: false
          })
        });
        const id = made.feed_id;
        await api(`/v1/feeds/${id}`, {
          method: "PUT",
          body: JSON.stringify({ title: source.name, category_id: categories[source.group].id })
        });
        created.push(source.name);
        feeds = await api("/v1/feeds");
        feed = feeds.find((f) => f.id === id);
      } catch (err) {
        console.error("[bootstrap] 无法订阅:", source.name, String(err));
        continue;
      }
    } else if (feed.title !== source.name || feed.category?.id !== categories[source.group].id) {
      try {
        await api(`/v1/feeds/${feed.id}`, {
          method: "PUT",
          body: JSON.stringify({ title: source.name, category_id: categories[source.group].id })
        });
      } catch {}
    }

    if (feed) {
      sourceByFeedId[feed.id] = {
        name: source.name,
        tier: source.tier,
        group: source.group,
        type: source.type
      };
    }
  }
  return { categories, sourceByFeedId, created };
}

export async function refreshCategory(categoryId) {
  return api(`/v1/categories/${categoryId}/refresh`, { method: "PUT" });
}

export async function getRecentEntries(days = 5, limit = 500) {
  const after = Math.floor((Date.now() - days * 86400000) / 1000);
  const qs = new URLSearchParams({
    limit: String(limit),
    order: "published_at",
    direction: "desc",
    published_after: String(after)
  });
  const result = await api(`/v1/entries?${qs.toString()}`);
  return result.entries || [];
}

export async function minifluxHealth() {
  try {
    const res = await fetch(`${base()}/readyz`);
    return res.ok;
  } catch {
    return false;
  }
}
