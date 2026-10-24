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

/** exterior = tomador no exterior (documento é o NIF, quando houver). */
export type TomadorRascunho = { clienteId: string; documento: string | null; nome: string; exterior?: boolean };
export type ServicoRascunho = { modeloId: string; descricao: string };
/** Tributação federal da nota: PIS/COFINS (CST "00" = nenhum) e as retenções de IRRF, contribuições sociais e CP. */
export type FederalRascunho = { cst: string; baseCentavos?: number; pisBp?: number; cofinsBp?: number; retencaoPisCofins?: string; irrfCentavos?: number; csCentavos?: number; cpCentavos?: number };
export type ValoresRascunho = { valorCentavos: number; aliquotaManualBp?: number; fonteAliquota?: string; descIncondCentavos?: number; descCondCentavos?: number; federal?: FederalRascunho };
/** Intermediário no Brasil (CPF/CNPJ); a razão social de CNPJ vem do cartão CNPJ. */
export type IntermediarioRascunho = { documento: string; nome: string; email?: string };
/** Grupo "Informações complementares" do passo Serviço. */
export type ComplementoRascunho = { docTecnico?: string; docReferencia?: string; pedido?: string; informacoes?: string };
/** Comércio exterior (obrigatório quando o tomador está no exterior: E0330). */
export type ComercioExteriorRascunho = { modo: string; vinculo: string; moeda: string; valorMoedaCentavos: number; mecPrestador: string; mecTomador: string; movTempBens: string; nDI?: string; nRE?: string; mdic: "0" | "1" };
/** Substituição: a nota original (travada) e o motivo exigido pelo grupo subst da DPS. */
export type SubstituicaoRascunho = { notaId: string; chave: string; numero: string | null; competencia: string; valorCentavos: number; motivoCodigo?: MotivoSubstituicao; motivo?: string };
/** IBS/CBS do passo Serviço (CST, cClassTrib, cIndOp e indFinal); indDest é sempre 0 (destinatário = adquirente). */
export type IbsCbsRascunho = { cst: string; classificacao: string; indicadorOperacao: string; consumoPessoal: "0" | "1" };
export type DadosRascunho = { /** Criado pela emissão rápida (a revisão volta para /contribuinte/rapida). */ rapida?: boolean; competencia?: string; tomador?: TomadorRascunho; /** Tomador/Adquirente não informado. */ semTomador?: boolean; intermediario?: IntermediarioRascunho; informarIbsCbs?: boolean; ibsCbs?: IbsCbsRascunho; servico?: ServicoRascunho; complemento?: ComplementoRascunho; comercioExterior?: ComercioExteriorRascunho; valores?: ValoresRascunho; substituicao?: SubstituicaoRascunho };

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

/** Tomador no exterior: NIF ou motivo, nome e o endereço no exterior (a Receita exige o endereço: E0242). */
export type EntradaTomadorExterior = { nifInformado: string; nif: string; motivo: string; nome: string; email: string; pais: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; cep: string; estado: string };
export type TomadorExteriorValido = { nif: string | null; motivo: "1" | "2" | null; nome: string; email: string | null; pais: string; logradouro: string; numero: string; complemento: string | null; bairro: string; cidade: string; cep: string; estado: string };

const LIMITES_ENDERECO_EXTERIOR = { logradouro: 255, numero: 60, bairro: 60, cidade: 60, cep: 11, estado: 60 } as const;

