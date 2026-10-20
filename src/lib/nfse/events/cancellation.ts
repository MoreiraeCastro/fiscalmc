import { gunzipSync, gzipSync } from "node:zlib";
import { create } from "xmlbuilder2";
import { z } from "zod";
import type { CertificateProvider } from "../certificate/provider";
import { formatDpsDateTimeSaoPaulo } from "../dps/date-time";
import { signEventRequestXml, verifyDpsSignature } from "../dps/signature";
import { validateEventRequestXml } from "../dps/xsd";
import { endpoints } from "../environments";
import { SafeFiscalError } from "../errors";
import type { NFSeEnvironment } from "../types";
import { MtlsRequestError } from "../client/mtls-http-client";

/** Evento 101101 (Cancelamento de NFS-e), leiaute pedRegEvento v1.01. */
export const CANCELLATION_EVENT_TYPE = "101101";
export const CANCELLATION_REASONS = { "1": "Erro na Emissão", "2": "Serviço não Prestado", "9": "Outros" } as const;
export type CancellationReasonCode = keyof typeof CANCELLATION_REASONS;

export type CancellationEventInput = {
  accessKey: string;
  authorTaxId: string;
  environment: NFSeEnvironment;
  reasonCode: CancellationReasonCode;
  reason: string;
  emittedAt?: Date;
  applicationVersion?: string;
};

const NAMESPACE = "http://www.sped.fazenda.gov.br/nfse";

/** Monta o pedido de registro do evento de cancelamento (sem assinatura). Função pura. */
export function buildCancellationEventXml(input: CancellationEventInput) {
  if (!/^\d{50}$/.test(input.accessKey)) throw new SafeFiscalError("CANCELLATION_INVALID", "A chave de acesso da NFS-e é inválida.");
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < 15 || reason.length > 255) throw new SafeFiscalError("CANCELLATION_INVALID", "Descreva o motivo do cancelamento com 15 a 255 caracteres.");
  if (!(input.reasonCode in CANCELLATION_REASONS)) throw new SafeFiscalError("CANCELLATION_INVALID", "Escolha o motivo do cancelamento.");
  const author = input.authorTaxId.replace(/\D/g, "");
  if (author.length !== 14 && author.length !== 11) throw new SafeFiscalError("CANCELLATION_INVALID", "O CNPJ/CPF do autor do evento é inválido.");
  const document = create({ version: "1.0", encoding: "UTF-8" }).ele("pedRegEvento", { xmlns: NAMESPACE, versao: "1.01" });
  const info = document.ele("infPedReg", { Id: `PRE${input.accessKey}${CANCELLATION_EVENT_TYPE}` });
  info.ele("tpAmb").txt(input.environment === "PRODUCTION" ? "1" : "2").up()
    .ele("verAplic").txt(input.applicationVersion ?? "FISCALMC_0.1").up()
    .ele("dhEvento").txt(formatDpsDateTimeSaoPaulo(input.emittedAt ?? new Date())).up()
    .ele(author.length === 14 ? "CNPJAutor" : "CPFAutor").txt(author).up()
    .ele("chNFSe").txt(input.accessKey).up()
    .ele(`e${CANCELLATION_EVENT_TYPE}`)
    .ele("xDesc").txt("Cancelamento de NFS-e").up()
    .ele("cMotivo").txt(input.reasonCode).up()
    .ele("xMotivo").txt(reason);
  return document.end({ prettyPrint: false });
}

/** XSD (antes e depois de assinar) + XMLDSIG + gzip/base64, no formato do POST /nfse/{chave}/eventos. */
export async function prepareCancellationEvent(input: CancellationEventInput & { organizationId: string; certificateProvider: CertificateProvider }) {
  const unsigned = buildCancellationEventXml(input);
  const before = await validateEventRequestXml(unsigned, input.environment);
  if (!before.valid) throw Object.assign(new SafeFiscalError("BUILD_FAILED", "O pedido de cancelamento não passou na validação oficial."), { xsdDiagnostic: before.errors.slice(0, 5) });
  const signed = await signEventRequestXml(unsigned, { certificateProvider: input.certificateProvider, organizationId: input.organizationId });
  verifyDpsSignature(signed);
  const after = await validateEventRequestXml(signed, input.environment);
  if (!after.valid) throw new SafeFiscalError("SIGNATURE_FAILED", "O pedido de cancelamento assinado não passou na validação oficial.");
  return { signedXml: signed, payload: { pedidoRegistroEventoXmlGZipB64: gzipSync(Buffer.from(signed, "utf8")).toString("base64") } };
}

const successSchema = z.object({ eventoXmlGZipB64: z.string().min(1) }).passthrough();
const message = z.object({ codigo: z.string().optional(), Codigo: z.string().optional(), descricao: z.string().optional(), Descricao: z.string().optional(), complemento: z.string().nullable().optional() }).passthrough();
const errorSchema = z.object({ erro: message.optional(), erros: z.array(message).optional() }).passthrough();

