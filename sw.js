const CACHE='lumensia-shell-v7-stable-v154';
const SHELL=['/','/index.html','/styles.css','/app-runtime.js','/app.js','/assets.js','/manifest.webmanifest'];
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(SHELL.map(url=>c.add(url)))));
});
self.addEventListener('activate',e=>{
  self.clients.claim();
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).pathname.startsWith('/api/'))return;
  e.respondWith(
    fetch(e.request).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy));
      return res;
    }).catch(async()=>await caches.match(e.request)||await caches.match(new URL(e.request.url).pathname))
  );
});
