const PCAS_URL="https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/pcas.json";
const HMT_URL="https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/HK-MO-TW.json";
let pcasCache=null,hmtCache=null,loadedAt=0;
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

  app.get("/api/tianyuan/place-photo",async(req,res)=>{
    const q=String(req.query.q||"").trim().slice(0,120);
    if(!q)return res.status(400).json({ok:false,error:"query-required"});
    if(/(?:山西省?\s*)?(?:临汾市?\s*)?洪洞县?.*万安镇.*高公村/.test(q)||(/高公村/.test(q)&&/洪洞|万安/.test(q))){
      const sourceUrl="https://www.sohu.com/a/979391380_121106991";
      const gallery=[
        {
          url:"https://q8.itc.cn/q_70/images03/20260123/aad6a4fd1e234b03a543bcd697f0f603.jpeg",
          sourceUrl,
          title:"高公村公开报道现场图",
          artist:"中部城市生活指南 / 千万工程工作专班",
          license:"来源媒体公开发布",
          caption:"高公村实景资料图"
        },
        {
          url:"https://q5.itc.cn/q_70/images03/20260123/f642de6006084a908f2ea898eb011169.png",
          sourceUrl,
          title:"高公村主干水网改造",
          artist:"中部城市生活指南 / 千万工程工作专班",
          license:"来源媒体公开发布",
          caption:"高公村主干水网改造现场"
        },
        {
          url:"https://q3.itc.cn/q_70/images03/20260123/60a9137393f64a869d665dd97a2fbd3d.png",
          sourceUrl,
          title:"高公村联手说事",
          artist:"中部城市生活指南 / 千万工程工作专班",
          license:"来源媒体公开发布",
          caption:"高公村基层治理现场"
        },
        {
          url:"https://q2.itc.cn/q_70/images03/20260123/cc367ff4eaf74aec8f475bf159bdbafe.png",
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
