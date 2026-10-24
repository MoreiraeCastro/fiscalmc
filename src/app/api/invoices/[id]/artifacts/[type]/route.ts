import { NextResponse } from "next/server";
import { requireSessionOrganization } from "@/lib/auth/session";
import { downloadAuthorizedFiscalArtifact } from "@/lib/nfse/artifacts/download";
import { ensureArtifactsRecoveredBestEffort } from "@/lib/nfse/artifacts/recovery";
import { fiscalArtifactTypes, type FiscalArtifactType } from "@/lib/nfse/artifacts/model";
import { createAdminClient } from "@/lib/supabase/admin";
import { pdfDaNotaEmitida } from "@/lib/nfse/danfse/nota";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; type: string }> }) {
  try {
    const session = await requireSessionOrganization();
    const { id, type } = await context.params;
    if (type !== "PDF" && !fiscalArtifactTypes.includes(type as FiscalArtifactType)) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    const { data: invoice } = await createAdminClient().from("invoices").select("id,nfse_number,access_key,service_date,amount_cents,description,environment,status").eq("id", id).eq("organization_id", session.organizationId).maybeSingle();
    if (!invoice) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    if (type === "PDF") {
      const pdf = await pdfDaNotaEmitida({ ...invoice, organization_id: session.organizationId });
      if (!pdf) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
      return new NextResponse(pdf.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
    }
    let document = await downloadAuthorizedFiscalArtifact({ invoiceId: id, organizationId: session.organizationId, artifactType: type as FiscalArtifactType, nfseNumber: invoice.nfse_number });
    if (!document && type === "NFSE_XML") {
      const recovery = await ensureArtifactsRecoveredBestEffort({ invoiceId: id, organizationId: session.organizationId, accessKey: invoice.access_key, environment: invoice.environment });
      if (!recovery.ok) logEvent("warn", "ARTIFACT_RECOVERY_FAILED", { invoiceId: id, artifactType: type, reason: recovery.debug });
      document = await downloadAuthorizedFiscalArtifact({ invoiceId: id, organizationId: session.organizationId, artifactType: type as FiscalArtifactType, nfseNumber: invoice.nfse_number });
    }
    if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    await createAdminClient().from("audit_logs").insert({ actor_user_id: session.userId, actor_type: session.role === "CLIENT_USER" ? "CLIENT" : "OFFICE", organization_id: session.organizationId, action: "artifact_downloaded", entity: "fiscal_artifact", entity_id: document.artifact.id, request_id: crypto.randomUUID(), safe_metadata: { type: document.artifact.artifact_type, invoiceId: id } });
    return new NextResponse(document.body, { headers: { "Content-Type": document.artifact.content_type, "Content-Disposition": `attachment; filename="${document.filename}"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    logEvent("error", "ARTIFACT_DOWNLOAD_FAILED", { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
    return NextResponse.json({ error: "Não foi possível baixar o documento agora." }, { status: 500 });
  }
}
