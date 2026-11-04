import { NextResponse } from "next/server";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { gerarRelacao } from "@/lib/contribuinte/relacao-notas";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Relação de NFS-e da empresa escolhida, por competência: ?tipo=emitidas|recebidas&modelo=simples|completa&competencia=AAAA-MM */
export async function GET(request: Request) {
  const { empresa, usuarioId, escritorio } = await exigirEmpresa();
  const params = new URL(request.url).searchParams;
  const tipo = params.get("tipo");
  const modelo = params.get("modelo");
  const competencia = params.get("competencia") ?? "";
  if ((tipo !== "emitidas" && tipo !== "recebidas") || (modelo !== "simples" && modelo !== "completa") || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
    return NextResponse.json({ error: "Escolha o tipo, a competência e o modelo." }, { status: 400 });
  }
  const { arquivo, nome, quantidade } = await gerarRelacao({ empresaId: empresa.id, razaoSocial: empresa.razaoSocial, tipo, modelo, competencia });
  await createAdminClient().from("audit_logs").insert({ organization_id: empresa.id, actor_user_id: usuarioId, actor_type: escritorio ? "OFFICE" : "CLIENT", action: "nfse_report_downloaded", entity: "organization", entity_id: empresa.id, safe_metadata: { tipo, modelo, competencia, quantidade } });
  logEvent("info", "NFSE_REPORT", { organizationId: empresa.id, tipo, modelo, competencia, quantidade });
  const ascii = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");
  return new NextResponse(arquivo, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ascii.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
