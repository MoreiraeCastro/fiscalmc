"use server";

import { redirect } from "next/navigation";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { hojeBrasilia } from "@/lib/contribuinte/formato";
import { centavosParaTexto, validarMotivoSubstituicao, validarNovoTomador, validarPessoas, validarServico, validarValores, type Erros } from "@/lib/contribuinte/dps";
import { servicosProntos, tomadorPorId, tomadoresSalvos, type TomadorSalvo } from "@/lib/contribuinte/emissao";
import { carregarRascunho, excluirRascunho, gravarRascunho, registrarResultado } from "@/lib/contribuinte/rascunhos";
import { lookupCnpj, type CnpjLookupCustomer } from "@/lib/nfse/cnpj-lookup";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTaxId } from "@/lib/validation/identification";

export type EstadoPasso = { erros: Erros; mensagem?: string };

const SEM_PERMISSAO: EstadoPasso = { erros: {}, mensagem: "Seu usuário não tem permissão para emitir por esta empresa." };

async function empresaQueEmite() {
  const contexto = await exigirEmpresa();
  return contexto.empresa.podeEmitir ? contexto : null;
}

export type ConsultaTomador = { salvo?: TomadorSalvo; receita?: CnpjLookupCustomer; erro?: string };

/** Lupa ao lado do CPF/CNPJ: primeiro os tomadores já salvos da empresa; se for CNPJ novo, a base pública da Receita. */
export async function consultarTomador(documento: string): Promise<ConsultaTomador> {
  const { empresa } = await exigirEmpresa();
  const doc = normalizeTaxId(documento);
  if (doc.length !== 11 && doc.length !== 14) return { erro: "Informe um CPF (11 dígitos) ou CNPJ (14)." };
  const salvo = (await tomadoresSalvos(empresa.id)).find((item) => item.documento === doc);
  if (salvo) return { salvo };
  if (doc.length === 11) return {};
  const consulta = await lookupCnpj(doc);
  return consulta.ok ? { receita: consulta.customer } : { erro: consulta.error };
}

function texto(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? "");
}

/** Passo 1 → Pessoas. Cria o tomador se for novo (com o endereço da Receita) e grava o rascunho. */
export async function salvarPessoas(rascunhoId: string | null, _anterior: EstadoPasso, formData: FormData): Promise<EstadoPasso> {
  const contexto = await empresaQueEmite();
  if (!contexto) return SEM_PERMISSAO;
  const { empresa, usuarioId } = contexto;
  const semTomador = texto(formData, "onde") === "NAO_INFORMADO";
  let clienteId = semTomador ? "" : texto(formData, "clienteId");
  const documento = texto(formData, "documento");
  const erros: Erros = {};
  let tomador: { clienteId: string; documento: string | null; nome: string } | null = null;

  if (clienteId) {
    const salvo = await tomadorPorId(empresa.id, clienteId);
    if (salvo) tomador = { clienteId: salvo.id, documento: salvo.tax_id, nome: salvo.legal_name };
    else clienteId = "";
  }
  if (!semTomador && !tomador && documento.trim()) {
    // CNPJ: a razão social é sempre a do cartão CNPJ (Receita), nunca a digitada.
    const doc = normalizeTaxId(documento);
    const cartao = doc.length === 14 ? await lookupCnpj(doc) : null;
    const nomeOficial = cartao?.ok && cartao.customer.legalName ? cartao.customer.legalName : null;
    const novo = validarNovoTomador({ documento, nome: nomeOficial ?? texto(formData, "nome"), email: texto(formData, "email") });
    if (!novo.ok) Object.assign(erros, novo.erros);
    else {
      const db = createAdminClient();
      const { data: existente } = await db.from("customers").select("id,tax_id,legal_name").eq("organization_id", empresa.id).eq("tax_id", novo.valor.documento).maybeSingle();
      if (existente) tomador = { clienteId: existente.id, documento: existente.tax_id, nome: existente.legal_name };
      else {
        let endereco: Partial<CnpjLookupCustomer> = {};
        try { endereco = JSON.parse(texto(formData, "endereco") || "{}") as Partial<CnpjLookupCustomer>; } catch { endereco = {}; }
        const limpo = (valor: unknown, max: number) => (typeof valor === "string" && valor.trim() ? valor.trim().slice(0, max) : null);
        const municipio = limpo(endereco.municipalityCode, 7);
        const { data: criado, error } = await db.from("customers").insert({
          organization_id: empresa.id, person_type: novo.valor.tipo, tax_id: novo.valor.documento, legal_name: novo.valor.nome,
          email: novo.valor.email, phone: limpo(texto(formData, "telefone"), 30), address: {},
          postal_code: limpo(endereco.postalCode, 8), street: limpo(endereco.street, 200), address_number: limpo(endereco.addressNumber, 20),
          address_complement: limpo(endereco.addressComplement, 120), neighborhood: limpo(endereco.neighborhood, 120),
          municipality_code: municipio && /^\d{7}$/.test(municipio) ? municipio : null, state: limpo(endereco.state, 2),
        }).select("id,tax_id,legal_name").single();
        if (error || !criado) return { erros, mensagem: "Não foi possível salvar o tomador." };
        await db.from("audit_logs").insert({ organization_id: empresa.id, actor_user_id: usuarioId, actor_type: contexto.escritorio ? "OFFICE" : "CLIENT", action: "customer_created", entity: "customer", entity_id: criado.id, safe_metadata: { via: "portal_contribuinte" } });
        tomador = { clienteId: criado.id, documento: criado.tax_id, nome: criado.legal_name };
      }
    }
  }
  const pessoas = validarPessoas({ competencia: texto(formData, "competencia"), clienteId: tomador?.clienteId ?? "", hoje: hojeBrasilia(), semTomador });
  if (!pessoas.ok) Object.assign(erros, pessoas.erros);
  if (Object.keys(erros).length || !pessoas.ok || (!tomador && !semTomador)) return { erros };
  const id = await gravarRascunho({ empresaId: empresa.id, usuarioId, id: rascunhoId, passo: 2, dados: { competencia: pessoas.valor.competencia, tomador: tomador ?? undefined, semTomador } });
  redirect(`/contribuinte/dps/${id}/servico`);
}

