// Emissor como aplicativo. De propósito este service worker não intercepta nada (sem "fetch"): antes ele passava toda
// página e consulta por aqui e guardava as respostas no navegador, inclusive as telas logadas com dados de clientes,
// e cada página esperava o service worker acordar. Agora ele só existe para o app continuar instalável e para apagar
// o que a versão anterior guardou ("moreira-castro-shell-*").
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((nome) => nome.startsWith("moreira-castro-shell")).map((nome) => caches.delete(nome)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.disable();
    await self.clients.claim();
  })());
});
