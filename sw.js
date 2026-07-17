const CACHE="staysync-sales-map-v21";
const CORE=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
const EXTERNAL=["https://unpkg.com/leaflet@1.9.4/dist/leaflet.css","https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"];
self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(async cache=>{
    await cache.addAll(CORE);
    await Promise.allSettled(EXTERNAL.map(url=>cache.add(url)));
  }));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.hostname.endsWith("tile.openstreetmap.org")){
    event.respondWith(caches.open(CACHE).then(async cache=>{
      const cached=await cache.match(event.request);
      if(cached) return cached;
      try{
        const response=await fetch(event.request);
        if(response.ok) cache.put(event.request,response.clone());
        return response;
      }catch{
        return new Response("",{status:504,statusText:"Offline"});
      }
    }));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>{
    if(cached) return cached;
    return fetch(event.request).then(response=>{
      if(response.ok && (url.origin===self.location.origin || url.hostname==="unpkg.com")){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }).catch(()=>caches.match("./index.html"));
  }));
});