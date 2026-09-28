const PCAS_URL="https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/pcas.json";
const HMT_URL="https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/HK-MO-TW.json";
let pcasCache=null,hmtCache=null,loadedAt=0;

const FALLBACK_PROVINCES=["北京市","天津市","河北省","山西省","内蒙古自治区","辽宁省","吉林省","黑龙江省","上海市","江苏省","浙江省","安徽省","福建省","江西省","山东省","河南省","湖北省","湖南省","广东省","广西壮族自治区","海南省","重庆市","四川省","贵州省","云南省","西藏自治区","陕西省","甘肃省","青海省","宁夏回族自治区","新疆维吾尔自治区","台湾省","香港特别行政区","澳门特别行政区"];

const PUBLIC_LIVES=[
  {
    id:"livechina-home",
    name:"央视·直播中国",
    place:"全国",
    province:"全国",
    category:"景区慢直播",
    provider:"央视网",
    url:"https://livechina.cctv.com/",
    description:"央视网公开24小时慢直播聚合入口，可切换全国多地实景。"
  },
  {
    id:"zhuqueshan",
    name:"吉林市朱雀山",
    place:"吉林省吉林市",
    province:"吉林省",
    category:"山林景区",
    provider:"央视网·直播中国",
    url:"https://livechina.cctv.com/live_zb/LIVE5110.html",
    description:"朱雀云顶远眺，央视网公开实时慢直播。"
  },
  {
    id:"jingmaishan",
    name:"云南普洱景迈山",
    place:"云南省普洱市澜沧县",
    province:"云南省",
    category:"古茶山",
    provider:"央视网·直播中国",
    url:"https://livechina.cctv.com/live_zb/LIVE4239.html",
    description:"景迈山古茶园与传统村落实景，央视网公开直播。"
  },
  {
    id:"shengsi-harbor",
    name:"嵊泗县中心渔港",
    place:"浙江省舟山市嵊泗县",
    province:"浙江省",
    category:"海港",
    provider:"央视网·直播中国",
    url:"https://livechina.cctv.com/live_zb/LIVE4338.html",
    description:"舟山群岛渔港实时画面，央视网公开直播。"
  },
  {
    id:"anshun-bridge",
    name:"成都安顺廊桥",
    place:"四川省成都市",
    province:"四川省",
    category:"城市景观",
    provider:"央视网·直播中国",
    url:"https://livechina.cctv.com/live_zb/LIVE3199.html",
    description:"成都安顺廊桥公开实景直播。"
  },
  {
    id:"panda-chengdu",
    name:"成都大熊猫24小时",
    place:"四川省成都市",
    province:"四川省",
    category:"动物直播",
    provider:"央视网·熊猫频道",
    url:"https://live.ipanda.com/pandalive/index.shtml",
    description:"成都大熊猫繁育研究基地24小时高清公开直播。"
  },
  {
    id:"panda-dujiangyan",
    name:"都江堰大熊猫24小时",
    place:"四川省成都市都江堰市",
    province:"四川省",
    category:"动物直播",
    provider:"央视网·熊猫频道",
    url:"https://live.ipanda.com/xmwl/index.shtml?channelabled=0",
    description:"中国大熊猫保护研究中心多路24小时公开直播。"
  },
  {
    id:"panda-multiview",
    name:"熊猫频道多路直播",
    place:"成都·都江堰等",
    province:"四川省",
    category:"动物直播",
    provider:"央视网·熊猫频道",
    url:"https://live.ipanda.com/stream/",
    description:"成都、都江堰及珍稀动物公开直播聚合页。"
  }
];

async function getJson(url){
  const r=await fetch(url,{headers:{"User-Agent":"Tianyuan-China-Live/2.0"}});
  if(!r.ok)throw new Error("region-source-"+r.status);
  return r.json();
}
async function loadRegionData(){
  if(pcasCache&&Date.now()-loadedAt<6*60*60*1000)return {pcas:pcasCache,hmt:hmtCache};
  const [pcas,hmt]=await Promise.all([getJson(PCAS_URL),getJson(HMT_URL)]);
  pcasCache=pcas;hmtCache=hmt;loadedAt=Date.now();
  return {pcas,hmt};
}
function uniq(arr){return [...new Set((arr||[]).filter(Boolean))]}

