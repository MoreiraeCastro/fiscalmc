/**
 * Login único do grupo: em produção a equipe do escritório entra pelo login do
 * portal e volta para cá. Quem pode entrar é decidido no cadastro de
 * colaboradores do portal (o banco mantém a participação de escritório).
 * Em desenvolvimento (sem EMISSOR_PORTAL_URL) o formulário local continua valendo.
 */
export const PORTAL_URL = (process.env.EMISSOR_PORTAL_URL ?? (process.env.NODE_ENV === "production" ? "https://portalmoreiraecastro.com.br" : "")).replace(/\/$/, "");

export function portalLoginUrl(next = "/emissor/contribuinte") {
  return `${PORTAL_URL}/entrar?next=${encodeURIComponent(next)}`;
}

export function portalNoAccessUrl() {
  return `${PORTAL_URL}/sem-acesso?sistema=emissor`;
}
