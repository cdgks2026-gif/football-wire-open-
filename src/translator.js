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

  // 五大联赛完整俱乐部映射：西甲
  [/\bCA Osasuna\b/gi,"奥萨苏纳"],[/\bDeportivo Alav[eé]s\b/gi,"阿拉维斯"],[/\bElche CF\b/gi,"埃尔切"],[/\bGetafe CF\b/gi,"赫塔费"],
  [/\bLevante UD\b/gi,"莱万特"],[/\bM[aá]laga CF\b/gi,"马拉加"],[/\bRC Celta de Vigo\b/gi,"塞尔塔"],[/\bRC Deportivo La Coru[nñ]a\b/gi,"拉科鲁尼亚"],
  [/\bRCD Espanyol de Barcelona\b/gi,"西班牙人"],[/\bRayo Vallecano de Madrid\b/gi,"巴列卡诺"],[/\bReal Betis Balompi[eé]\b/gi,"贝蒂斯"],
  [/\bReal Racing Club de Santander\b/gi,"桑坦德竞技"],[/\bReal Sociedad de F[uú]tbol\b/gi,"皇家社会"],

  [/\bReal Madrid(?: CF)?\b/gi,"皇马"],[/\bFC Barcelona\b/gi,"巴萨"],[/\bBarcelona\b/gi,"巴萨"],
  [/\bAtl[eé]tico Madrid\b/gi,"马竞"],[/\bAtletico Madrid\b/gi,"马竞"],
  [/\bAthletic Club\b/gi,"毕尔巴鄂竞技"],[/\bReal Sociedad\b/gi,"皇家社会"],[/\bSevilla FC\b/gi,"塞维利亚"],[/\bVillarreal CF\b/gi,"比利亚雷亚尔"],
  [/\bReal Betis\b/gi,"贝蒂斯"],[/\bValencia CF\b/gi,"瓦伦西亚"],

  // 五大联赛完整俱乐部映射：意甲
  [/\bAC Monza\b/gi,"蒙扎"],[/\bACF Fiorentina\b/gi,"佛罗伦萨"],[/\bBologna FC 1909\b/gi,"博洛尼亚"],[/\bCagliari Calcio\b/gi,"卡利亚里"],
  [/\bComo 1907\b/gi,"科莫"],[/\bFrosinone Calcio\b/gi,"弗罗西诺内"],[/\bGenoa CFC\b/gi,"热那亚"],[/\bParma Calcio 1913\b/gi,"帕尔马"],
  [/\bTorino FC\b/gi,"都灵"],[/\bUS Lecce\b/gi,"莱切"],[/\bUS Sassuolo Calcio\b/gi,"萨索洛"],[/\bUdinese Calcio\b/gi,"乌迪内斯"],[/\bVenezia FC\b/gi,"威尼斯"],

  // 五大联赛完整俱乐部映射：德甲
  [/\b1\. FC K[oö]ln\b/gi,"科隆"],[/\b1\. FC Union Berlin\b/gi,"柏林联合"],[/\b1\. FSV Mainz 05\b/gi,"美因茨"],
  [/\bBorussia M[oö]nchengladbach\b/gi,"门兴"],[/\bFC Augsburg\b/gi,"奥格斯堡"],[/\bFC Schalke 04\b/gi,"沙尔克04"],
  [/\bHamburger SV\b/gi,"汉堡"],[/\bSC Freiburg\b/gi,"弗赖堡"],[/\bSC Paderborn 07\b/gi,"帕德博恩"],[/\bSV 07 Elversberg\b/gi,"埃弗斯堡"],
  [/\bSV Werder Bremen\b/gi,"不莱梅"],[/\bTSG 1899 Hoffenheim\b/gi,"霍芬海姆"],[/\bVfB Stuttgart\b/gi,"斯图加特"],

  [/\bFC Bayern M(?:ü|u)nchen\b/gi,"拜仁"],[/\bBayern Munich\b/gi,"拜仁"],[/\bBayern\b/gi,"拜仁"],
  [/\bBorussia Dortmund\b/gi,"多特"],[/\bBayer 04 Leverkusen\b/gi,"勒沃库森"],[/\bRB Leipzig\b/gi,"莱比锡"],
  [/\bEintracht Frankfurt\b/gi,"法兰克福"],

  [/\bFC Internazionale Milano\b/gi,"国米"],[/\bInternazionale\b/gi,"国米"],[/\bInter Milan\b/gi,"国米"],
  [/\bAC Milan\b/gi,"AC米兰"],[/\bJuventus(?: FC)?\b/gi,"尤文"],[/\bSSC Napoli\b/gi,"那不勒斯"],[/\bNapoli\b/gi,"那不勒斯"],
  [/\bAS Roma\b/gi,"罗马"],[/\bSS Lazio\b/gi,"拉齐奥"],[/\bAtalanta BC\b/gi,"亚特兰大"],

  // 五大联赛完整俱乐部映射：法甲
  [/\bAJ Auxerre\b/gi,"欧塞尔"],[/\bAS Monaco FC\b/gi,"摩纳哥"],[/\bAngers SCO\b/gi,"昂热"],[/\bES Troyes AC\b/gi,"特鲁瓦"],
  [/\bFC Lorient\b/gi,"洛里昂"],[/\bLe Havre AC\b/gi,"勒阿弗尔"],[/\bLe Mans FC\b/gi,"勒芒"],[/\bLille OSC\b/gi,"里尔"],
  [/\bOGC Nice\b/gi,"尼斯"],[/\bParis FC\b/gi,"巴黎FC"],[/\bRC Strasbourg Alsace\b/gi,"斯特拉斯堡"],[/\bRacing Club de Lens\b/gi,"朗斯"],
  [/\bStade Brestois 29\b/gi,"布雷斯特"],[/\bStade Rennais FC 1901\b/gi,"雷恩"],[/\bToulouse FC\b/gi,"图卢兹"],

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
