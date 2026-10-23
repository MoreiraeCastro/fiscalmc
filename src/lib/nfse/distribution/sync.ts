import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MtlsHttpClient } from "../client/mtls-http-client";
import { OrganizationCertificateProvider } from "../certificate/organization-provider";
import { distributionEndpoints, getConfiguredNFSeEnvironment } from "../environments";
import type { NFSeEnvironment } from "../types";
import { eCancelamento, lerRespostaDistribuicao, resumirItem } from "./parse";
import { logEvent } from "@/lib/observability/logger";

/** Lotes por rodada (50 documentos cada): a primeira leitura do histórico termina em algumas rodadas, sem segurar o servidor. */
const LOTES_POR_RODADA = 40;
const PAUSA_ENTRE_LOTES_MS = 400;
const TRAVA_MS = 10 * 60 * 1000;
const ESPERA_APOS_429_MS = 60 * 60 * 1000;
const ESPERA_APOS_FALHA_MS = 15 * 60 * 1000;

export type ResultadoSync = { status: "OK" | "EM_ANDAMENTO" | "AGUARDANDO" | "FALHA"; novos: number; ultimoNsu: number; terminou: boolean; mensagem?: string };

const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Lê a distribuição do ADN da empresa a partir do último NSU guardado (só leitura, GET com o A1 dela) e grava os documentos.
 * Uma rodada lê até LOTES_POR_RODADA lotes; o timer e o botão "Atualizar" continuam de onde parou.
 */
export async function sincronizarRecebidas(db: SupabaseClient, organizationId: string, opcoes: { ignorarEspera?: boolean } = {}): Promise<ResultadoSync> {
  const ambiente: NFSeEnvironment = getConfiguredNFSeEnvironment();
  const agora = new Date();
  const { data: empresa } = await db.from("organizations").select("tax_id").eq("id", organizationId).maybeSingle();
  if (!empresa?.tax_id) return { status: "FALHA", novos: 0, ultimoNsu: 0, terminou: false, mensagem: "Empresa não encontrada." };

  await db.from("received_document_cursors").upsert({ organization_id: organizationId, environment: ambiente }, { onConflict: "organization_id,environment", ignoreDuplicates: true });
  const { data: cursor } = await db.from("received_document_cursors").select("last_nsu,next_allowed_at,locked_until,documents_total").eq("organization_id", organizationId).eq("environment", ambiente).single();
  if (!cursor) return { status: "FALHA", novos: 0, ultimoNsu: 0, terminou: false, mensagem: "Cursor indisponível." };
  if (!opcoes.ignorarEspera && cursor.next_allowed_at && new Date(cursor.next_allowed_at) > agora) return { status: "AGUARDANDO", novos: 0, ultimoNsu: Number(cursor.last_nsu), terminou: false, mensagem: "O ADN pediu para esperar antes da próxima leitura." };

  // Trava otimista: só segue quem conseguir gravar locked_until (timer e botão não leem a mesma empresa ao mesmo tempo).
  const { data: travou } = await db.from("received_document_cursors").update({ locked_until: new Date(agora.getTime() + TRAVA_MS).toISOString() })
    .eq("organization_id", organizationId).eq("environment", ambiente).or(`locked_until.is.null,locked_until.lt.${agora.toISOString()}`).select("last_nsu");
  if (!travou?.length) return { status: "EM_ANDAMENTO", novos: 0, ultimoNsu: Number(cursor.last_nsu), terminou: false, mensagem: "Já tem uma leitura em andamento para esta empresa." };

  const http = new MtlsHttpClient(new OrganizationCertificateProvider());
  let ultimoNsu = Number(cursor.last_nsu);
  let novos = 0;
  let terminou = false;
  let status: ResultadoSync["status"] = "OK";
  let mensagem: string | undefined;
  let espera: Date | null = null;
  try {
    for (let lote = 0; lote < LOTES_POR_RODADA; lote++) {
      if (lote) await dormir(PAUSA_ENTRE_LOTES_MS);
      const resposta = await http.requestText({ url: `${distributionEndpoints[ambiente]}/DFe/${ultimoNsu}?lote=true`, organizationId });
      if (resposta.status === 429) { espera = new Date(Date.now() + ESPERA_APOS_429_MS); status = "AGUARDANDO"; mensagem = "O ADN limitou as consultas; a leitura continua mais tarde."; break; }
      const corpo = lerRespostaDistribuicao(resposta.body);
      // 404 com NENHUM_DOCUMENTO_LOCALIZADO é resposta de negócio: não há nada depois deste NSU.
      if (corpo?.status === "NENHUM_DOCUMENTO_LOCALIZADO" || (corpo && corpo.status === "DOCUMENTOS_LOCALIZADOS" && !corpo.itens.length)) { terminou = true; break; }
      if (!corpo || corpo.status !== "DOCUMENTOS_LOCALIZADOS") {
        throw Object.assign(new Error(corpo?.erros ?? `HTTP ${resposta.status}`), { code: corpo?.status === "REJEICAO" ? "ADN_REJEICAO" : "ADN_RESPOSTA_INVALIDA" });
      }
      const linhas = corpo.itens.map((item) => ({ ...resumirItem(item, empresa.tax_id), organization_id: organizationId, environment: ambiente }));
      const { error, count } = await db.from("received_documents").upsert(linhas, { onConflict: "organization_id,environment,nsu", ignoreDuplicates: true, count: "exact" });
      if (error) throw Object.assign(new Error(error.message), { code: "DB_ERROR" });
      novos += count ?? 0;
      await aplicarCancelamentos(db, organizationId, ambiente, linhas);
      ultimoNsu = Math.max(ultimoNsu, ...corpo.itens.map((item) => item.NSU));
      await db.from("received_document_cursors").update({ last_nsu: ultimoNsu }).eq("organization_id", organizationId).eq("environment", ambiente);
      if (corpo.itens.length < 50) { terminou = true; break; }
    }
  } catch (error) {
    status = "FALHA";
    mensagem = "Não foi possível ler as notas no ADN agora.";
    espera = new Date(Date.now() + ESPERA_APOS_FALHA_MS);
    logEvent("error", "RECEIVED_DOCUMENTS_SYNC_FAILED", { organizationId, code: (error as { code?: string }).code ?? "UNKNOWN", lastNsu: ultimoNsu });
  } finally {
    await db.from("received_document_cursors").update({
      locked_until: null, last_sync_at: new Date().toISOString(), last_status: status, last_error: status === "FALHA" ? mensagem : null,
      next_allowed_at: espera?.toISOString() ?? null, documents_total: Number(cursor.documents_total) + novos,
    }).eq("organization_id", organizationId).eq("environment", ambiente);
  }
  return { status, novos, ultimoNsu, terminou, mensagem };
}

