import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadAuthorizedFiscalArtifact } from "@/lib/nfse/artifacts/download";
import { ensureArtifactsRecoveredBestEffort } from "@/lib/nfse/artifacts/recovery";
import { buildAuthorizedNfseAuxiliaryPdf } from "@/lib/nfse/artifacts/auxiliary-pdf";
import { logEvent } from "@/lib/observability/logger";
import type { NFSeEnvironment } from "@/lib/nfse/types";
import { montarDanfse } from "./modelo";
import { gerarDanfsePdf } from "./pdf";

type NotaEmitida = { id: string; organization_id: string; nfse_number: string | null; access_key: string | null; environment: NFSeEnvironment | null; status: string; service_date: string; amount_cents: number; description: string };

/**
 * PDF de uma NFS-e emitida por nós. A API de DANFSe do ADN foi suspensa em 01/07/2026 (NT 008/2026): o DANFSe é gerado
 * aqui, a partir do XML oficial, no leiaute nacional. Um DANFSe oficial guardado antes da suspensão continua valendo.
 */
export async function pdfDaNotaEmitida(nota: NotaEmitida): Promise<{ body: Uint8Array<ArrayBuffer> | Blob; filename: string } | null> {
  const guardado = await downloadAuthorizedFiscalArtifact({ invoiceId: nota.id, organizationId: nota.organization_id, artifactType: "DANFSE_PDF", nfseNumber: nota.nfse_number });
  if (guardado) return { body: guardado.body, filename: guardado.filename };

  let xml = await downloadAuthorizedFiscalArtifact({ invoiceId: nota.id, organizationId: nota.organization_id, artifactType: "NFSE_XML", nfseNumber: nota.nfse_number });
  if (!xml) {
    const recuperado = await ensureArtifactsRecoveredBestEffort({ invoiceId: nota.id, organizationId: nota.organization_id, accessKey: nota.access_key, environment: nota.environment });
    if (!recuperado.ok) logEvent("warn", "ARTIFACT_RECOVERY_FAILED", { invoiceId: nota.id, artifactType: "NFSE_XML", reason: recuperado.debug });
    xml = await downloadAuthorizedFiscalArtifact({ invoiceId: nota.id, organizationId: nota.organization_id, artifactType: "NFSE_XML", nfseNumber: nota.nfse_number });
  }
  if (!xml) return null;
  const conteudo = new Uint8Array(await xml.body.arrayBuffer());

  const { data: substituta } = await createAdminClient().from("invoices").select("id").eq("organization_id", nota.organization_id).eq("substitutes_invoice_id", nota.id).eq("status", "ISSUED").maybeSingle();
  const modelo = montarDanfse(Buffer.from(conteudo).toString("utf8"), { cancelada: nota.status === "CANCELLED", substituida: Boolean(substituta) });
  const nome = `danfse-${(nota.nfse_number ?? nota.id).replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`;
  if (modelo) return { body: new Uint8Array(await gerarDanfsePdf(modelo)), filename: nome };
  // XML fora do leiaute nacional (não deveria acontecer): ainda entrega o resumo antigo em vez de nada.
  logEvent("warn", "DANFSE_MODEL_FAILED", { invoiceId: nota.id });
  return { body: new Uint8Array(await buildAuthorizedNfseAuxiliaryPdf({ xml: conteudo, invoice: { nfseNumber: nota.nfse_number, accessKey: nota.access_key, serviceDate: nota.service_date, amountCents: nota.amount_cents, description: nota.description } })), filename: nome };
}
