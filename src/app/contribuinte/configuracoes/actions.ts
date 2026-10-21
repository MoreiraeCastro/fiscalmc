"use server";

import { revalidatePath } from "next/cache";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import type { Erros } from "@/lib/contribuinte/dps";
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