export async function salvarServico(rascunhoId: string, _anterior: EstadoPasso, formData: FormData): Promise<EstadoPasso> {
  const contexto = await empresaQueEmite();
  if (!contexto) return SEM_PERMISSAO;
  const servico = validarServico({ modeloId: texto(formData, "servico"), descricao: texto(formData, "descricao") });
  if (!servico.ok) return { erros: servico.erros };
  const servicos = await servicosProntos(contexto.empresa.id);
  if (!servicos.some((item) => item.id === servico.valor.modeloId)) return { erros: { servico: "Serviço indisponível para emissão" } };
  const rascunho = await carregarRascunho(contexto.empresa.id, rascunhoId);
  // Trocar de serviço pode mudar a alíquota: os valores precisam ser confirmados de novo.
  const substituicao = rascunho?.dados.substituicao;
  const valores = rascunho?.dados.servico?.modeloId === servico.valor.modeloId ? rascunho.dados.valores : substituicao ? { valorCentavos: substituicao.valorCentavos } : undefined;
  await gravarRascunho({ empresaId: contexto.empresa.id, usuarioId: contexto.usuarioId, id: rascunhoId, passo: 3, dados: { servico: servico.valor, valores } });
  redirect(`/contribuinte/dps/${rascunhoId}/valores`);
}

export async function salvarValores(rascunhoId: string, _anterior: EstadoPasso, formData: FormData): Promise<EstadoPasso> {
  const contexto = await empresaQueEmite();
  if (!contexto) return SEM_PERMISSAO;
  const rascunho = await carregarRascunho(contexto.empresa.id, rascunhoId);
  if (!rascunho?.dados.servico) return { erros: {}, mensagem: "Escolha o serviço no passo 2 antes." };
  const servico = (await servicosProntos(contexto.empresa.id)).find((item) => item.id === rascunho.dados.servico?.modeloId);
  const exigeAliquota = Boolean(contexto.escritorio && servico?.exigeAliquotaManual);
  const substituicao = rascunho.dados.substituicao;
  // Na substituição o valor fica travado no da nota original (como no Emissor Nacional).
  const valor = substituicao ? centavosParaTexto(substituicao.valorCentavos) : texto(formData, "valor");
  const valores = validarValores({ valor, aliquota: texto(formData, "aliquota"), fonte: texto(formData, "fonte"), exigeAliquota });
  const motivo = substituicao ? validarMotivoSubstituicao({ codigo: texto(formData, "motivoCodigo"), motivo: texto(formData, "motivo") }) : null;
  if (!valores.ok || (motivo && !motivo.ok)) return { erros: { ...(valores.ok ? {} : valores.erros), ...(motivo && !motivo.ok ? motivo.erros : {}) } };
  await gravarRascunho({ empresaId: contexto.empresa.id, usuarioId: contexto.usuarioId, id: rascunhoId, passo: 4, dados: { valores: valores.valor, ...(substituicao && motivo?.ok ? { substituicao: { ...substituicao, motivoCodigo: motivo.valor.motivoCodigo, motivo: motivo.valor.motivo } } : {}) } });
  redirect(`/contribuinte/dps/${rascunhoId}/emitir`);
}

export async function excluirRascunhoAction(formData: FormData) {
  const contexto = await empresaQueEmite();
  if (contexto) await excluirRascunho(contexto.empresa.id, texto(formData, "id"));
  redirect("/contribuinte/notas/rascunhos");
}

/** Chamado pela tela de emissão depois da resposta do motor. */
export async function registrarResultadoAction(rascunhoId: string, notaId: string, status: string) {
  const contexto = await empresaQueEmite();
  if (!contexto) return;
  await registrarResultado({ empresaId: contexto.empresa.id, id: rascunhoId, notaId, status, usuarioId: contexto.usuarioId });
}
