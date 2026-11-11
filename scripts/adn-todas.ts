// Lê a distribuição do ADN (emitidas fora + recebidas) de todas as empresas com A1 válido, em rodadas, até cada uma chegar ao fim.
// Rodar no servidor: nohup node_modules/.bin/tsx --env-file=.env.local --import ./scripts/server-only-shim.mjs scripts/adn-todas.ts > ~/adn-todas.log 2>&1 &
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarRecebidas } from "@/lib/nfse/distribution/sync";

const db = createAdminClient();
const { data: certs } = await db.from("digital_certificates").select("organization_id,status,valid_until").is("replaced_at", null);
let pendentes = (certs ?? []).filter((c) => ["VALID", "EXPIRING"].includes(c.status) && new Date(c.valid_until) > new Date()).map((c) => c.organization_id as string);
const total = pendentes.length;
const fim: Record<string, string> = {};
let novos = 0;
for (let rodada = 1; pendentes.length && rodada <= 60; rodada++) {
  const seguir: string[] = [];
  for (const id of pendentes) {
    const r = await sincronizarRecebidas(db, id, { ignorarEspera: rodada === 1 }).catch((e) => ({ status: "FALHA", novos: 0, terminou: false, mensagem: String(e) }) as const);
    novos += r.novos;
    if (r.terminou) fim[id] = "OK";
    else if (r.status === "OK" || r.status === "EM_ANDAMENTO") seguir.push(id);
    else fim[id] = `${r.status}: ${r.mensagem ?? ""}`.slice(0, 120);
  }
  console.log(new Date().toISOString(), `rodada ${rodada}: ${total - seguir.length}/${total} concluídas, ${novos} documentos novos no total`);
  pendentes = seguir;
}
const resumo: Record<string, number> = {};
for (const v of Object.values(fim)) { const k = v.split(":")[0]; resumo[k] = (resumo[k] ?? 0) + 1; }
console.log("FIM", JSON.stringify(resumo), "ainda pendentes:", pendentes.length);
for (const [id, v] of Object.entries(fim)) if (v !== "OK") console.log("  ", id, v);
