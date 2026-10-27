"use server";

import { revalidatePath } from "next/cache";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { aliquotaEmPontosBase, type Erros } from "@/lib/contribuinte/dps";
import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoConfiguracoes = { erros: Erros; mensagem?: string; ok?: boolean };

/** Informações de contato da empresa: vão na DPS (fone e e-mail do prestador). */
export async function salvarContatoAction(_anterior: EstadoConfiguracoes, formData: FormData): Promise<EstadoConfiguracoes> {
  const { empresa, usuarioId, escritorio } = await exigirEmpresa();
  if (!empresa.podeEmitir) return { erros: {}, mensagem: "Seu usuário não pode alterar esta empresa." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const telefone = String(formData.get("telefone") ?? "").replace(/\D/g, "");
  const erros: Erros = {};
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 80)) erros.email = "E-mail inválido";
  // TSTelefone da DPS: 6 a 20 dígitos.
  if (telefone && (telefone.length < 6 || telefone.length > 20)) erros.telefone = "Telefone inválido (DDD + número)";
  if (Object.keys(erros).length) return { erros };
  const db = createAdminClient();
  const { error } = await db.from("organizations").update({ email: email || null, phone: telefone || null, updated_at: new Date().toISOString() }).eq("id", empresa.id);
  if (error) return { erros: {}, mensagem: "Não foi possível salvar agora." };
  await db.from("audit_logs").insert({ organization_id: empresa.id, actor_user_id: usuarioId, actor_type: escritorio ? "OFFICE" : "CLIENT", action: "organization_contact_updated", entity: "organization", entity_id: empresa.id, request_id: crypto.randomUUID(), safe_metadata: { via: "portal_contribuinte" } });
  revalidatePath("/contribuinte", "layout");
  return { erros: {}, ok: true, mensagem: "Informações salvas. Valem para as próximas NFS-e." };
}

type TotalTributos = { indicator: "0" } | { simplesRateBasisPoints: number } | { percentages: { federalBasisPoints: number; stateBasisPoints: number; municipalBasisPoints: number } };
type ConfiguracaoDps = { version?: number; technical?: { totalTaxes?: unknown; regime?: { simpleNational?: string } }; regime?: { simpleNational?: string }; totalTaxes?: unknown };

/**
 * Valor aproximado dos tributos (como em Configurações do Emissor Nacional): não informar, percentuais fixos
 * (federal, estadual, municipal) ou, para ME/EPP do Simples Nacional, a alíquota do Simples. Vale para as próximas NFS-e.
 */
export async function salvarTotalTributosAction(_anterior: EstadoConfiguracoes, formData: FormData): Promise<EstadoConfiguracoes> {
  const { empresa, usuarioId, escritorio } = await exigirEmpresa();
  if (!empresa.podeEmitir) return { erros: {}, mensagem: "Seu usuário não pode alterar esta empresa." };
  const db = createAdminClient();
  const { data: perfil } = await db.from("tax_profiles").select("dps_configuration").eq("organization_id", empresa.id).maybeSingle();
  if (!perfil) return { erros: {}, mensagem: "A configuração fiscal da empresa ainda não existe. Fale com o escritório." };
  const atual = (perfil.dps_configuration ?? {}) as ConfiguracaoDps;
  const simplesMeEpp = (atual.technical?.regime?.simpleNational ?? atual.regime?.simpleNational) === "3";

  const modo = String(formData.get("modo") ?? "");
  const pct = (campo: string) => { const texto = String(formData.get(campo) ?? "").trim(); return texto ? aliquotaEmPontosBase(texto) : 0; };
  const erros: Erros = {};
  let total: TotalTributos;
  if (modo === "simples") {
    if (!simplesMeEpp) return { erros: {}, mensagem: "A alíquota do Simples só vale para empresa optante ME/EPP." };
    const bp = pct("aliquotaSimples");
    if (!String(formData.get("aliquotaSimples") ?? "").trim()) erros.aliquotaSimples = "Campo obrigatório";
    else if (bp === null || bp <= 0 || bp > 9999) erros.aliquotaSimples = "Informe de 0,01 a 99,99";
    total = { simplesRateBasisPoints: bp ?? 0 };
  } else if (modo === "percentuais") {
    const federal = pct("federal"), estadual = pct("estadual"), municipal = pct("municipal");
    for (const [campo, valor] of [["federal", federal], ["estadual", estadual], ["municipal", municipal]] as const) if (valor === null || valor > 9999) erros[campo] = "Percentual inválido";
    total = { percentages: { federalBasisPoints: federal ?? 0, stateBasisPoints: estadual ?? 0, municipalBasisPoints: municipal ?? 0 } };
  } else if (modo === "nenhum") {
    total = { indicator: "0" };
  } else return { erros: {}, mensagem: "Escolha uma opção." };
  if (Object.keys(erros).length) return { erros };

  // A configuração pode estar no formato com versão (formulário + parte técnica): o que a emissão lê é a parte técnica.
  const nova = atual.version ? { ...atual, ...(atual.technical ? { technical: { ...atual.technical, totalTaxes: total } } : {}), totalTaxes: total } : { ...atual, totalTaxes: total };
  const { error } = await db.from("tax_profiles").update({ dps_configuration: nova, updated_at: new Date().toISOString() }).eq("organization_id", empresa.id);
  if (error) return { erros: {}, mensagem: "Não foi possível salvar agora." };
  await db.from("audit_logs").insert({ organization_id: empresa.id, actor_user_id: usuarioId, actor_type: escritorio ? "OFFICE" : "CLIENT", action: "total_taxes_updated", entity: "tax_profile", entity_id: empresa.id, request_id: crypto.randomUUID(), safe_metadata: { via: "portal_contribuinte", modo } });
  revalidatePath("/contribuinte/configuracoes");
  return { erros: {}, ok: true, mensagem: "Salvo. Vale para as próximas NFS-e." };
}
