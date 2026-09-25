import crypto from "node:crypto";

const TERMS = [
  [/\bManchester United\b/gi,"曼联"],[/\bMan Utd\b/gi,"曼联"],
  [/\bReal Madrid\b/gi,"皇家马德里"],[/\bBarcelona\b/gi,"巴塞罗那"],
  [/\bManchester City\b/gi,"曼城"],[/\bLiverpool\b/gi,"利物浦"],
  [/\bArsenal\b/gi,"阿森纳"],[/\bChelsea\b/gi,"切尔西"],
  [/\bTottenham Hotspur\b/gi,"托特纳姆热刺"],[/\bTottenham\b/gi,"热刺"],
  [/\bBayern Munich\b/gi,"拜仁慕尼黑"],[/\bParis Saint-Germain\b/gi,"巴黎圣日耳曼"],
  [/\bPSG\b/gi,"巴黎圣日耳曼"],[/\bInter Milan\b/gi,"国际米兰"],
  [/\bAC Milan\b/gi,"AC米兰"],[/\bJuventus\b/gi,"尤文图斯"],
  [/\bAtletico Madrid\b/gi,"马德里竞技"],[/\bBorussia Dortmund\b/gi,"多特蒙德"],
  [/\bKylian Mbapp[eé]\b/gi,"基利安·姆巴佩"],[/\bMbapp[eé]\b/gi,"姆巴佩"],
  [/\bLamine Yamal\b/gi,"拉明·亚马尔"],[/\bErling Haaland\b/gi,"埃尔林·哈兰德"],
  [/\bLionel Messi\b/gi,"利昂内尔·梅西"],[/\bCristiano Ronaldo\b/gi,"克里斯蒂亚诺·罗纳尔多"],
  [/\bJude Bellingham\b/gi,"裘德·贝林厄姆"],[/\bVin[ií]cius J[uú]nior\b/gi,"维尼修斯·儒尼奥尔"],
  [/\bMohamed Salah\b/gi,"穆罕默德·萨拉赫"],[/\bHarry Kane\b/gi,"哈里·凯恩"],
  [/\bPedri\b/gi,"佩德里"],[/\bRaphinha\b/gi,"拉菲尼亚"],
  [/\bOusmane Demb[eé]l[eé]\b/gi,"奥斯曼·登贝莱"],[/\bFlorian Wirtz\b/gi,"弗洛里安·维尔茨"],
  [/\bMichael Olise\b/gi,"迈克尔·奥利塞"],[/\bSon Heung-min\b/gi,"孙兴慜"],
  [/\bFabrizio Romano\b/gi,"法布里齐奥·罗马诺"],[/\bDavid Ornstein\b/gi,"大卫·奥恩斯坦"],
  [/\bGianluca Di Marzio\b/gi,"詹卢卡·迪马济奥"],[/\bFlorian Plettenberg\b/gi,"弗洛里安·普莱滕贝格"],
  [/\bMatteo Moretto\b/gi,"马泰奥·莫雷托"],[/\bBen Jacobs\b/gi,"本·雅各布斯"],
  [/\bHere we go\b/gi,"交易确认"],[/\bBreaking\b/gi,"突发"],[/\bOfficial\b/gi,"官方确认"],
  [/\bPremier League\b/gi,"英超"],[/\bChampions League\b/gi,"欧冠"],
  [/\bLa Liga\b/gi,"西甲"],[/\bWorld Cup\b/gi,"世界杯"],[/\bVAR\b/gi,"视频助理裁判"]
];

export function normalizeTerms(text) {
  let out = String(text || "").replace(/\s+/g, " ").trim();
  for (const [pattern, value] of TERMS) out = out.replace(pattern, value);
  return out;
}

export function chineseRatio(text) {
  const clean = String(text || "").replace(/[\d\s\p{P}\p{S}]/gu, "");
  if (!clean) return 0;
  const count = (clean.match(/[\u4e00-\u9fff]/g) || []).length;
  return count / clean.length;
}

function key(text) {
  return crypto.createHash("sha1").update(String(text)).digest("hex");
}

async function libreTranslate(text, source="auto") {
  const url = (process.env.LIBRETRANSLATE_URL || "http://libretranslate:5000").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.TRANSLATE_TIMEOUT_MS || 12000));
  try {
    const res = await fetch(`${url}/translate`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({q:text,source,target:"zh",format:"text"}),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`翻译服务 ${res.status}`);
    const body = await res.json();
    return body.translatedText || "";
  } finally {
    clearTimeout(timer);
  }
}

export async function toChineseTitle(rawTitle, cache, options={}) {
  const raw = String(rawTitle || "").trim();
  if (!raw) return "";
  const cacheKey = key(raw);
  if (cache[cacheKey]) return cache[cacheKey];

  const pre = normalizeTerms(raw);
  if (chineseRatio(pre) >= 0.52) {
    cache[cacheKey] = pre;
    return pre;
  }

  for (const source of ["auto","en"]) {
    try {
      const translated = normalizeTerms(await libreTranslate(pre,source));
      if (translated && chineseRatio(translated) >= 0.42) {
        cache[cacheKey] = translated;
        return translated;
      }
    } catch {}
  }

  // 高价值来源翻译失败时不丢新闻；不缓存原文，下一轮仍会继续尝试翻译。
  if(options.allowOriginal){
    return pre;
  }
  return "";
}
