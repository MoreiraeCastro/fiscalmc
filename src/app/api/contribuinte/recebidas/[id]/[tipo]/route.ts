import { NextResponse } from "next/server";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { recebidaPorId } from "@/lib/contribuinte/recebidas";
import { getConfiguredNFSeEnvironment } from "@/lib/nfse/environments";
import { SefinRestrictedReconciliationClient } from "@/lib/nfse/reconciliation/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Download XML / DANFS-e de uma NFS-e recebida. O XML é o que o ADN distribuiu; o PDF é o DANFSe oficial do ADN (com o A1 da empresa). */
export async function GET(_request: Request, context: { params: Promise<{ id: string; tipo: string }> }) {
  const [{ empresa, usuarioId, escritorio }, { id, tipo }] = await Promise.all([exigirEmpresa(), context.params]);
  if (!UUID.test(id) || (tipo !== "xml" && tipo !== "pdf")) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const nota = await recebidaPorId(empresa.id, id);
  if (!nota) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  const nome = `nfse-recebida-${nota.nfse_number ?? nota.access_key}`;
  await createAdminClient().from("audit_logs").insert({ organization_id: empresa.id, actor_user_id: usuarioId, actor_type: escritorio ? "OFFICE" : "CLIENT", action: "received_document_downloaded", entity: "received_document", entity_id: nota.id, safe_metadata: { tipo } });
  if (tipo === "xml") {
    return new NextResponse(nota.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}.xml"`, "Cache-Control": "private, no-store" } });
  }
  try {
    const danfse = await new SefinRestrictedReconciliationClient(undefined, getConfiguredNFSeEnvironment()).getDanfseByAccessKey({ organizationId: empresa.id, accessKey: nota.access_key });
    if (!danfse) return NextResponse.json({ error: "O DANFS-e desta nota ainda não está disponível no ADN." }, { status: 404 });
    return new NextResponse(new Uint8Array(danfse.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    logEvent("warn", "RECEIVED_DANFSE_FAILED", { organizationId: empresa.id, code: (error as { code?: string }).code ?? "UNKNOWN" });
    return NextResponse.json({ error: "Não foi possível baixar o DANFS-e agora. Tente o XML ou de novo em instantes." }, { status: 502 });
  }
}
