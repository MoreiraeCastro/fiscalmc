import { NextResponse } from "next/server";
import { requireIssuanceContext, requireOfficeSession } from "@/lib/auth/session";
import { downloadAuthorizedFiscalArtifact } from "@/lib/nfse/artifacts/download";
import { ensureArtifactsRecoveredBestEffort } from "@/lib/nfse/artifacts/recovery";
import { fiscalArtifactTypes, type FiscalArtifactType } from "@/lib/nfse/artifacts/model";
import { createAdminClient } from "@/lib/supabase/admin";
import { pdfDaNotaEmitida } from "@/lib/nfse/danfse/nota";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; type: string }> }) {
  try {
    const session = await requireOfficeSession();
    const { id, type } = await context.params;
    if (type !== "PDF" && !fiscalArtifactTypes.includes(type as FiscalArtifactType)) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    const db = createAdminClient();
    const { data: invoice } = await db.from("invoices").select("id,organization_id,nfse_number,access_key,service_date,amount_cents,description,environment,status").eq("id", id).maybeSingle();
    if (!invoice) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    const actor=await requireIssuanceContext(invoice.organization_id);
    if(actor.actorType!=="OFFICE")return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    if (type === "PDF") {
      const pdf = await pdfDaNotaEmitida(invoice);
      if (!pdf) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
      return new NextResponse(pdf.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
    }
    let document = await downloadAuthorizedFiscalArtifact({ invoiceId: id, organizationId: invoice.organization_id, artifactType: type as FiscalArtifactType, nfseNumber: invoice.nfse_number });
    if (!document && type === "NFSE_XML") {
      const recovery = await ensureArtifactsRecoveredBestEffort({ invoiceId: id, organizationId: invoice.organization_id, accessKey: invoice.access_key, environment: invoice.environment });
      if (!recovery.ok) logEvent("warn", "ARTIFACT_RECOVERY_FAILED", { invoiceId: id, artifactType: type, reason: recovery.debug });
      document = await downloadAuthorizedFiscalArtifact({ invoiceId: id, organizationId: invoice.organization_id, artifactType: type as FiscalArtifactType, nfseNumber: invoice.nfse_number });
    }
    if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    await db.from("audit_logs").insert({ actor_user_id: session.userId, actor_type: "OFFICE", organization_id: invoice.organization_id, action: "artifact_downloaded", entity: "fiscal_artifact", entity_id: document.artifact.id, request_id: crypto.randomUUID(), safe_metadata: { type: document.artifact.artifact_type, invoiceId: id } });
    return new NextResponse(document.body, { headers: { "Content-Type": document.artifact.content_type, "Content-Disposition": `attachment; filename="${document.filename}"`, "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível baixar o documento agora." }, { status: 500 });
  }
}
