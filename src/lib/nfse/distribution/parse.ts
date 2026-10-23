// Distribuição do ADN (GET /contribuintes/DFe/{ultimoNSU}?lote=true). Funções puras: ler o lote e resumir cada documento.
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { lerNfseOficial } from "@/lib/contribuinte/nfse-oficial";

/** Formato visto na consulta de 23/10/2026 (produção): 50 itens por lote, XML em gzip+base64. */
const itemSchema = z.object({
  NSU: z.coerce.number().int().positive(),
  ChaveAcesso: z.string().min(1),
  TipoDocumento: z.string().min(1),
  TipoEvento: z.string().nullish(),
  ArquivoXml: z.string().min(1),
  DataHoraGeracao: z.string().nullish(),
});
const respostaSchema = z.object({
  StatusProcessamento: z.string(),
  LoteDFe: z.array(itemSchema).nullish(),
  Alertas: z.unknown().optional(),
  Erros: z.unknown().optional(),
});

export type ItemDistribuicao = z.infer<typeof itemSchema>;
export type RespostaDistribuicao = { status: "DOCUMENTOS_LOCALIZADOS" | "NENHUM_DOCUMENTO_LOCALIZADO" | "REJEICAO" | "OUTRO"; itens: ItemDistribuicao[]; erros: string | null };

export function lerRespostaDistribuicao(corpo: string): RespostaDistribuicao | null {
  let json: unknown;
  try { json = JSON.parse(corpo); } catch { return null; }
  const parsed = respostaSchema.safeParse(json);
  if (!parsed.success) return null;
  const status = (["DOCUMENTOS_LOCALIZADOS", "NENHUM_DOCUMENTO_LOCALIZADO", "REJEICAO"] as const).find((item) => item === parsed.data.StatusProcessamento) ?? "OUTRO";
  const erros = parsed.data.Erros && JSON.stringify(parsed.data.Erros) !== "[]" ? JSON.stringify(parsed.data.Erros).slice(0, 500) : null;
  return { status, itens: parsed.data.LoteDFe ?? [], erros };
}

export function descompactarXml(arquivo: string) {
  return gunzipSync(Buffer.from(arquivo, "base64")).toString("utf8");
}

export type Papel = "PRESTADOR" | "TOMADOR" | "INTERMEDIARIO" | "OUTRO";

/** lerNfseOficial já devolve centavos; só garante inteiro. */
function centavos(valor: number | null) {
  return valor === null ? null : Math.round(valor);
}

/**
 * Linha de received_documents para um item do lote. A NFS-e é resumida para a lista; o evento só guarda o tipo
 * (a chave do item é a da NFS-e a que ele se refere).
 */
export function resumirItem(item: ItemDistribuicao, cnpjEmpresa: string) {
  const xml = descompactarXml(item.ArquivoXml);
  const base = {
    nsu: item.NSU, access_key: item.ChaveAcesso, document_type: item.TipoDocumento, event_type: item.TipoEvento ?? null,
    generated_at: item.DataHoraGeracao ? `${item.DataHoraGeracao.replace(/Z$/, "")}-03:00` : null, xml,
  };
  if (item.TipoDocumento !== "NFSE") return { ...base, role: "OUTRO" as Papel };
  const nota = lerNfseOficial(xml);
  if (!nota) return { ...base, role: "OUTRO" as Papel };
  const doc = (valor: string | null | undefined) => (valor ?? "").replace(/\D/g, "") || null;
  const emitente = doc(nota.emitente.documento);
  const papel: Papel = emitente === cnpjEmpresa ? "PRESTADOR" : doc(nota.tomador?.documento) === cnpjEmpresa ? "TOMADOR" : doc(nota.intermediario?.documento) === cnpjEmpresa ? "INTERMEDIARIO" : "OUTRO";
  return {
    ...base,
    role: papel,
    nfse_number: nota.numero,
    issued_at: nota.dataProcessamento,
    competence: nota.dps.competencia,
    issuer_tax_id: emitente,
    issuer_name: nota.emitente.nome,
    issuer_municipality_code: nota.emitente.endereco?.municipio ?? null,
    customer_tax_id: doc(nota.tomador?.documento),
    customer_name: nota.tomador?.nome ?? null,
    national_tax_code: nota.servico.codigoNacional,
    amount_cents: centavos(nota.valores.servico),
    net_cents: centavos(nota.valores.liquido),
    iss_cents: centavos(nota.valores.issqn),
    iss_withheld: nota.tributacao.retencao ? nota.tributacao.retencao !== "1" : null,
  };
}

export function eCancelamento(item: { document_type: string; event_type: string | null }) {
  return item.document_type === "EVENTO" && (item.event_type ?? "").toUpperCase().includes("CANCELAMENTO");
}
