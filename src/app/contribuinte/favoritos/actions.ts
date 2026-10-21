"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { passoLiberado, PASSOS, validarIbsCbs, validarServico, valorEmCentavos, type Erros } from "@/lib/contribuinte/dps";
import { servicosProntos, tomadorPorId } from "@/lib/contribuinte/emissao";
import { carregarFavorito, excluirFavorito, favoritoDoRascunho, gravarFavorito, rascunhoDoFavorito, type DadosFavorito } from "@/lib/contribuinte/favoritos";
import { carregarRascunho, gravarRascunho } from "@/lib/contribuinte/rascunhos";
import indicadores from "@/lib/contribuinte/indicadores-operacao.json";

export type EstadoFavorito = { erros: Erros; mensagem?: string; ok?: boolean };

const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "");

async function empresaQueEmite() {
  const contexto = await exigirEmpresa();
  return contexto.empresa.podeEmitir ? contexto : null;
}

function validarNome(nome: string, erros: Erros) {
  const limpo = nome.trim().replace(/\s+/g, " ");
  if (!limpo) erros.nome = "Campo obrigatório";
  else if (limpo.length < 2 || limpo.length > 80) erros.nome = "De 2 a 80 caracteres";
  return limpo;
}

/** Tela "Novo/Editar Serviço Favorito". */
export async function salvarFavoritoAction(favoritoId: string | null, _anterior: EstadoFavorito, formData: FormData): Promise<EstadoFavorito> {
  const contexto = await empresaQueEmite();
  if (!contexto) return { erros: {}, mensagem: "Seu usuário não pode alterar os favoritos desta empresa." };
  const { empresa, usuarioId } = contexto;
  const erros: Erros = {};
  const nome = validarNome(texto(formData, "nome"), erros);
  const servico = validarServico({ modeloId: texto(formData, "servico"), descricao: texto(formData, "descricao") });
  if (!servico.ok) Object.assign(erros, servico.erros);
  else if (!(await servicosProntos(empresa.id)).some((item) => item.id === servico.valor.modeloId)) erros.servico = "Serviço indisponível para emissão";

  const valorTexto = texto(formData, "valor").trim();
  const valorCentavos = valorTexto ? valorEmCentavos(valorTexto) : null;
  if (valorTexto && valorCentavos === null) erros.valor = "Valor inválido";

  const escolhaTomador = texto(formData, "tomador");
  let tomador: DadosFavorito["tomador"];
  if (escolhaTomador && escolhaTomador !== "NAO_INFORMADO") {
    const salvo = await tomadorPorId(empresa.id, escolhaTomador);
    if (!salvo) erros.tomador = "Tomador não encontrado";
    else tomador = { clienteId: salvo.id, documento: salvo.tax_id, nome: salvo.legal_name };
  }

  const informarIbsCbs = texto(formData, "ibsCbs") === "SIM";
  const ibsCbs = informarIbsCbs ? validarIbsCbs({ cst: texto(formData, "cst"), classificacao: texto(formData, "classificacao"), indicadorOperacao: texto(formData, "indicadorOperacao"), consumoPessoal: texto(formData, "consumoPessoal") }, indicadores.map((item) => item.codigo)) : null;
  if (ibsCbs && !ibsCbs.ok) Object.assign(erros, ibsCbs.erros);

  if (Object.keys(erros).length || !servico.ok) return { erros };
  const dados: DadosFavorito = {
    servico: servico.valor,
    ...(escolhaTomador === "NAO_INFORMADO" ? { semTomador: true } : tomador ? { tomador } : {}),
    ...(valorCentavos ? { valorCentavos } : {}),
    ...(ibsCbs?.ok ? { informarIbsCbs: true, ibsCbs: ibsCbs.valor } : {}),
  };
  const resultado = await gravarFavorito({ empresaId: empresa.id, usuarioId, id: favoritoId, nome, dados });
  if (!resultado.ok) return { erros: {}, mensagem: resultado.mensagem };
  revalidatePath("/contribuinte/favoritos");
  redirect("/contribuinte/favoritos?salvo=1");
}

export async function excluirFavoritoAction(formData: FormData) {
  const contexto = await empresaQueEmite();
  if (contexto) await excluirFavorito(contexto.empresa.id, texto(formData, "id"));
  revalidatePath("/contribuinte/favoritos");
  redirect("/contribuinte/favoritos");
}

/** "Usar": abre a emissão em 4 passos com o favorito pré-preenchido (competência de hoje). */
export async function usarFavoritoAction(formData: FormData) {
  const contexto = await empresaQueEmite();
  if (!contexto) redirect("/contribuinte/favoritos");
  const favorito = await carregarFavorito(contexto.empresa.id, texto(formData, "id"));
  if (!favorito) redirect("/contribuinte/favoritos");
  const dados = rascunhoDoFavorito(favorito.dados);
  const id = await gravarRascunho({ empresaId: contexto.empresa.id, usuarioId: contexto.usuarioId, id: null, dados, passo: passoLiberado(dados) });
  redirect(`/contribuinte/dps/${id}/${PASSOS[0].slug}`);
}

/** "Salvar como favorito" no passo 4: guarda o serviço, tomador, valor e IBS/CBS deste rascunho. */
export async function salvarRascunhoComoFavoritoAction(rascunhoId: string, _anterior: EstadoFavorito, formData: FormData): Promise<EstadoFavorito> {
  const contexto = await empresaQueEmite();
  if (!contexto) return { erros: {}, mensagem: "Sem permissão." };
  const erros: Erros = {};
  const nome = validarNome(texto(formData, "nome"), erros);
  if (Object.keys(erros).length) return { erros };
  const rascunho = await carregarRascunho(contexto.empresa.id, rascunhoId);
  const dados = rascunho ? favoritoDoRascunho(rascunho.dados) : null;
  if (!dados) return { erros: {}, mensagem: "Escolha o serviço antes de salvar como favorito." };
  const resultado = await gravarFavorito({ empresaId: contexto.empresa.id, usuarioId: contexto.usuarioId, id: null, nome, dados });
  return resultado.ok ? { erros: {}, ok: true, mensagem: `Salvo nos Serviços Favoritos como “${nome}”.` } : { erros: {}, mensagem: resultado.mensagem };
}