export type EventResult =
  | { status: "REGISTERED"; eventXml: string }
  | { status: "REJECTED"; code: string; message: string }
  | { status: "UNKNOWN" };

type EventHttp = {
  postJsonTracked(url: string, body: unknown, organizationId: string): Promise<{ status: number; body: unknown }>;
  requestText(input: { url: string; organizationId?: string }): Promise<{ status: number; body: string }>;
};

/** Lê a resposta de erro da SEFIN (ResponseErro: "erro"; algumas versões mandam "erros"). */
export function readSefinError(body: unknown) {
  const parsed = errorSchema.safeParse(body);
  const first = parsed.success ? parsed.data.erro ?? parsed.data.erros?.[0] : undefined;
  const code = first?.codigo ?? first?.Codigo ?? "SEFIN_REJECTED";
  const description = first?.descricao ?? first?.Descricao ?? "Pedido recusado pela SEFIN.";
  return { code, message: first?.complemento ? `${description} (${first.complemento})` : description };
}

/** POST /nfse/{chave}/eventos. 201 = evento registrado; 400/401 = recusado (nada mudou); o resto = situação incerta. */
export async function transmitCancellationEvent(input: { http: EventHttp; environment: NFSeEnvironment; accessKey: string; organizationId: string; payload: unknown }): Promise<EventResult> {
  let response: { status: number; body: unknown };
  try {
    response = await input.http.postJsonTracked(`${endpoints[input.environment]}/nfse/${input.accessKey}/eventos`, input.payload, input.organizationId);
  } catch (error) {
    if (error instanceof MtlsRequestError && error.delivery === "NOT_SENT") throw new SafeFiscalError("SEFIN_UNAVAILABLE", "Não foi possível falar com a SEFIN agora. Nada foi enviado; tente de novo.", true);
    return { status: "UNKNOWN" };
  }
  if (response.status === 201) {
    const parsed = successSchema.safeParse(response.body);
    if (!parsed.success) return { status: "UNKNOWN" };
    try {
      return { status: "REGISTERED", eventXml: gunzipSync(Buffer.from(parsed.data.eventoXmlGZipB64, "base64")).toString("utf8") };
    } catch {
      return { status: "UNKNOWN" };
    }
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) return { status: "REJECTED", ...readSefinError(response.body) };
  return { status: "UNKNOWN" };
}

/** GET /nfse/{chave}/eventos/101101/1: confirma um cancelamento cuja resposta se perdeu. */
export async function findCancellationEvent(input: { http: EventHttp; environment: NFSeEnvironment; accessKey: string; organizationId: string }): Promise<{ found: true; eventXml: string | null } | { found: false }> {
  const response = await input.http.requestText({ url: `${endpoints[input.environment]}/nfse/${input.accessKey}/eventos/${CANCELLATION_EVENT_TYPE}/1`, organizationId: input.organizationId });
  if (response.status === 404) return { found: false };
  if (response.status !== 200) throw new SafeFiscalError("RECONCILIATION_UNAVAILABLE", "Não foi possível consultar o evento agora.", true);
  try {
    const body = JSON.parse(response.body) as Record<string, unknown>;
    const compressed = typeof body.eventoXmlGZipB64 === "string" ? body.eventoXmlGZipB64 : null;
    return { found: true, eventXml: compressed ? gunzipSync(Buffer.from(compressed, "base64")).toString("utf8") : null };
  } catch {
    return { found: true, eventXml: null };
  }
}

export type EventKind = "CANCELLATION" | "SUBSTITUTION";
const EVENT_FLAGS: Record<EventKind, { env: string; label: string }> = {
  CANCELLATION: { env: "ENABLE_NFSE_CANCELLATION", label: "O cancelamento" },
  SUBSTITUTION: { env: "ENABLE_NFSE_SUBSTITUTION", label: "A substituição" },
};

/** Cada operação tem liberação própria: só é ligada depois de passar na Produção Restrita. */
export function isEventEnabled(kind: EventKind) {
  return process.env.NFSE_PROVIDER === "national" && process.env[EVENT_FLAGS[kind].env] === "true";
}

/** Transmissão de eventos só com liberação explícita (depois do teste na Produção Restrita). */
export function assertEventTransmissionEnabled(environment: NFSeEnvironment, kind: EventKind) {
  if (process.env.NFSE_PROVIDER !== "national") throw new SafeFiscalError("EVENTS_NOT_ENABLED", "A transmissão nacional não está ativa neste servidor.");
  if (!isEventEnabled(kind)) throw new SafeFiscalError("EVENTS_NOT_ENABLED", `${EVENT_FLAGS[kind].label} pelo emissor ainda não foi liberado. Use o Emissor Nacional por enquanto.`);
  if (environment === "PRODUCTION" && process.env.ENABLE_NFSE_PRODUCTION !== "true") throw new SafeFiscalError("PRODUCTION_TRANSMISSION_NOT_AUTHORIZED", "A transmissão em Produção não está autorizada.");
}