export function registerTianyuanRegionRoutes(app){
  app.get("/api/tianyuan/public-lives",(req,res)=>{
    const province=String(req.query.province||"").trim();
    const category=String(req.query.category||"").trim();
    let items=PUBLIC_LIVES;
    if(province)items=items.filter(x=>x.province===province||x.province==="全国");
    if(category)items=items.filter(x=>x.category===category);
    res.json({ok:true,updatedAt:new Date().toISOString(),items});
  });

  app.get("/api/tianyuan/regions",async(req,res)=>{
    const province=String(req.query.province||"").trim();
    const city=String(req.query.city||"").trim();
    const county=String(req.query.county||"").trim();
    try{
      const {pcas,hmt}=await loadRegionData();
      if(!province)return res.json({ok:true,level:"province",items:uniq([...Object.keys(pcas||{}),...Object.keys(hmt||{})])});
      if(province==="台湾省"||province==="香港特别行政区"||province==="澳门特别行政区"){
        const root=hmt?.[province]||{};
        if(!city)return res.json({ok:true,level:"city",items:Object.keys(root)});
        const counties=Array.isArray(root[city])?root[city]:[];
        if(!county)return res.json({ok:true,level:"county",items:counties});
        return res.json({ok:true,level:"town",items:[]});
      }
      const p=pcas?.[province]||{};
      if(!city)return res.json({ok:true,level:"city",items:Object.keys(p)});
      const c=p?.[city]||{};
      if(!county)return res.json({ok:true,level:"county",items:Object.keys(c)});
      return res.json({ok:true,level:"town",items:Array.isArray(c?.[county])?c[county]:[]});
    }catch(err){
      console.error("[tianyuan regions]",String(err));
      if(!province)return res.json({ok:true,level:"province",items:FALLBACK_PROVINCES,fallback:true});
      return res.status(503).json({ok:false,error:"region-data-unavailable"});
    }
  });

  app.get("/api/tianyuan/place-photo",async(req,res)=>{
    const q=String(req.query.q||"").trim().slice(0,120);
    if(!q)return res.status(400).json({ok:false,error:"query-required"});
    try{
      const params=new URLSearchParams({
        action:"query",generator:"search",gsrsearch:q+" 风景",
        gsrnamespace:"6",gsrlimit:"8",prop:"imageinfo",
        iiprop:"url|extmetadata",iiurlwidth:"1600",format:"json",origin:"*"
      });
      const r=await fetch("https://commons.wikimedia.org/w/api.php?"+params.toString(),{headers:{"User-Agent":"Tianyuan-China-Live/2.0"}});
      if(!r.ok)throw new Error("commons-"+r.status);
      const data=await r.json();
      const pages=Object.values(data?.query?.pages||{}).filter(x=>x?.imageinfo?.[0]?.thumburl);
      const preferred=pages.find(x=>!/map|flag|logo|coat|seal|diagram/i.test(String(x.title||"")))||pages[0];
      if(!preferred)return res.json({ok:true,photo:null});
      const ii=preferred.imageinfo[0],meta=ii.extmetadata||{};
      res.json({ok:true,photo:{
        url:ii.thumburl||ii.url,
        sourceUrl:ii.descriptionurl||"https://commons.wikimedia.org/",
        title:String(meta.ObjectName?.value||preferred.title||"Wikimedia Commons"),
        artist:String(meta.Artist?.value||"").replace(/<[^>]+>/g,"").slice(0,120),
        license:String(meta.LicenseShortName?.value||"").slice(0,80)
      }});
    }catch(err){
      console.error("[tianyuan photo]",String(err));
      res.json({ok:true,photo:null});
    }
  });
}
