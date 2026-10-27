"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { validarCancelamento, type Erros } from "@/lib/contribuinte/dps";
import { hojeBrasilia } from "@/lib/contribuinte/formato";
import { criarRascunhoDeSubstituicao, criarRascunhoRepetindo } from "@/lib/contribuinte/rascunhos";
import { SafeFiscalError } from "@/lib/nfse/errors";
import { cancelInvoice, reconcileCancellation } from "@/lib/nfse/events/service";

export type EstadoCancelamento = { erros: Erros; mensagem?: string; tom?: "sucesso" | "erro" | "alerta" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function escritorioQueEmite() {
  const contexto = await exigirEmpresa();
  return contexto.escritorio && contexto.empresa.podeEmitir ? contexto : null;
}

/** "Emitir de novo": abre a emissão rápida já preenchida com os dados da nota escolhida (competência de hoje). */
export async function emitirDeNovoAction(formData: FormData) {
  const { empresa, usuarioId } = await exigirEmpresa();
  const notaId = String(formData.get("notaId") ?? "");
  if (!empresa.podeEmitir || !UUID.test(notaId)) redirect("/contribuinte/notas/emitidas");
  const rascunho = await criarRascunhoRepetindo({ empresaId: empresa.id, usuarioId, notaId, hoje: hojeBrasilia() });
  if (!rascunho) redirect("/contribuinte/notas/emitidas");
  redirect(rascunho.rapida ? `/contribuinte/rapida?r=${rascunho.id}&editar=1` : `/contribuinte/dps/${rascunho.id}/pessoas`);
}

/** "Cancelar NFS-e" (escritório): transmite o evento 101101 à SEFIN. */
export async function cancelarNfseAction(notaId: string, _anterior: EstadoCancelamento, formData: FormData): Promise<EstadoCancelamento> {
  const contexto = await escritorioQueEmite();
  if (!contexto || !UUID.test(notaId)) return { erros: {}, mensagem: "Seu usuário não pode cancelar notas desta empresa.", tom: "erro" };
  const validacao = validarCancelamento({ codigo: String(formData.get("codigo") ?? ""), motivo: String(formData.get("motivo") ?? "") });
  if (!validacao.ok) return { erros: validacao.erros };
  try {
    const resultado = await cancelInvoice({ organizationId: contexto.empresa.id, invoiceId: notaId, actor: { userId: contexto.usuarioId, type: "OFFICE" }, reasonCode: validacao.valor.codigo, reason: validacao.valor.motivo });
    revalidatePath(`/contribuinte/nfse/${notaId}`);
    return { erros: {}, mensagem: resultado.message, tom: resultado.status === "CANCELLED" ? "sucesso" : resultado.status === "REJECTED" ? "erro" : "alerta" };
  } catch (error) {
    return { erros: {}, mensagem: error instanceof SafeFiscalError ? error.safeMessage : "Não foi possível cancelar agora. Nada foi alterado na nota.", tom: "erro" };
  }
}

/** "Consultar situação" de um cancelamento enviado sem resposta. */
export async function consultarCancelamentoAction(notaId: string): Promise<EstadoCancelamento> {
  const contexto = await escritorioQueEmite();
  if (!contexto || !UUID.test(notaId)) return { erros: {}, mensagem: "Sem permissão.", tom: "erro" };
  try {
    const resultado = await reconcileCancellation({ organizationId: contexto.empresa.id, invoiceId: notaId, actor: { userId: contexto.usuarioId, type: "OFFICE" } });
    revalidatePath(`/contribuinte/nfse/${notaId}`);
    return { erros: {}, mensagem: resultado.message, tom: resultado.status === "CANCELLED" ? "sucesso" : resultado.status === "REJECTED" ? "erro" : "alerta" };
  } catch (error) {
    return { erros: {}, mensagem: error instanceof SafeFiscalError ? error.safeMessage : "Não foi possível consultar agora.", tom: "erro" };
  }
}

/** "Substituir": abre os 4 passos já preenchidos com a nota original. */
export async function substituirNfseAction(formData: FormData) {
  const contexto = await exigirEmpresa();
  const notaId = String(formData.get("notaId") ?? "");
  if (!contexto.empresa.podeEmitir || !UUID.test(notaId)) redirect(`/contribuinte/nfse/${notaId}`);
  const rascunhoId = await criarRascunhoDeSubstituicao({ empresaId: contexto.empresa.id, usuarioId: contexto.usuarioId, notaId });
  redirect(rascunhoId ? `/contribuinte/dps/${rascunhoId}/pessoas` : `/contribuinte/nfse/${notaId}?erro=substituicao`);
}
