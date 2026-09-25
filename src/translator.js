import crypto from "node:crypto";

const TERMS = [
  // 俱乐部统一使用中文足球社区最常见的简称，避免“皇家马德里/巴塞罗那/托特纳姆热刺”等机械全称。
  [/\bManchester United(?: FC)?\b/gi,"曼联"],[/\bMan Utd\b/gi,"曼联"],
  [/\bManchester City(?: FC)?\b/gi,"曼城"],[/\bMan City\b/gi,"曼城"],
  [/\bLiverpool(?: FC)?\b/gi,"利物浦"],[/\bArsenal(?: FC)?\b/gi,"阿森纳"],
  [/\bChelsea(?: FC)?\b/gi,"切尔西"],[/\bTottenham Hotspur(?: FC)?\b/gi,"热刺"],[/\bTottenham\b/gi,"热刺"],[/\bSpurs\b/gi,"热刺"],
  [/\bNewcastle United(?: FC)?\b/gi,"纽卡"],[/\bAston Villa(?: FC)?\b/gi,"维拉"],[/\bWest Ham United(?: FC)?\b/gi,"西汉姆"],
  [/\bBrighton(?: & Hove Albion)?(?: FC)?\b/gi,"布莱顿"],[/\bEverton(?: FC)?\b/gi,"埃弗顿"],[/\bWolverhampton Wanderers(?: FC)?\b/gi,"狼队"],
  [/\bCrystal Palace(?: FC)?\b/gi,"水晶宫"],[/\bFulham(?: FC)?\b/gi,"富勒姆"],[/\bNottingham Forest(?: FC)?\b/gi,"诺丁汉森林"],
  [/\bBrentford(?: FC)?\b/gi,"布伦特福德"],[/\bAFC Bournemouth\b/gi,"伯恩茅斯"],[/\bLeeds United(?: FC)?\b/gi,"利兹联"],
  [/\bBurnley(?: FC)?\b/gi,"伯恩利"],[/\bSunderland(?: AFC)?\b/gi,"桑德兰"],[/\bHull City(?: AFC)?\b/gi,"赫尔城"],[/\bIpswich Town(?: FC)?\b/gi,"伊普斯维奇"],[/\bCoventry City(?: FC)?\b/gi,"考文垂"],

  [/\bReal Madrid(?: CF)?\b/gi,"皇马"],[/\bFC Barcelona\b/gi,"巴萨"],[/\bBarcelona\b/gi,"巴萨"],
  [/\bAtl[eé]tico Madrid\b/gi,"马竞"],[/\bAtletico Madrid\b/gi,"马竞"],
  [/\bAthletic Club\b/gi,"毕尔巴鄂竞技"],[/\bReal Sociedad\b/gi,"皇家社会"],[/\bSevilla FC\b/gi,"塞维利亚"],[/\bVillarreal CF\b/gi,"比利亚雷亚尔"],
  [/\bReal Betis\b/gi,"贝蒂斯"],[/\bValencia CF\b/gi,"瓦伦西亚"],

  [/\bFC Bayern M(?:ü|u)nchen\b/gi,"拜仁"],[/\bBayern Munich\b/gi,"拜仁"],[/\bBayern\b/gi,"拜仁"],
  [/\bBorussia Dortmund\b/gi,"多特"],[/\bBayer 04 Leverkusen\b/gi,"勒沃库森"],[/\bRB Leipzig\b/gi,"莱比锡"],
  [/\bEintracht Frankfurt\b/gi,"法兰克福"],

  [/\bFC Internazionale Milano\b/gi,"国米"],[/\bInternazionale\b/gi,"国米"],[/\bInter Milan\b/gi,"国米"],
  [/\bAC Milan\b/gi,"AC米兰"],[/\bJuventus(?: FC)?\b/gi,"尤文"],[/\bSSC Napoli\b/gi,"那不勒斯"],[/\bNapoli\b/gi,"那不勒斯"],
  [/\bAS Roma\b/gi,"罗马"],[/\bSS Lazio\b/gi,"拉齐奥"],[/\bAtalanta BC\b/gi,"亚特兰大"],

  [/\bParis Saint-Germain(?: FC)?\b/gi,"巴黎"],[/\bPSG\b/gi,"巴黎"],[/\bOlympique de Marseille\b/gi,"马赛"],
  [/\bOlympique Lyonnais\b/gi,"里昂"],[/\bAS Monaco\b/gi,"摩纳哥"],[/\bLOSC Lille\b/gi,"里尔"],

  // 已经是中文全称时也归一为常用叫法。
  [/皇家马德里/g,"皇马"],[/巴塞罗那/g,"巴萨"],[/托特纳姆热刺/g,"热刺"],[/拜仁慕尼黑/g,"拜仁"],
  [/巴黎圣日耳曼/g,"巴黎"],[/国际米兰/g,"国米"],[/尤文图斯/g,"尤文"],[/马德里竞技/g,"马竞"],[/多特蒙德/g,"多特"],

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
]

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