/** Evento de cancelamento: marca a NFS-e da mesma chave (se ela já chegou; se chegar depois, ver marcarSeJaCancelada). */
async function aplicarCancelamentos(db: SupabaseClient, organizationId: string, ambiente: NFSeEnvironment, linhas: { access_key: string; document_type: string; event_type: string | null; generated_at: string | null }[]) {
  const cancelamentos = linhas.filter(eCancelamento);
  for (const evento of cancelamentos) {
    await db.from("received_documents").update({ cancelled_at: evento.generated_at ?? new Date().toISOString() })
      .eq("organization_id", organizationId).eq("environment", ambiente).eq("access_key", evento.access_key).eq("document_type", "NFSE").is("cancelled_at", null);
  }
  // NFS-e que chegou num lote depois do próprio cancelamento (pouco provável, a ordem do NSU é cronológica).
  const notas = linhas.filter((linha) => linha.document_type === "NFSE").map((linha) => linha.access_key);
  if (!notas.length) return;
  const { data: antigos } = await db.from("received_documents").select("access_key,generated_at,event_type,document_type")
    .eq("organization_id", organizationId).eq("environment", ambiente).eq("document_type", "EVENTO").in("access_key", notas);
  for (const evento of (antigos ?? []).filter(eCancelamento)) {
    await db.from("received_documents").update({ cancelled_at: evento.generated_at ?? new Date().toISOString() })
      .eq("organization_id", organizationId).eq("environment", ambiente).eq("access_key", evento.access_key).eq("document_type", "NFSE").is("cancelled_at", null);
  }
}

/** Rodada do timer: todas as empresas com certificado atual, uma de cada vez. */
export async function sincronizarTodas(db: SupabaseClient) {
  const { data: certificados } = await db.from("digital_certificates").select("organization_id,status,valid_until").is("replaced_at", null);
  const aptas = (certificados ?? []).filter((item) => ["VALID", "EXPIRING"].includes(item.status) && new Date(item.valid_until) > new Date()).map((item) => item.organization_id);
  const resultados: Record<string, ResultadoSync> = {};
  for (const id of aptas) resultados[id] = await sincronizarRecebidas(db, id);
  return { empresas: aptas.length, novos: Object.values(resultados).reduce((soma, item) => soma + item.novos, 0), falhas: Object.values(resultados).filter((item) => item.status === "FALHA").length };
}