export function validarTomadorExterior(entrada: EntradaTomadorExterior, paises: readonly string[]): Validacao<TomadorExteriorValido> {
  const erros: Erros = {};
  const limpo = (valor: string) => valor.trim().replace(/\s+/g, " ");
  const comNif = entrada.nifInformado === "SIM";
  const nif = limpo(entrada.nif);
  if (entrada.nifInformado !== "SIM" && entrada.nifInformado !== "NAO") erros.nifInformado = OBRIGATORIO;
  else if (comNif && !nif) erros.nif = OBRIGATORIO;
  else if (comNif && nif.length > 40) erros.nif = "Máximo de 40 caracteres";
  else if (!comNif && entrada.motivo !== "1" && entrada.motivo !== "2") erros.motivo = OBRIGATORIO;
  const nome = limpo(entrada.nome);
  if (!nome) erros.nome = OBRIGATORIO;
  else if (nome.length < 2 || nome.length > 300) erros.nome = "Nome inválido";
  const email = entrada.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.email = "E-mail inválido";
  if (!paises.includes(entrada.pais) || entrada.pais === "BR") erros.pais = OBRIGATORIO;
  const endereco = {} as Record<keyof typeof LIMITES_ENDERECO_EXTERIOR, string>;
  for (const [campo, max] of Object.entries(LIMITES_ENDERECO_EXTERIOR) as [keyof typeof LIMITES_ENDERECO_EXTERIOR, number][]) {
    endereco[campo] = limpo(entrada[campo]);
    if (!endereco[campo]) erros[campo] = OBRIGATORIO;
    else if (endereco[campo].length > max) erros[campo] = `Máximo de ${max} caracteres`;
  }
  const complemento = limpo(entrada.complemento);
  if (complemento.length > 156) erros.complemento = "Máximo de 156 caracteres";
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, valor: { nif: comNif ? nif : null, motivo: comNif ? null : (entrada.motivo as "1" | "2"), nome, email: email || null, pais: entrada.pais, ...endereco, complemento: complemento || null } };
}

/** Intermediário no Brasil: CPF/CNPJ válido e nome (erros com prefixo "interm" para não colidir com os do tomador). */
export function validarIntermediario(entrada: { documento: string; nome: string; email: string }): Validacao<IntermediarioRascunho> {
  const novo = validarNovoTomador(entrada);
  if (!novo.ok) return { ok: false, erros: Object.fromEntries(Object.entries(novo.erros).map(([campo, erro]) => [`interm${campo[0].toUpperCase()}${campo.slice(1)}`, erro])) };
  return { ok: true, valor: { documento: novo.valor.documento, nome: novo.valor.nome.slice(0, 300), ...(novo.valor.email ? { email: novo.valor.email } : {}) } };
}

export const INFO_COMPLEMENTAR_MAX = 2000;
const LIMITES_COMPLEMENTO = { docTecnico: 40, docReferencia: 255, pedido: 60, informacoes: INFO_COMPLEMENTAR_MAX } as const;

/** Informações complementares: tudo opcional, nos tamanhos do leiaute (idDocTec 40, docRef 255, xPed 60, xInfComp 2000). */
export function validarComplemento(entrada: Record<keyof ComplementoRascunho, string>): Validacao<ComplementoRascunho | undefined> {
  const erros: Erros = {};
  const valor: ComplementoRascunho = {};
  for (const [campo, max] of Object.entries(LIMITES_COMPLEMENTO) as [keyof ComplementoRascunho, number][]) {
    const texto = campo === "informacoes" ? entrada[campo].trim() : entrada[campo].trim().replace(/\s+/g, " ");
    if (texto.length > max) erros[campo] = `Máximo de ${max} caracteres`;
    else if (texto) valor[campo] = texto;
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, valor: Object.keys(valor).length ? valor : undefined };
}

export const MODO_PRESTACAO = { "1": "Transfronteiriço", "2": "Consumo no Brasil", "3": "Presença Comercial no Exterior", "4": "Movimento Temporário de Pessoas Físicas" } as const;
export const VINCULO_PARTES = { "0": "Sem vínculo com o Tomador/Prestador", "1": "Controlada", "2": "Controladora", "3": "Coligada", "4": "Matriz", "5": "Filial ou sucursal", "6": "Outro vínculo" } as const;
/** Moedas mais usadas, com o código da tabela do BACEN (tpMoeda). */
export const MOEDAS = { "220": "Dólar dos EUA", "978": "Euro", "540": "Libra esterlina", "425": "Franco suíço", "165": "Dólar canadense", "150": "Dólar australiano", "470": "Iene", "795": "Iuan renminbi", "706": "Peso argentino", "790": "Real" } as const;
export const MECANISMO_PRESTADOR = { "01": "Nenhum", "02": "ACC - Adiantamento sobre Contrato de Câmbio", "03": "ACE - Adiantamento sobre Cambiais Entregues", "04": "BNDES-Exim Pós-Embarque - Serviços", "05": "BNDES-Exim Pré-Embarque - Serviços", "06": "FGE - Fundo de Garantia à Exportação", "07": "PROEX - Equalização", "08": "PROEX - Financiamento" } as const;
export const MECANISMO_TOMADOR = { "01": "Nenhum", "02": "Adm. Pública e Repr. Internacional", "03": "Aluguéis e Arrend. Mercantil de máquinas, equip., embarc. e aeronaves", "04": "Arrendamento Mercantil de aeronave para empresa de transporte aéreo público", "05": "Comissão a agentes externos na exportação", "06": "Despesas de armazenagem, mov. e transporte de carga no exterior", "07": "Eventos FIFA (subsidiária)", "08": "Eventos FIFA", "09": "Fretes, arrendamentos de embarcações ou aeronaves e outros", "10": "Material Aeronáutico", "11": "Promoção de Bens no Exterior", "12": "Promoção de Dest. Turísticos Brasileiros", "13": "Promoção do Brasil no Exterior", "14": "Promoção Serviços no Exterior", "15": "RECINE", "16": "RECOPA", "17": "Registro e Manutenção de marcas, patentes e cultivares", "18": "REICOMP", "19": "REIDI" } as const;
export const MOVIMENTACAO_BENS = { "1": "Não", "2": "Vinculada - Declaração de Importação", "3": "Vinculada - Declaração de Exportação" } as const;

