(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
let prefs=read("lubai:prefs",{like:[],mute:[]});

function applyPrefs(){
  $$(".item[data-title]").forEach(el=>{
    const t=(el.dataset.title||"").toLowerCase();
    const muted=prefs.mute.some(k=>k&&t.includes(k.toLowerCase()));
    const liked=prefs.like.some(k=>k&&t.includes(k.toLowerCase()));
    el.style.display=muted?"none":"";
    el.classList.toggle("preferred",liked);
  });
}
function addPref(kind){
  const label=kind==="like"?"关注":"屏蔽";
  const v=prompt(`输入要${label}的球队、球员或关键词，例如：热刺、姆巴佩、转会`);
  if(!v)return;
  prefs[kind]=[...new Set([...(prefs[kind]||[]),v.trim()])].filter(Boolean);
  write("lubai:prefs",prefs);applyPrefs();renderPrefText();
}
function managePrefs(){
  const like=prompt("关注关键词（用逗号分隔）",(prefs.like||[]).join(","));
  if(like===null)return;
  const mute=prompt("屏蔽关键词（用逗号分隔）",(prefs.mute||[]).join(","));
  if(mute===null)return;
  prefs={like:like.split(/[,，]/).map(x=>x.trim()).filter(Boolean),mute:mute.split(/[,，]/).map(x=>x.trim()).filter(Boolean)};
  write("lubai:prefs",prefs);applyPrefs();renderPrefText();
}
function renderPrefText(){
  const el=$("#prefState");if(!el)return;
  el.textContent=`关注 ${prefs.like.length} · 屏蔽 ${prefs.mute.length}`;
}
$("#addLike")?.addEventListener("click",()=>addPref("like"));
$("#addMute")?.addEventListener("click",()=>addPref("mute"));
$("#managePrefs")?.addEventListener("click",managePrefs);

const saved=read("lubai:savedSearches",[]);
function renderSaved(){
  const sel=$("#savedSearches");if(!sel)return;
  sel.innerHTML='<option value="">已保存筛选</option>'+saved.map((x,i)=>`<option value="${i}">${x.name}</option>`).join("");
}
$("#saveSearch")?.addEventListener("click",()=>{
  const name=prompt("给当前筛选起个名字");if(!name)return;
  saved.unshift({name:name.trim(),url:location.pathname+location.search});
  while(saved.length>20)saved.pop();
  write("lubai:savedSearches",saved);renderSaved();
});
$("#savedSearches")?.addEventListener("change",e=>{if(e.target.value!=="")location.href=saved[Number(e.target.value)].url});

async function enableNotifications(){
  if(!("Notification" in window))return alert("当前浏览器不支持通知");
  const p=await Notification.requestPermission();
  if(p!=="granted")return;
  localStorage.setItem("lubai:notify","1");
  await checkNews(true);
}
$("#notifyToggle")?.addEventListener("click",enableNotifications);
async function checkNews(initial=false){
  if(localStorage.getItem("lubai:notify")!=="1"||Notification.permission!=="granted")return;
  try{
    const r=await fetch("/api/news?important=1&hours=1&sort=latest",{cache:"no-store"});
    const j=await r.json();const items=j.items||[];
    const seen=read("lubai:notified",[]);
    const set=new Set(seen);
    if(!initial){
      for(const x of items.slice(0,5).reverse()){
        const id=x.storyId||x.id;if(set.has(id))continue;
        const url=x.storyId?`/story/${x.storyId}`:"/";
        new Notification("露白足球",{body:x.title,icon:"/icon.svg",data:{url}});
        set.add(id);
      }
    }else items.slice(0,8).forEach(x=>set.add(x.storyId||x.id));
    write("lubai:notified",[...set].slice(-100));
  }catch{}
}
let stream=null;
try{
  stream=new EventSource("/api/stream");
  stream.onmessage=(e)=>{
    try{
      const msg=JSON.parse(e.data||"{}");
      const x=msg.item;
      if(msg.type!=="story"||!x)return;
      if(localStorage.getItem("lubai:notify")==="1"&&Notification.permission==="granted"){
        const seen=read("lubai:notified",[]);
        const set=new Set(seen),id=x.storyId||x.id;
        if(!set.has(id)){
          new Notification("露白足球",{body:x.title,icon:"/icon.svg",data:{url:x.storyId?"/story/"+x.storyId:"/"}});
          set.add(id);write("lubai:notified",[...set].slice(-100));
        }
      }
    }catch{}
  };
}catch{}
setInterval(()=>checkNews(false),60000);
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});

let bookmarks=read("lubai:bookmarks",[]);
function renderBookmarkCount(){const el=$("#bookmarkCount");if(el)el.textContent=String(bookmarks.length)}
$(".saveStory").forEach(btn=>btn.addEventListener("click",()=>{
  const id=btn.dataset.storyId,title=btn.dataset.storyTitle;
  if(!id)return;
  const found=bookmarks.find(x=>x.id===id);
  if(found)bookmarks=bookmarks.filter(x=>x.id!==id);
  else bookmarks.unshift({id,title,at:Date.now()});
  bookmarks=bookmarks.slice(0,200);write("lubai:bookmarks",bookmarks);renderBookmarkCount();
  btn.textContent=found?"稍后读":"已收藏";
}));
$("#showBookmarks")?.addEventListener("click",()=>{
  if(!bookmarks.length)return alert("还没有收藏故事");
  const html=bookmarks.map((x,i)=>(i+1)+". "+x.title+"\n"+location.origin+"/story/"+x.id).join("\n\n");
  alert(html.slice(0,12000));
});
renderBookmarkCount();

applyPrefs();renderPrefText();renderSaved();
})();