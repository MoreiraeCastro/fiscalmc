// Emissão completa em 4 passos, como no Emissor Nacional. Funções puras: tipos do rascunho e validação de cada passo.
import { isValidTaxId, normalizeTaxId } from "@/lib/validation/identification";

export const PASSOS = [
  { numero: 1, slug: "pessoas", rotulo: "Pessoas" },
  { numero: 2, slug: "servico", rotulo: "Serviço" },
  { numero: 3, slug: "valores", rotulo: "Valores" },
  { numero: 4, slug: "emitir", rotulo: "Emitir NFS-e" },
] as const;
export type SlugPasso = (typeof PASSOS)[number]["slug"];
export type NumeroPasso = (typeof PASSOS)[number]["numero"];

export function passoPorSlug(slug: string) {
  return PASSOS.find((item) => item.slug === slug) ?? null;
}

export const DESCRICAO_MAX = 1000;

export type TomadorRascunho = { clienteId: string; documento: string | null; nome: string };
export type ServicoRascunho = { modeloId: string; descricao: string };
export type ValoresRascunho = { valorCentavos: number; aliquotaManualBp?: number; fonteAliquota?: string };
/** Substituição: a nota original (travada) e o motivo exigido pelo grupo subst da DPS. */
export type SubstituicaoRascunho = { notaId: string; chave: string; numero: string | null; competencia: string; valorCentavos: number; motivoCodigo?: MotivoSubstituicao; motivo?: string };
export type DadosRascunho = { competencia?: string; tomador?: TomadorRascunho; /** Tomador/Adquirente não informado. */ semTomador?: boolean; servico?: ServicoRascunho; valores?: ValoresRascunho; substituicao?: SubstituicaoRascunho };

export const MOTIVOS_SUBSTITUICAO = {
  "01": "Desenquadramento de NFS-e do Simples Nacional",
  "02": "Enquadramento de NFS-e no Simples Nacional",
  "03": "Inclusão Retroativa de Imunidade/Isenção para NFS-e",
  "04": "Exclusão Retroativa de Imunidade/Isenção para NFS-e",
  "05": "Rejeição de NFS-e pelo tomador ou pelo intermediário se responsável pelo recolhimento do tributo",
  "99": "Outros",
} as const;
export type MotivoSubstituicao = keyof typeof MOTIVOS_SUBSTITUICAO;

export const MOTIVOS_CANCELAMENTO = { "1": "Erro na Emissão", "2": "Serviço não Prestado", "9": "Outros" } as const;
export type MotivoCancelamento = keyof typeof MOTIVOS_CANCELAMENTO;

/** Descrição do motivo (cancelamento e substituição): 15 a 255 caracteres, como no leiaute nacional. */
export function validarDescricaoMotivo(texto: string, obrigatoria: boolean): string | null {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (!limpo) return obrigatoria ? OBRIGATORIO : null;
  if (limpo.length < 15) return "Descreva com pelo menos 15 caracteres";
  if (limpo.length > 255) return "Máximo de 255 caracteres";
  return null;
}

export function validarCancelamento(entrada: { codigo: string; motivo: string }): Validacao<{ codigo: MotivoCancelamento; motivo: string }> {
  const erros: Erros = {};
  if (!(entrada.codigo in MOTIVOS_CANCELAMENTO)) erros.codigo = OBRIGATORIO;
  const descricao = validarDescricaoMotivo(entrada.motivo, true);
  if (descricao) erros.motivo = descricao;
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, valor: { codigo: entrada.codigo as MotivoCancelamento, motivo: entrada.motivo.trim().replace(/\s+/g, " ") } };
}

/** Erros por campo, mostrados como "Campo obrigatório" embaixo de cada um (e a faixa amarela no topo). */
export type Erros = Record<string, string>;
export type Validacao<T> = { ok: true; valor: T } | { ok: false; erros: Erros };

const OBRIGATORIO = "Campo obrigatório";
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** "1.234,56" → 123456 centavos; null se não for um valor positivo. */
export function valorEmCentavos(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/g, "");
  if (!/^\d{1,3}(\.?\d{3})*(,\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, decimal = ""] = limpo.replace(/\./g, "").split(",");
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return centavos > 0 && centavos <= 99_999_999_999 ? centavos : null;
}

/** Máscara de dinheiro enquanto digita: só dígitos, sempre com 2 casas ("123456" → "1.234,56"). */
export function mascaraValor(digitado: string) {
  const digitos = digitado.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
  if (!digitos) return "";
  const cheio = digitos.padStart(3, "0");
  return `${cheio.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cheio.slice(-2)}`;
}

export function centavosParaTexto(centavos: number) {
  return mascaraValor(String(centavos));
}

/** Alíquota "2,5" → 250 pontos-base (0 a 100%). */
export function aliquotaEmPontosBase(texto: string): number | null {
  const limpo = texto.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(limpo)) return null;
  const bp = Math.round(Number(limpo) * 100);
  return bp >= 0 && bp <= 10000 ? bp : null;
}

