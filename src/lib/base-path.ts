/**
 * Single source of truth for the app's basePath. next.config.ts reads this
 * for the framework-level setting; anything that references a public/
 * static asset by absolute path (metadata icons, manifest, next/image src,
 * service worker registration) must prefix it manually — Next.js only
 * applies basePath automatically to next/link and next/navigation routing.
 */
export const BASE_PATH = "/emissor";

/**
 * Client components call our own route handlers with a root-relative
 * fetch("/api/...") — Next.js does not rewrite those to the basePath the
 * way it does next/link and next/navigation. Wrap every such path in this
 * before passing it to fetch().
 */
export function apiUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}

/**
 * Redirecionamento de route handler para um caminho do app. Usa Location relativo: atrás do nginx o
 * `request.url` é o endereço interno (localhost:3002), e montar a URL com ele mandava o navegador para lá.
 * Só aceita caminho interno ("/..."), nunca outro site.
 */
export function appRedirectLocation(path: string): string {
  const safe = path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/contribuinte";
  return `${BASE_PATH}${safe}`;
}
