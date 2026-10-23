"use server";

import { revalidatePath } from "next/cache";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { sincronizarRecebidas } from "@/lib/nfse/distribution/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoAtualizacao = { mensagem?: string; tipo?: "sucesso" | "alerta" | "erro" };

/** Botão "Atualizar agora": lê no ADN o que chegou desde a última leitura (a mesma rotina do timer de 2 em 2 horas). */
export async function atualizarRecebidas(_anterior: EstadoAtualizacao): Promise<EstadoAtualizacao> {
  const { empresa } = await exigirEmpresa();
  const resultado = await sincronizarRecebidas(createAdminClient(), empresa.id);
  revalidatePath("/contribuinte/notas/recebidas");
  if (resultado.status === "OK") {
    const novos = resultado.novos ? `${resultado.novos} ${resultado.novos === 1 ? "documento novo lido" : "documentos novos lidos"} no ADN.` : "Nenhum documento novo no ADN.";
    return { tipo: "sucesso", mensagem: resultado.terminou ? novos : `${novos} Ainda há mais para ler: clique de novo ou aguarde a próxima leitura automática.` };
  }
  return { tipo: resultado.status === "FALHA" ? "erro" : "alerta", mensagem: resultado.mensagem };
}
