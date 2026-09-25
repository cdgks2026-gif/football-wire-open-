(()=>{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

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
    const j=await r.json(),items=j.items||[];
    const seen=read("lubai:notified",[]),set=new Set(seen);
    if(!initial){
      for(const x of items.slice(0,5).reverse()){
        const id=x.storyId||x.id;if(set.has(id))continue;
        const url=x.storyId?`/story/${x.storyId}`:"/";
        const n=new Notification("露白足球",{body:x.title,icon:"/icon.svg",data:{url}});
        n.onclick=()=>{window.focus();location.href=url};
        set.add(id);
      }
    }else items.slice(0,8).forEach(x=>set.add(x.storyId||x.id));
    write("lubai:notified",[...set].slice(-100));
  }catch{}
}

try{
  const stream=new EventSource("/api/stream");
  stream.onmessage=(e)=>{
    try{
      const msg=JSON.parse(e.data||"{}"),x=msg.item;
      if(msg.type!=="story"||!x||localStorage.getItem("lubai:notify")!=="1"||Notification.permission!=="granted")return;
      const seen=read("lubai:notified",[]),set=new Set(seen),id=x.storyId||x.id;
      if(set.has(id))return;
      const url=x.storyId?"/story/"+x.storyId:"/";
      const n=new Notification("露白足球",{body:x.title,icon:"/icon.svg",data:{url}});
      n.onclick=()=>{window.focus();location.href=url};
      set.add(id);write("lubai:notified",[...set].slice(-100));
    }catch{}
  };
}catch{}
setInterval(()=>checkNews(false),60000);

let bookmarks=read("lubai:bookmarks",[]);
function renderBookmarkCount(){const el=$("#bookmarkCount");if(el)el.textContent=String(bookmarks.length)}
$$(".saveStory").forEach(btn=>btn.addEventListener("click",()=>{
  const id=btn.dataset.storyId,title=btn.dataset.storyTitle;if(!id)return;
  const found=bookmarks.find(x=>x.id===id);
  bookmarks=found?bookmarks.filter(x=>x.id!==id):[{id,title,at:Date.now()},...bookmarks].slice(0,200);
  write("lubai:bookmarks",bookmarks);renderBookmarkCount();
  btn.textContent=found?"收藏":"已收藏";
}));
$("#showBookmarks")?.addEventListener("click",()=>{
  if(!bookmarks.length)return alert("还没有收藏新闻");
  location.href="/search?q="+encodeURIComponent(bookmarks[0]?.title||"");
});
renderBookmarkCount();

$$(".shareStory").forEach(btn=>btn.addEventListener("click",async()=>{
  const id=btn.dataset.storyId,title=btn.dataset.storyTitle||"露白足球";
  const url=id?location.origin+"/story/"+encodeURIComponent(id):location.href;
  try{
    if(navigator.share)await navigator.share({title,text:title,url});
    else if(navigator.clipboard){await navigator.clipboard.writeText(title+"\n"+url);btn.textContent="已复制";setTimeout(()=>btn.textContent="分享",1200)}
  }catch{}
}));

document.addEventListener("keydown",(e)=>{
  if(e.key==="/"&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||"")){
    const q=document.querySelector('input[name="q"],#q');if(q){e.preventDefault();q.focus()}
  }
});

if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"}).then(r=>{r.update().catch(()=>{});setInterval(()=>r.update().catch(()=>{}),5*60*1000)}).catch(()=>{});

const net=document.createElement("div");
net.style.cssText="position:fixed;right:10px;bottom:10px;z-index:99;padding:5px 8px;border-radius:8px;font:12px system-ui;background:#0c1813;color:#91a59c;border:1px solid #233b31;display:none";
document.body.appendChild(net);
function renderNetwork(){net.style.display=navigator.onLine?"none":"block";net.textContent="离线：显示缓存内容"}
addEventListener("online",renderNetwork);addEventListener("offline",renderNetwork);renderNetwork();
})();