export function validarPessoas(entrada: { competencia: string; clienteId: string; hoje: string; semTomador?: boolean }): Validacao<{ competencia: string; clienteId: string }> {
  const erros: Erros = {};
  if (!entrada.competencia) erros.competencia = OBRIGATORIO;
  else if (!DATA.test(entrada.competencia)) erros.competencia = "Data inválida";
  else if (entrada.competencia > entrada.hoje) erros.competencia = "A competência não pode ser posterior à data de hoje";
  if (!entrada.clienteId && !entrada.semTomador) erros.tomador = "Informe o tomador: pesquise o CPF/CNPJ ou escolha nos últimos tomadores";
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, valor: { competencia: entrada.competencia, clienteId: entrada.clienteId } };
}

/** Dados de um tomador novo digitado no passo 1 (o CNPJ vem preenchido pela consulta à Receita). */
export function validarNovoTomador(entrada: { documento: string; nome: string; email: string }): Validacao<{ documento: string; nome: string; email: string | null; tipo: "INDIVIDUAL" | "COMPANY" }> {
  const erros: Erros = {};
  const documento = normalizeTaxId(entrada.documento);
  if (!documento) erros.documento = OBRIGATORIO;
  else if (!isValidTaxId(documento)) erros.documento = "CPF/CNPJ inválido";
  const nome = entrada.nome.trim();
  if (!nome) erros.nome = OBRIGATORIO;
  else if (nome.length < 2 || nome.length > 250) erros.nome = "Nome inválido";
  const email = entrada.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.email = "E-mail inválido";
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, valor: { documento, nome, email: email || null, tipo: documento.length === 11 ? "INDIVIDUAL" : "COMPANY" } };
}

export function validarServico(entrada: { modeloId: string; descricao: string }): Validacao<ServicoRascunho> {
  const erros: Erros = {};
  if (!entrada.modeloId) erros.servico = OBRIGATORIO;
  const descricao = entrada.descricao.trim();
  if (!descricao) erros.descricao = OBRIGATORIO;
  else if (descricao.length < 3) erros.descricao = "Descreva o serviço com pelo menos 3 caracteres";
  else if (descricao.length > DESCRICAO_MAX) erros.descricao = `Máximo de ${DESCRICAO_MAX} caracteres`;
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, valor: { modeloId: entrada.modeloId, descricao } };
}

export function validarValores(entrada: { valor: string; aliquota: string; fonte: string; exigeAliquota: boolean }): Validacao<ValoresRascunho> {
  const erros: Erros = {};
  const valorCentavos = entrada.valor.trim() ? valorEmCentavos(entrada.valor) : null;
  if (!entrada.valor.trim()) erros.valor = OBRIGATORIO;
  else if (valorCentavos === null) erros.valor = "Valor inválido";
  let aliquotaManualBp: number | undefined;
  let fonteAliquota: string | undefined;
  if (entrada.exigeAliquota) {
    const bp = entrada.aliquota.trim() ? aliquotaEmPontosBase(entrada.aliquota) : null;
    if (!entrada.aliquota.trim()) erros.aliquota = OBRIGATORIO;
    else if (bp === null) erros.aliquota = "Alíquota inválida";
    else aliquotaManualBp = bp;
    fonteAliquota = entrada.fonte.trim();
    if (!fonteAliquota) erros.fonte = OBRIGATORIO;
    else if (fonteAliquota.length < 3 || fonteAliquota.length > 500) erros.fonte = "Informe de 3 a 500 caracteres";
  }
  if (Object.keys(erros).length || valorCentavos === null) return { ok: false, erros };
  return { ok: true, valor: { valorCentavos, ...(aliquotaManualBp !== undefined ? { aliquotaManualBp, fonteAliquota } : {}) } };
}

/** Até onde o rascunho permite ir: cada passo exige os anteriores completos. */
export function passoLiberado(dados: DadosRascunho): NumeroPasso {
  if (!dados.competencia || (!dados.tomador && !dados.semTomador)) return 1;
  if (!dados.servico) return 2;
  if (!dados.valores || (dados.substituicao && !dados.substituicao.motivoCodigo)) return 3;
  return 4;
}

/** Motivo da substituição (passo Valores): código obrigatório; descrição obrigatória só em "99 - Outros". */
export function validarMotivoSubstituicao(entrada: { codigo: string; motivo: string }): Validacao<{ motivoCodigo: MotivoSubstituicao; motivo?: string }> {
  const erros: Erros = {};
  if (!(entrada.codigo in MOTIVOS_SUBSTITUICAO)) erros.motivoCodigo = OBRIGATORIO;
  const descricao = validarDescricaoMotivo(entrada.motivo, entrada.codigo === "99");
  if (descricao) erros.motivo = descricao;
  if (Object.keys(erros).length) return { ok: false, erros };
  const motivo = entrada.motivo.trim().replace(/\s+/g, " ");
  return { ok: true, valor: { motivoCodigo: entrada.codigo as MotivoSubstituicao, ...(motivo ? { motivo } : {}) } };
}

/** Prévia dos valores (passo 4): ISSQN e valor líquido. Retido = descontado do líquido. */
export function previaValores(entrada: { valorCentavos: number; aliquotaBp?: number; retido: boolean }) {
  const issqn = entrada.aliquotaBp === undefined ? null : Math.round((entrada.valorCentavos * entrada.aliquotaBp) / 10000);
  const retido = entrada.retido && issqn !== null ? issqn : 0;
  return { base: entrada.valorCentavos, issqn, retido, liquido: entrada.valorCentavos - retido };
}
