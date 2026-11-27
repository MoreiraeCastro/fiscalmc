import { NextResponse } from "next/server";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { gerarArquivosNotas, gerarRelacao, RelacaoGrandeDemais } from "@/lib/contribuinte/relacao-notas";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logger";
import { enfileirarRelacao } from "@/lib/contribuinte/relacao-sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// O .zip de PDF monta um DANFS-e por nota (até LIMITE_ARQUIVOS_NOTAS).
export const maxDuration = 300;

/**
 * Relação de NFS-e da empresa escolhida: ?tipo=emitidas|recebidas|ambas&modelo=simples|completa|retencoes|xml|pdf
 * &competencia=AAAA-MM[&ate=AAAA-MM] (período de até 12 competências; xml e pdf saem num .zip, um arquivo por nota).
 */
const MAX_MESES = 12;
const meses = (de: string, ate: string) => (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7)) + 1;
export async function GET(request: Request) {
  const { empresa, usuarioId, escritorio } = await exigirEmpresa();
  const params = new URL(request.url).searchParams;
  const tipo = params.get("tipo");
  const modelo = params.get("modelo");
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/;
  // Período escolhido ao contrário ("até" antes do "de"): vale o mesmo intervalo, na ordem certa.
  const [competencia, ate] = [params.get("competencia") ?? "", params.get("ate") || params.get("competencia") || ""].sort();
  if ((tipo !== "emitidas" && tipo !== "recebidas" && tipo !== "ambas") || (modelo !== "simples" && modelo !== "completa" && modelo !== "retencoes" && modelo !== "xml" && modelo !== "pdf") || !mes.test(competencia) || !mes.test(ate)) {
    return NextResponse.json({ error: "Escolha o tipo, a competência e o modelo." }, { status: 400 });
  }
  if (meses(competencia, ate) > MAX_MESES) return NextResponse.json({ error: `Escolha um período de até ${MAX_MESES} competências.` }, { status: 400 });
  const arquivos = modelo === "xml" || modelo === "pdf";
  let gerado: { arquivo: Uint8Array; nome: string; quantidade: number };
  try {
    gerado = arquivos
      ? await gerarArquivosNotas({ empresaId: empresa.id, razaoSocial: empresa.razaoSocial, tipo, formato: modelo, competencia, ate })
      : await gerarRelacao({ empresaId: empresa.id, razaoSocial: empresa.razaoSocial, tipo, modelo, competencia, ate });
  } catch (error) {
    if (error instanceof RelacaoGrandeDemais) return NextResponse.json({ error: error.message }, { status: 413 });
    throw error;
  }
  const { arquivo, nome, quantidade } = gerado;
  await createAdminClient().from("audit_logs").insert({ organization_id: empresa.id, actor_user_id: usuarioId, actor_type: escritorio ? "OFFICE" : "CLIENT", action: "nfse_report_downloaded", entity: "organization", entity_id: empresa.id, safe_metadata: { tipo, modelo, competencia, ate, quantidade } });
  logEvent("info", "NFSE_REPORT", { organizationId: empresa.id, tipo, modelo, competencia, ate, quantidade });
  // A cópia na pasta do SharePoint é por competência: só vai quando o arquivo é de um mês só.
  if (ate === competencia) await enfileirarRelacao({ cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial, competencia, nome, formato: arquivos ? modelo : "excel", arquivo });
  const ascii = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");
  // Sem cópia: o arquivo já é um Uint8Array só desta resposta.
  return new NextResponse(arquivo as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": arquivos ? "application/zip" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ascii.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
