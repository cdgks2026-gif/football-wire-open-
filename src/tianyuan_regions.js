const PCAS_URL="https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/pcas.json";
const HMT_URL="https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/HK-MO-TW.json";
let pcasCache=null,hmtCache=null,loadedAt=0;

const GAOGONG_SOURCE="https://www.sohu.com/a/979391380_121106991";
const GAOGONG_IMAGES=[
  "https://q8.itc.cn/q_70/images03/20260123/aad6a4fd1e234b03a543bcd697f0f603.jpeg",
  "https://q5.itc.cn/q_70/images03/20260123/f642de6006084a908f2ea898eb011169.png",
  "https://q3.itc.cn/q_70/images03/20260123/60a9137393f64a869d665dd97a2fbd3d.png",
  "https://q2.itc.cn/q_70/images03/20260123/cc367ff4eaf74aec8f475bf159bdbafe.png"
];
const FALLBACK_PROVINCES=["北京市","天津市","河北省","山西省","内蒙古自治区","辽宁省","吉林省","黑龙江省","上海市","江苏省","浙江省","安徽省","福建省","江西省","山东省","河南省","湖北省","湖南省","广东省","广西壮族自治区","海南省","重庆市","四川省","贵州省","云南省","西藏自治区","陕西省","甘肃省","青海省","宁夏回族自治区","新疆维吾尔自治区","台湾省","香港特别行政区","澳门特别行政区"];
async function getJson(url){
  const r=await fetch(url,{headers:{"User-Agent":"Tianyuan-Game/1.0"}});
  if(!r.ok)throw new Error("region-source-"+r.status);
  return r.json();
}
async function loadRegionData(){
  if(pcasCache&&Date.now()-loadedAt<6*60*60*1000)return {pcas:pcasCache,hmt:hmtCache};
  const [pcas,hmt]=await Promise.all([getJson(PCAS_URL),getJson(HMT_URL)]);
  pcasCache=pcas;hmtCache=hmt;loadedAt=Date.now();
  return {pcas,hmt};
}
function normalizeProvinceName(name){return String(name||"").trim()}
function uniq(arr){return [...new Set((arr||[]).filter(Boolean))]}
function valuesFor(obj,key){return obj&&typeof obj==="object"?Object.keys(obj[key]||{}):[]}
export function registerTianyuanRegionRoutes(app){
  app.get("/api/tianyuan/regions",async(req,res)=>{
    const province=normalizeProvinceName(req.query.province),city=String(req.query.city||"").trim(),county=String(req.query.county||"").trim();
    try{
      const {pcas,hmt}=await loadRegionData();
      if(!province)return res.json({ok:true,level:"province",items:uniq([...Object.keys(pcas||{}),...Object.keys(hmt||{})])});
      if(province==="台湾省"||province==="香港特别行政区"||province==="澳门特别行政区"){
        const root=hmt?.[province]||{};
        if(!city)return res.json({ok:true,level:"city",items:Object.keys(root)});
        const countyList=Array.isArray(root[city])?root[city]:[];
        if(!county)return res.json({ok:true,level:"county",items:countyList});
        return res.json({ok:true,level:"town",items:[]});
      }
      const p=pcas?.[province]||{};
      if(!city)return res.json({ok:true,level:"city",items:Object.keys(p)});
      const c=p?.[city]||{};
      if(!county)return res.json({ok:true,level:"county",items:Object.keys(c)});
      const towns=Array.isArray(c?.[county])?c[county]:[];
      return res.json({ok:true,level:"town",items:towns});
    }catch(err){
      console.error("[tianyuan regions]",String(err));
      if(!province)return res.json({ok:true,level:"province",items:FALLBACK_PROVINCES,fallback:true});
      return res.status(503).json({ok:false,error:"region-data-unavailable"});
    }
  });

  app.get("/api/tianyuan/gaogong-image/:id",async(req,res)=>{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<0||id>=GAOGONG_IMAGES.length)return res.status(404).end();
    try{
      const upstream=await fetch(GAOGONG_IMAGES[id],{
        headers:{
          "User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
          "Referer":GAOGONG_SOURCE,
          "Accept":"image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        },
        signal:AbortSignal.timeout(10000)
      });
      if(!upstream.ok)throw new Error("image-upstream-"+upstream.status);
      const type=upstream.headers.get("content-type")||"image/jpeg";
      if(!type.startsWith("image/"))throw new Error("not-image");
      const buf=Buffer.from(await upstream.arrayBuffer());
      if(buf.length<1000)throw new Error("image-too-small");
      res.set({
        "Content-Type":type,
        "Cache-Control":"public, max-age=21600, stale-while-revalidate=86400",
        "X-Content-Type-Options":"nosniff",
        "Access-Control-Allow-Origin":"*"
      });
      return res.send(buf);
    }catch(err){
      const labels=["高公村实景","主干水网改造","联手说事现场","文化活动现场"];
      const label=labels[id]||"高公村实景";
      res.set({"Content-Type":"image/svg+xml; charset=utf-8","Cache-Control":"no-store"});
      return res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6f8266"/><stop offset="1" stop-color="#b59b77"/></linearGradient></defs>
        <rect width="1200" height="700" fill="url(#g)"/>
        <path d="M0 470C180 390 340 420 520 350c200-80 420-35 680 85v265H0z" fill="#536d4c" opacity=".9"/>
        <path d="M170 520h280v140H170z" fill="#e8dfcc"/><path d="M140 520l170-120 175 120z" fill="#7a5742"/>
        <text x="600" y="115" text-anchor="middle" font-size="46" fill="white" font-family="sans-serif">山西·洪洞·万安·高公村</text>
        <text x="600" y="180" text-anchor="middle" font-size="30" fill="white" opacity=".9" font-family="sans-serif">${label}</text>
        <text x="600" y="640" text-anchor="middle" font-size="22" fill="white" opacity=".75" font-family="sans-serif">实景源暂时不可访问 · 点击来源可查看公开报道</text>
      </svg>`);
    }
  });

  app.get("/api/tianyuan/place-photo",async(req,res)=>{
    const q=String(req.query.q||"").trim().slice(0,120);
    if(!q)return res.status(400).json({ok:false,error:"query-required"});
    if(/(?:山西省?\s*)?(?:临汾市?\s*)?洪洞县?.*万安镇.*高公村/.test(q)||(/高公村/.test(q)&&/洪洞|万安/.test(q))){
      const sourceUrl=GAOGONG_SOURCE;
      const gallery=[
        {
          url:"/api/tianyuan/gaogong-image/0",
          sourceUrl,
          title:"高公村公开报道现场图",
          artist:"中部城市生活指南 / 千万工程工作专班",
          license:"来源媒体公开发布",
          caption:"高公村实景资料图"
        },
        {
          url:"/api/tianyuan/gaogong-image/1",
          sourceUrl,
          title:"高公村主干水网改造",
          artist:"中部城市生活指南 / 千万工程工作专班",
          license:"来源媒体公开发布",
          caption:"高公村主干水网改造现场"
        },
        {
          url:"/api/tianyuan/gaogong-image/2",
          sourceUrl,
          title:"高公村联手说事",
          artist:"中部城市生活指南 / 千万工程工作专班",
          license:"来源媒体公开发布",
          caption:"高公村基层治理现场"
        },
        {
          url:"/api/tianyuan/gaogong-image/3",
          sourceUrl,
          title:"高公村文化活动",
          artist:"中部城市生活指南 / 千万工程工作专班",
          license:"来源媒体公开发布",
          caption:"高公村文化活动现场"
        }
      ];
      return res.json({ok:true,verified:true,place:"山西省 临汾市 洪洞县 万安镇 高公村",photo:{...gallery[0],gallery}});
    }
    try{
      const params=new URLSearchParams({
        action:"query",generator:"search",gsrsearch:q+" 乡村 风景",gsrnamespace:"6",gsrlimit:"6",
        prop:"imageinfo",iiprop:"url|extmetadata",iiurlwidth:"1500",format:"json",origin:"*"
      });
      const r=await fetch("https://commons.wikimedia.org/w/api.php?"+params.toString(),{headers:{"User-Agent":"Tianyuan-Game/1.0"}});
      if(!r.ok)throw new Error("commons-"+r.status);
      const data=await r.json();
      const pages=Object.values(data?.query?.pages||{}).filter(x=>x?.imageinfo?.[0]?.thumburl);
      const preferred=pages.find(x=>!/map|flag|logo|coat|seal|diagram/i.test(String(x.title||"")))||pages[0];
      if(!preferred)return res.json({ok:true,photo:null});
      const ii=preferred.imageinfo[0],meta=ii.extmetadata||{};
      return res.json({ok:true,photo:{
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