export type EntradaComercioExterior = { modo: string; vinculo: string; moeda: string; valorMoeda: string; mecPrestador: string; mecTomador: string; movTempBens: string; nDI: string; nRE: string; mdic: string };

export function validarComercioExterior(entrada: EntradaComercioExterior): Validacao<ComercioExteriorRascunho> {
  const erros: Erros = {};
  if (!(entrada.modo in MODO_PRESTACAO)) erros.modo = OBRIGATORIO;
  if (!(entrada.vinculo in VINCULO_PARTES)) erros.vinculo = OBRIGATORIO;
  if (!(entrada.moeda in MOEDAS)) erros.moeda = OBRIGATORIO;
  const valorMoedaCentavos = entrada.valorMoeda.trim() ? valorEmCentavos(entrada.valorMoeda) : null;
  if (!entrada.valorMoeda.trim()) erros.valorMoeda = OBRIGATORIO;
  else if (valorMoedaCentavos === null) erros.valorMoeda = "Valor inválido";
  if (!(entrada.mecPrestador in MECANISMO_PRESTADOR)) erros.mecPrestador = OBRIGATORIO;
  if (!(entrada.mecTomador in MECANISMO_TOMADOR)) erros.mecTomador = OBRIGATORIO;
  if (!(entrada.movTempBens in MOVIMENTACAO_BENS)) erros.movTempBens = OBRIGATORIO;
  const nDI = entrada.nDI.trim();
  const nRE = entrada.nRE.trim();
  if (entrada.movTempBens === "2" && !/^[0-9A-Za-z]{1,12}$/.test(nDI)) erros.nDI = nDI ? "Até 12 letras ou números" : OBRIGATORIO;
  if (entrada.movTempBens === "3" && !/^[0-9A-Za-z]{1,12}$/.test(nRE)) erros.nRE = nRE ? "Até 12 letras ou números" : OBRIGATORIO;
  if (entrada.mdic !== "0" && entrada.mdic !== "1") erros.mdic = OBRIGATORIO;
  if (Object.keys(erros).length || valorMoedaCentavos === null) return { ok: false, erros };
  return { ok: true, valor: { modo: entrada.modo, vinculo: entrada.vinculo, moeda: entrada.moeda, valorMoedaCentavos, mecPrestador: entrada.mecPrestador, mecTomador: entrada.mecTomador, movTempBens: entrada.movTempBens, ...(entrada.movTempBens === "2" ? { nDI } : {}), ...(entrada.movTempBens === "3" ? { nRE } : {}), mdic: entrada.mdic as "0" | "1" } };
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

/** Situação tributária do PIS/COFINS (TSTipoCST). "00" = nenhum: a nota sai sem o grupo do PIS/COFINS. */
export const CST_PIS_COFINS = {
  "00": "Nenhum", "01": "Operação Tributável com Alíquota Básica", "02": "Operação Tributável com Alíquota Diferenciada", "03": "Operação Tributável com Alíquota por Unidade de Medida de Produto",
  "04": "Operação Tributável monofásica - Revenda a Alíquota Zero", "05": "Operação Tributável por Substituição Tributária", "06": "Operação Tributável a Alíquota Zero", "07": "Operação Isenta da Contribuição",
  "08": "Operação sem Incidência da Contribuição", "09": "Operação com Suspensão da Contribuição", "49": "Outras Operações de Saída",
} as const;
export const RETENCAO_PIS_COFINS = {
  "0": "PIS/COFINS/CSLL Não Retidos", "1": "PIS/COFINS Retidos", "2": "PIS/COFINS Não Retidos", "3": "PIS/COFINS/CSLL Retidos", "4": "PIS/COFINS Retidos, CSLL Não Retido",
  "5": "PIS Retido, COFINS/CSLL Não Retido", "6": "COFINS Retido, PIS/CSLL Não Retido", "7": "PIS Não Retido, COFINS/CSLL Retidos", "8": "PIS/COFINS Não Retidos, CSLL Retido", "9": "COFINS Não Retido, PIS/CSLL Retidos",
} as const;

/** Valor opcional em reais: vazio ou zero = não informado; senão centavos (null se inválido). */
function valorOpcional(texto: string): number | undefined | null {
  const limpo = texto.trim();
  if (!limpo || /^0+(,0{1,2})?$/.test(limpo)) return undefined;
  return valorEmCentavos(limpo);
}

export type EntradaFederal = { cst: string; base: string; pis: string; cofins: string; retencao: string; irrf: string; cs: string; cp: string };

function validarFederal(f: EntradaFederal, valorCentavos: number | null, erros: Erros): FederalRascunho | undefined {
  const cst = f.cst in CST_PIS_COFINS ? f.cst : "";
  if (!cst) erros.cst = OBRIGATORIO;
  const irrf = valorOpcional(f.irrf);
  const cs = valorOpcional(f.cs);
  const cp = valorOpcional(f.cp);
  if (irrf === null) erros.irrf = "Valor inválido";
  if (cs === null) erros.cs = "Valor inválido";
  if (cp === null) erros.cp = "Valor inválido";
  let federal: FederalRascunho = { cst: cst || "00", ...(irrf ? { irrfCentavos: irrf } : {}), ...(cs ? { csCentavos: cs } : {}), ...(cp ? { cpCentavos: cp } : {}) };
  if (cst && cst !== "00") {
    const base = f.base.trim() ? valorEmCentavos(f.base) : null;
    const pis = f.pis.trim() ? aliquotaEmPontosBase(f.pis) : null;
    const cofins = f.cofins.trim() ? aliquotaEmPontosBase(f.cofins) : null;
    if (!f.base.trim()) erros.base = OBRIGATORIO; else if (base === null) erros.base = "Valor inválido";
    if (!f.pis.trim()) erros.pis = OBRIGATORIO; else if (pis === null) erros.pis = "Alíquota inválida";
    if (!f.cofins.trim()) erros.cofins = OBRIGATORIO; else if (cofins === null) erros.cofins = "Alíquota inválida";
    if (!(f.retencao in RETENCAO_PIS_COFINS)) erros.retencao = OBRIGATORIO;
    if (base !== null && pis !== null && cofins !== null) federal = { ...federal, baseCentavos: base, pisBp: pis, cofinsBp: cofins, retencaoPisCofins: f.retencao };
  }
  if (valorCentavos !== null && (federal.irrfCentavos ?? 0) + (federal.csCentavos ?? 0) + (federal.cpCentavos ?? 0) >= valorCentavos) erros.irrf = "As retenções precisam ser menores que o valor do serviço";
  return federal.cst === "00" && !federal.irrfCentavos && !federal.csCentavos && !federal.cpCentavos ? undefined : federal;
}

export function validarValores(entrada: { valor: string; aliquota: string; fonte: string; exigeAliquota: boolean; descIncond?: string; descCond?: string; federal?: EntradaFederal }): Validacao<ValoresRascunho> {
  const erros: Erros = {};
  const valorCentavos = entrada.valor.trim() ? valorEmCentavos(entrada.valor) : null;
  if (!entrada.valor.trim()) erros.valor = OBRIGATORIO;
  else if (valorCentavos === null) erros.valor = "Valor inválido";
  const descIncondCentavos = valorOpcional(entrada.descIncond ?? "");
  const descCondCentavos = valorOpcional(entrada.descCond ?? "");
  if (descIncondCentavos === null) erros.descIncond = "Valor inválido";
  if (descCondCentavos === null) erros.descCond = "Valor inválido";
  if (valorCentavos !== null && (descIncondCentavos || descCondCentavos) && (descIncondCentavos ?? 0) + (descCondCentavos ?? 0) >= valorCentavos) erros.descIncond = "Os descontos precisam ser menores que o valor do serviço";
  const federal = entrada.federal ? validarFederal(entrada.federal, valorCentavos, erros) : undefined;
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
  return { ok: true, valor: { valorCentavos, ...(aliquotaManualBp !== undefined ? { aliquotaManualBp, fonteAliquota } : {}), ...(descIncondCentavos ? { descIncondCentavos } : {}), ...(descCondCentavos ? { descCondCentavos } : {}), ...(federal ? { federal } : {}) } };
}

/** Até onde o rascunho permite ir: cada passo exige os anteriores completos. */
export function passoLiberado(dados: DadosRascunho): NumeroPasso {
  if (!dados.competencia || (!dados.tomador && !dados.semTomador)) return 1;
  if (!dados.servico || (dados.informarIbsCbs && !dados.ibsCbs) || (dados.tomador?.exterior && !dados.comercioExterior)) return 2;
  if (!dados.valores || (dados.substituicao && !dados.substituicao.motivoCodigo)) return 3;
  return 4;
}

/** IBS/CBS (passo Serviço): CST de 3 dígitos, classificação de 6 e um indicador da operação da tabela oficial. */
export function validarIbsCbs(entrada: { cst: string; classificacao: string; indicadorOperacao: string; consumoPessoal: string }, indicadoresValidos: string[]): Validacao<IbsCbsRascunho> {
  const erros: Erros = {};
  const cst = entrada.cst.trim();
  const classificacao = entrada.classificacao.replace(/[^0-9]/g, "");
  if (!cst) erros.cst = OBRIGATORIO; else if (!/^[0-9]{3}$/.test(cst)) erros.cst = "CST inválido";
  if (!classificacao) erros.classificacao = OBRIGATORIO; else if (classificacao.length !== 6) erros.classificacao = "Informe os 6 dígitos";
  if (!entrada.indicadorOperacao) erros.indicadorOperacao = OBRIGATORIO; else if (!indicadoresValidos.includes(entrada.indicadorOperacao)) erros.indicadorOperacao = "Indicador inválido";
  const consumoPessoal = entrada.consumoPessoal === "1" ? "1" : "0";
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, valor: { cst, classificacao, indicadorOperacao: entrada.indicadorOperacao, consumoPessoal } };
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

/**
 * Prévia dos valores (passo 4), na conta que a SEFIN fez na Produção Restrita (21/10/2026): o desconto incondicionado
 * reduz a base do ISSQN; o líquido desconta os dois descontos, o ISSQN retido, IRRF, CP e as contribuições sociais retidas.
 * O PIS/COFINS do grupo piscofins é débito (apuração própria) e não entra no líquido.
 */
export function previaValores(entrada: { valorCentavos: number; aliquotaBp?: number; retido: boolean; descIncondCentavos?: number; descCondCentavos?: number; federal?: FederalRascunho }) {
  const base = entrada.valorCentavos - (entrada.descIncondCentavos ?? 0);
  const issqn = entrada.aliquotaBp === undefined ? null : Math.round((base * entrada.aliquotaBp) / 10000);
  const issRetido = entrada.retido && issqn !== null ? issqn : 0;
  const f = entrada.federal;
  const retido = issRetido + (f?.irrfCentavos ?? 0) + (f?.csCentavos ?? 0) + (f?.cpCentavos ?? 0);
  const descontos = (entrada.descIncondCentavos ?? 0) + (entrada.descCondCentavos ?? 0);
  return { valor: entrada.valorCentavos, base, issqn, issRetido, retido, descontos, liquido: entrada.valorCentavos - descontos - retido, debitos: f && f.cst !== "00" ? debitosPisCofins(f) : null };
}

/** PIS/COFINS da nota: base × alíquota, arredondado ao centavo (o débito mostrado no Emissor Nacional). */
export function debitosPisCofins(federal: Pick<FederalRascunho, "baseCentavos" | "pisBp" | "cofinsBp">) {
  const base = federal.baseCentavos ?? 0;
  return { pis: Math.round((base * (federal.pisBp ?? 0)) / 10000), cofins: Math.round((base * (federal.cofinsBp ?? 0)) / 10000) };
}
