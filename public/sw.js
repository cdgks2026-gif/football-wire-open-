const CACHE="lubai-v7-news";
const SHELL=["/manifest.webmanifest","/icon.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin)return;
  if(u.pathname==="/"||u.pathname.startsWith("/api/")||u.pathname.startsWith("/story/")||u.pathname.startsWith("/search")){
    e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  const url=e.notification.data?.url||"/";
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(ws=>{
    const w=ws[0];if(w){w.navigate(url);return w.focus()}return clients.openWindow(url);
  }));
});
