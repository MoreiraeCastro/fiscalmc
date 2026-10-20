import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistCancellationEventArtifact } from "../artifacts/persistence";
import { OrganizationCertificateProvider } from "../certificate/organization-provider";
import { MtlsHttpClient } from "../client/mtls-http-client";
import { SafeFiscalError } from "../errors";
import type { NFSeEnvironment } from "../types";
import { assertEventTransmissionEnabled, findCancellationEvent, prepareCancellationEvent, transmitCancellationEvent, type CancellationReasonCode } from "./cancellation";

export type CancellationOutcome =
  | { status: "CANCELLED"; message: string }
  | { status: "REJECTED"; message: string }
  | { status: "UNKNOWN"; message: string };

const ABERTOS = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PROCESSING", "UNKNOWN"];

type Actor = { userId: string; type: "OFFICE" | "CLIENT" };

async function audit(organizationId: string, actor: Actor, action: string, entityId: string, metadata: Record<string, unknown>) {
  await createAdminClient().from("audit_logs").insert({ organization_id: organizationId, actor_user_id: actor.userId, actor_type: actor.type, action, entity: "cancellation_request", entity_id: entityId, request_id: crypto.randomUUID(), safe_metadata: metadata });
}

/** Evento registrado: guarda o XML oficial, marca a nota e a solicitação como canceladas. */
async function concluir(input: { organizationId: string; invoiceId: string; requestId: string; eventXml: string | null; actor: Actor }) {
  const db = createAdminClient();
  const agora = new Date().toISOString();
  if (input.eventXml) {
    try { await persistCancellationEventArtifact({ invoiceId: input.invoiceId, organizationId: input.organizationId, content: Buffer.from(input.eventXml, "utf8") }); }
    catch { /* o evento continua consultável na SEFIN pela chave */ }
  }
  await db.from("invoices").update({ status: "CANCELLED", cancelled_at: agora, updated_at: agora }).eq("id", input.invoiceId).eq("organization_id", input.organizationId);
  await db.from("cancellation_requests").update({ status: "CANCELLED", completed_at: agora, updated_at: agora }).eq("id", input.requestId);
  await audit(input.organizationId, input.actor, "cancellation_completed", input.requestId, { invoiceId: input.invoiceId });
}

/**
 * Cancela a NFS-e na SEFIN (evento 101101) e registra tudo. Só o escritório transmite; a solicitação do cliente
 * (se houver) é reaproveitada. Uma solicitação aberta por nota (índice único) impede dois envios ao mesmo tempo.
 */
export async function cancelInvoice(input: { organizationId: string; invoiceId: string; actor: Actor; reasonCode: CancellationReasonCode; reason: string }): Promise<CancellationOutcome> {
  if (input.actor.type !== "OFFICE") throw new SafeFiscalError("FORBIDDEN", "Só o escritório transmite o cancelamento.");
  const db = createAdminClient();
  const [{ data: nota }, { data: empresa }] = await Promise.all([
    db.from("invoices").select("id,status,access_key,environment").eq("id", input.invoiceId).eq("organization_id", input.organizationId).maybeSingle(),
    db.from("organizations").select("tax_id").eq("id", input.organizationId).single(),
  ]);
  if (!nota || nota.status !== "ISSUED" || !nota.access_key) throw new SafeFiscalError("CANCELLATION_INVALID", "Só dá para cancelar uma NFS-e gerada.");
  if (!empresa) throw new SafeFiscalError("CANCELLATION_INVALID", "Empresa não encontrada.");
  const environment = nota.environment as NFSeEnvironment;
  assertEventTransmissionEnabled(environment);

  const agora = new Date().toISOString();
  const { data: aberta } = await db.from("cancellation_requests").select("id,status").eq("invoice_id", nota.id).in("status", ABERTOS).maybeSingle();
  if (aberta && (aberta.status === "PROCESSING" || aberta.status === "UNKNOWN")) {
    return { status: "UNKNOWN", message: "Já existe um cancelamento desta nota em andamento. Use \"Consultar situação\"." };
  }
  let requestId: string;
  const campos = { status: "PROCESSING", reason: input.reason.trim(), technical_reason_code: input.reasonCode, attempted_at: agora, updated_at: agora, reviewed_by: input.actor.userId, reviewed_at: agora };
  if (aberta) {
    const { error } = await db.from("cancellation_requests").update(campos).eq("id", aberta.id).in("status", ["REQUESTED", "UNDER_REVIEW", "APPROVED"]);
    if (error) throw new SafeFiscalError("CANCELLATION_CONFLICT", "Não foi possível iniciar o cancelamento agora.");
    requestId = aberta.id;
  } else {
    const { data, error } = await db.from("cancellation_requests").insert({ invoice_id: nota.id, organization_id: input.organizationId, requested_by: input.actor.userId, idempotency_key: crypto.randomUUID(), request_id: crypto.randomUUID(), ...campos }).select("id").single();
    if (error || !data) throw new SafeFiscalError("CANCELLATION_CONFLICT", "Já existe um cancelamento desta nota em andamento.");
    requestId = data.id;
  }
  await audit(input.organizationId, input.actor, "cancellation_transmission_started", requestId, { invoiceId: nota.id, reasonCode: input.reasonCode });

  const certificateProvider = new OrganizationCertificateProvider();
  let payload: unknown;
  try {
    payload = (await prepareCancellationEvent({ accessKey: nota.access_key, authorTaxId: empresa.tax_id, environment, reasonCode: input.reasonCode, reason: input.reason, organizationId: input.organizationId, certificateProvider })).payload;
  } catch (error) {
    const message = error instanceof SafeFiscalError ? error.safeMessage : "Não foi possível preparar o pedido de cancelamento.";
    await db.from("cancellation_requests").update({ status: "REJECTED", review_note: `Não enviado: ${message}`, updated_at: new Date().toISOString() }).eq("id", requestId);
    throw error instanceof SafeFiscalError ? error : new SafeFiscalError("BUILD_FAILED", message);
  }

  const http = new MtlsHttpClient(certificateProvider);
  let result;
  try {
    result = await transmitCancellationEvent({ http, environment, accessKey: nota.access_key, organizationId: input.organizationId, payload });
  } catch (error) {
    // Falha antes de enviar: nada chegou à SEFIN, a solicitação volta a poder ser tentada.
    await db.from("cancellation_requests").update({ status: "REJECTED", review_note: "Não enviado: SEFIN indisponível.", updated_at: new Date().toISOString() }).eq("id", requestId);
    throw error;
  }
  if (result.status === "REGISTERED") {
    await concluir({ organizationId: input.organizationId, invoiceId: nota.id, requestId, eventXml: result.eventXml, actor: input.actor });
    return { status: "CANCELLED", message: "A NFS-e foi cancelada." };
  }
  const fim = new Date().toISOString();
  if (result.status === "REJECTED") {
    await db.from("cancellation_requests").update({ status: "REJECTED", review_note: `${result.code}: ${result.message}`.slice(0, 1000), completed_at: fim, updated_at: fim }).eq("id", requestId);
    await audit(input.organizationId, input.actor, "cancellation_rejected_by_sefin", requestId, { code: result.code });
    return { status: "REJECTED", message: `A SEFIN recusou o cancelamento: ${result.message} (${result.code})` };
  }
  await db.from("cancellation_requests").update({ status: "UNKNOWN", updated_at: fim }).eq("id", requestId);
  await audit(input.organizationId, input.actor, "cancellation_unknown", requestId, {});
  return { status: "UNKNOWN", message: "O pedido foi enviado, mas a resposta não chegou. Use \"Consultar situação\" antes de tentar de novo." };
}

/** "Consultar situação" de um cancelamento sem resposta: pergunta à SEFIN se o evento 101101 existe. */
export async function reconcileCancellation(input: { organizationId: string; invoiceId: string; actor: Actor }): Promise<CancellationOutcome> {
  const db = createAdminClient();
  const [{ data: nota }, { data: pedido }] = await Promise.all([
    db.from("invoices").select("id,status,access_key,environment").eq("id", input.invoiceId).eq("organization_id", input.organizationId).maybeSingle(),
    db.from("cancellation_requests").select("id,status,attempted_at").eq("invoice_id", input.invoiceId).eq("organization_id", input.organizationId).eq("status", "UNKNOWN").maybeSingle(),
  ]);
  if (!nota?.access_key || !pedido) return { status: "REJECTED", message: "Não há cancelamento pendente de confirmação para esta nota." };
  const environment = nota.environment as NFSeEnvironment;
  const http = new MtlsHttpClient(new OrganizationCertificateProvider());
  const achado = await findCancellationEvent({ http, environment, accessKey: nota.access_key, organizationId: input.organizationId });
  const agora = new Date().toISOString();
  if (achado.found) {
    await concluir({ organizationId: input.organizationId, invoiceId: nota.id, requestId: pedido.id, eventXml: achado.eventXml, actor: input.actor });
    return { status: "CANCELLED", message: "Confirmado: a NFS-e está cancelada." };
  }
  // Passados 10 minutos sem o evento na SEFIN, o pedido não foi registrado: libera para tentar de novo.
  if (pedido.attempted_at && Date.now() - new Date(pedido.attempted_at).getTime() > 10 * 60_000) {
    await db.from("cancellation_requests").update({ status: "REJECTED", review_note: "Não registrado na SEFIN (confirmado por consulta).", last_reconciled_at: agora, updated_at: agora }).eq("id", pedido.id);
    return { status: "REJECTED", message: "A SEFIN não registrou o cancelamento. Pode pedir o cancelamento de novo." };
  }
  await db.from("cancellation_requests").update({ last_reconciled_at: agora, updated_at: agora }).eq("id", pedido.id);
  return { status: "UNKNOWN", message: "A SEFIN ainda não mostra o cancelamento. Consulte de novo em alguns minutos." };
}
