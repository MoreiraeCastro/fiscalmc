// DANFSe conforme a NT 008/2026 (SE/CGNFS-e): lê o XML da NFS-e e monta os blocos e campos já formatados.
// Função pura; o desenho do PDF fica em pdf.ts. Só imprime o que está no XML (item 2.1 da NT); campo vazio vira "-" (nota 12).
import { XMLParser } from "fast-xml-parser";
import municipios from "@/lib/nfse/data/municipios-ibge.json";

type No = Record<string, unknown>;
const tabelaMunicipios = municipios as unknown as Record<string, [string, string]>;

export const URL_CONSULTA_PUBLICA = "https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=";
export const VAZIO = "-";

/** Um campo: título (label) e conteúdo. colunas = 1 (5,09 cm) ou 2 (10,19 cm); destaque = fundo cinza (2.2.3). */
export type Campo = { rotulo: string; valor: string; colunas?: 1 | 2; destaque?: boolean };
/** Linha de um bloco: até 4 colunas. A primeira linha leva o título do bloco na coluna 1. */
export type Linha = Campo[];
export type Bloco =
  | { tipo: "campos"; titulo: string; linhas: Linha[] }
  /** Bloco suprimido (notas 2, 3 e 4): só uma frase, na altura mínima de 0,32 cm. */
  | { tipo: "aviso"; texto: string }
  /** Descrição do código (sem label) + descrição do serviço, de altura variável. */
  | { tipo: "descricao"; descricaoCodigo: string; descricaoServico: string }
  /** Informações complementares: o corpo (pode ser cortado) e a linha fixa dos totais aproximados dos tributos. */
  | { tipo: "texto"; titulo: string; texto: string; rodape: string };

export type DanfseModelo = {
  chave: string;
  qrCode: string;
  cabecalho: { municipio: string | null; ambienteGerador: string; tipoAmbiente: string; semValidade: boolean };
  identificacao: Linha[];
  blocos: Bloco[];
  marcaDagua: "CANCELADA" | "SUBSTITUÍDA" | null;
};

const TP_EMIT: Record<string, string> = { "1": "Prestador", "2": "Tomador", "3": "Intermediário" };
const C_STAT: Record<string, string> = { "100": "NFS-e Gerada", "101": "NFS-e de Substituição Gerada", "102": "NFS-e de Decisão Judicial ou Administrativa", "103": "NFS-e Avulsa" };
const FIN_NFSE: Record<string, string> = { "0": "NFS-e regular" };
const AMB_GER: Record<string, string> = { "1": "Prefeitura", "2": "Sistema Nacional da NFS-e" };
const TP_AMB: Record<string, string> = { "1": "Produção", "2": "Homologação" };
const OP_SIMP_NAC: Record<string, string> = { "1": "Não Optante", "2": "Optante - Microempreendedor Individual (MEI)", "3": "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)" };
const REG_AP_TRIB_SN: Record<string, string> = {
  "1": "Regime de apuração dos tributos federais e municipal pelo Simples Nacional",
  "2": "Regime de apuração dos tributos federais pelo SN e o ISSQN pela NFS-e conforme respectiva legislação municipal do tributo",
  "3": "Regime de apuração dos tributos federais e municipal pela NFS-e conforme respectivas legislações federal e municipal de cada tributo",
};
const REG_ESP_TRIB: Record<string, string> = { "0": "Nenhum", "1": "Ato Cooperado (Cooperativa)", "2": "Estimativa", "3": "Microempresa Municipal", "4": "Notário ou Registrador", "5": "Profissional Autônomo", "6": "Sociedade de Profissionais", "9": "Outros" };
const TRIB_ISSQN: Record<string, string> = { "1": "Operação Tributável", "2": "Imunidade", "3": "Exportação de Serviço", "4": "Não Incidência" };
const TP_IMUNIDADE: Record<string, string> = {
  "0": "Imunidade (tipo não informado)",
  "1": "Patrimônio, renda ou serviços, uns dos outros (CF88, Art 150, VI, a)",
  "2": "Templos de qualquer culto (CF88, Art 150, VI, b)",
  "3": "Patrimônio, renda ou serviços dos partidos políticos, inclusive suas fundações, das entidades sindicais dos trabalhadores, das instituições de educação e de assistência social, sem fins lucrativos (CF88, Art 150, VI, c)",
  "4": "Livros, jornais, periódicos e o papel destinado a sua impressão (CF88, Art 150, VI, d)",
  "5": "Fonogramas e videofonogramas musicais produzidos no Brasil (CF88, Art 150, VI, e)",
};
const TP_SUSP: Record<string, string> = { "1": "Exigibilidade Suspensa por Decisão Judicial", "2": "Exigibilidade Suspensa por Processo Administrativo" };
const TP_BM: Record<string, string> = { "1": "Isenção", "2": "Redução da BC em percentual", "3": "Redução da BC em valor", "4": "Alíquota Diferenciada" };
const TP_RET_ISSQN: Record<string, string> = { "1": "Não Retido", "2": "Retido pelo Tomador", "3": "Retido pelo Intermediário" };
const TP_RET_PIS_COFINS: Record<string, string> = {
  "0": "PIS/COFINS/CSLL Não Retidos", "1": "PIS/COFINS Retidos", "2": "PIS/COFINS Não Retidos", "3": "PIS/COFINS/CSLL Retidos", "4": "PIS/COFINS Retidos, CSLL Não Retido",
  "5": "PIS Retido, COFINS/CSLL Não Retido", "6": "COFINS Retido, PIS/CSLL Não Retido", "7": "PIS Não Retido, COFINS/CSLL Retidos", "8": "PIS/COFINS Não Retidos, CSLL Retido", "9": "COFINS Não Retido, PIS/CSLL Retidos",
};

function filho(no: unknown, ...caminho: string[]): unknown {
  let atual: unknown = no;
  for (const parte of caminho) {
    if (!atual || typeof atual !== "object") return undefined;
    atual = (atual as No)[parte];
  }
  return Array.isArray(atual) ? atual[0] : atual;
}
function texto(no: unknown, ...caminho: string[]): string | null {
  const valor = filho(no, ...caminho);
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number") return String(valor);
  if (valor && typeof valor === "object" && "#text" in (valor as No)) return String((valor as No)["#text"]).trim() || null;
  return null;
}
const ou = (valor: string | null | undefined) => (valor && valor.trim() ? valor.trim() : VAZIO);
const descricao = (tabela: Record<string, string>, codigo: string | null) => (codigo ? tabela[codigo] ?? codigo : null);

/** "Preencher com reticências (...), caso a descrição supere N caracteres." */
export function limitar(valor: string, maximo: number) {
  return valor.length > maximo ? `${valor.slice(0, maximo).trimEnd()}...` : valor;
}

export function documento(valor: string | null) {
  if (!valor) return null;
  const d = valor.replace(/\D/g, "");
  if (d.length === 14 && /^\d+$/.test(valor)) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11 && /^\d+$/.test(valor)) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return valor;
}
function cep(valor: string | null) {
  const d = (valor ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}` : valor;
}
/** "2026-01-20T02:16:30-03:00" → "20/01/2026 02:16:30" (o horário como está no XML, sem converter fuso). */
export function dataHora(valor: string | null) {
  const m = valor?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return m[4] ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6] ?? "00"}` : `${m[3]}/${m[2]}/${m[1]}`;
}
function data(valor: string | null) {
  return dataHora(valor)?.slice(0, 10) ?? null;
}
/** "1234.5" → "R$ 1.234,50" */
export function moeda(valor: string | null | number) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) return null;
  return `R$ ${numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function percentual(valor: string | null) {
  if (!valor) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? `${numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : null;
}
function soma(...valores: (string | null)[]) {
  const presentes = valores.filter((valor): valor is string => Boolean(valor) && Number.isFinite(Number(valor)));
  return presentes.length ? presentes.reduce((total, valor) => total + Number(valor), 0) : null;
}
function municipio(codigo: string | null) {
  if (!codigo) return null;
  const item = tabelaMunicipios[codigo];
  return item ? `${item[0]} / ${item[1]}` : codigo;
}
function ufDe(codigo: string | null) {
  return codigo ? tabelaMunicipios[codigo]?.[1] ?? null : null;
}
function codigoNacional(valor: string | null) {
  return valor && /^\d{6}$/.test(valor) ? `${valor.slice(0, 2)}.${valor.slice(2, 4)}.${valor.slice(4)}` : valor;
}
function nbs(valor: string | null) {
  return valor && /^\d{9}$/.test(valor) ? `${valor.slice(0, 1)}.${valor.slice(1, 5)}.${valor.slice(5, 7)}.${valor.slice(7)}` : valor;
}

/** Bloco de pessoa (prestador, tomador, destinatário, intermediário): itens 2.1.3 a 2.1.6. */
function pessoa(titulo: string, no: unknown, opcoes: { comInscricao: boolean; reserva?: unknown }): Linha[] {
  const valor = (...caminho: string[]) => texto(no, ...caminho) ?? (opcoes.reserva ? texto(opcoes.reserva, ...caminho) : null);
  // Endereço: end/endNac (cMun, CEP) ou end/endExt na DPS; no emitente da NFS-e, enderNac.
  const end = filho(no, "end") ?? filho(opcoes.reserva, "enderNac");
  const nac = filho(end, "endNac") ?? (filho(end, "cMun") ? end : undefined);
  const ext = filho(end, "endExt");
  const cMun = texto(nac, "cMun");
  const local = ext ? [texto(ext, "xCidade"), texto(ext, "xEstProvReg")].filter(Boolean).join(" / ") : municipio(cMun);
  const ibgeCep = ext ? texto(ext, "cEndPost") : [cMun, cep(texto(nac, "CEP"))].filter(Boolean).join(" / ");
  const endereco = [texto(end, "xLgr"), texto(end, "nro"), texto(end, "xCpl"), texto(end, "xBairro")].filter(Boolean).join(", ");
  const doc = valor("CNPJ") ?? valor("CPF") ?? valor("NIF");
  return [
    [
      { rotulo: titulo, valor: "", destaque: true },
      { rotulo: "CNPJ / CPF / NIF", valor: ou(documento(doc)) },
      opcoes.comInscricao ? { rotulo: "Indicador Municipal (Inscrição)", valor: ou(valor("IM")) } : { rotulo: "", valor: "" },
      { rotulo: "Telefone", valor: ou(valor("fone")) },
    ],
    [
      { rotulo: "Nome / Nome Empresarial", valor: ou(limitar(valor("xNome") ?? "", 77)), colunas: 2 },
      { rotulo: "Município / Sigla UF", valor: ou(local ? limitar(local, 37) : null) },
      { rotulo: "Código IBGE / CEP", valor: ou(ibgeCep) },
    ],
    [
      { rotulo: "Endereço", valor: ou(limitar(endereco, 77)), colunas: 2 },
      { rotulo: "E-mail", valor: ou(valor("email")), colunas: 2 },
    ],
  ];
}

export function montarDanfse(xml: string, situacao: { cancelada?: boolean; substituida?: boolean } = {}): DanfseModelo | null {
  let raiz: unknown;
  try {
    raiz = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true }).parse(xml);
  } catch {
    return null;
  }
  const inf = filho(raiz, "NFSe", "infNFSe");
  if (!inf) return null;
  const dps = filho(inf, "DPS", "infDPS");
  const prest = filho(dps, "prest");
  const regTrib = filho(prest, "regTrib");
  const toma = filho(dps, "toma");
  const interm = filho(dps, "interm");
  const ibsCbsDps = filho(dps, "IBSCBS");
  const dest = filho(ibsCbsDps, "dest");
  const ibsCbs = filho(inf, "IBSCBS");
  const serv = filho(dps, "serv");
  const cServ = filho(serv, "cServ");
  const valoresDps = filho(dps, "valores");
  const tribMun = filho(valoresDps, "trib", "tribMun");
  const tribFed = filho(valoresDps, "trib", "tribFed");
  const pisCofins = filho(tribFed, "piscofins");
  const valoresNfse = filho(inf, "valores");
  const descontos = filho(valoresDps, "vDescCondIncond");

  const chave = (texto(inf, "@_Id") ?? "").replace(/^NFS/, "");
  const tpAmb = texto(dps, "tpAmb");
  const cTribNac = texto(cServ, "cTribNac");
  const codigoEmit = texto(filho(inf, "emit"), "enderNac", "cMun");
  // Município do emitente: "Município: CCCC / CC". Não exibir quando o item do código nacional for 99.
  const municipioEmitente = cTribNac?.startsWith("99") ? null : `Município: ${[texto(inf, "xLocEmi"), ufDe(codigoEmit) ?? texto(filho(inf, "emit"), "enderNac", "UF")].filter(Boolean).join(" / ")}`;

  const identificacao: Linha[] = [
    [{ rotulo: "CHAVE DE ACESSO DA NFS-E", valor: ou(chave) }],
    [
      { rotulo: "NÚMERO DA NFS-E", valor: ou(texto(inf, "nNFSe")) },
      { rotulo: "COMPETÊNCIA DA NFS-E", valor: ou(data(texto(dps, "dCompet"))) },
      { rotulo: "DATA E HORA DA EMISSÃO DA NFS-E", valor: ou(dataHora(texto(inf, "dhProc"))) },
    ],
    [
      { rotulo: "NÚMERO DA DPS", valor: ou(texto(dps, "nDPS")) },
      { rotulo: "SÉRIE DA DPS", valor: ou(texto(dps, "serie")) },
      { rotulo: "DATA E HORA DA EMISSÃO DA DPS", valor: ou(dataHora(texto(dps, "dhEmi"))) },
    ],
    [
      { rotulo: "EMITENTE DA NFS-E", valor: ou(descricao(TP_EMIT, texto(dps, "tpEmit"))), destaque: true },
      { rotulo: "SITUAÇÃO DA NFS-E", valor: ou(limitar(descricao(C_STAT, texto(inf, "cStat")) ?? "", 37)) },
      { rotulo: "FINALIDADE", valor: ou(limitar(descricao(FIN_NFSE, texto(ibsCbsDps, "finNFSe")) ?? "", 37)) },
    ],
  ];

  const blocos: Bloco[] = [];
  blocos.push({ tipo: "campos", titulo: "PRESTADOR / FORNECEDOR", linhas: [
    ...pessoa("PRESTADOR / FORNECEDOR", prest, { comInscricao: true, reserva: filho(inf, "emit") }),
    [
      { rotulo: "Simples Nacional na Data de Competência", valor: ou(limitar(descricao(OP_SIMP_NAC, texto(regTrib, "opSimpNac")) ?? "", 37)) },
      { rotulo: "", valor: "" },
      { rotulo: "Regime de Apuração Tributária pelo SN", valor: ou(limitar(descricao(REG_AP_TRIB_SN, texto(regTrib, "regApTribSN")) ?? "", 77)), colunas: 2 },
    ],
  ] });

  blocos.push(toma ? { tipo: "campos", titulo: "TOMADOR / ADQUIRENTE", linhas: pessoa("TOMADOR / ADQUIRENTE", toma, { comInscricao: true }) } : { tipo: "aviso", texto: "TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e" });
  blocos.push(dest ? { tipo: "campos", titulo: "DESTINATÁRIO DA OPERAÇÃO", linhas: pessoa("DESTINATÁRIO DA OPERAÇÃO", dest, { comInscricao: false }) }
    : toma ? { tipo: "aviso", texto: "O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO" } : { tipo: "aviso", texto: "DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e" });
  blocos.push(interm ? { tipo: "campos", titulo: "INTERMEDIÁRIO DA OPERAÇÃO", linhas: pessoa("INTERMEDIÁRIO DA OPERAÇÃO", interm, { comInscricao: true }) } : { tipo: "aviso", texto: "INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e" });

  const cLocPrest = texto(serv, "locPrest", "cLocPrestacao");
  const localPrestacao = [texto(inf, "xLocPrestacao"), ufDe(cLocPrest), texto(serv, "locPrest", "cPaisPrestacao") ?? (cLocPrest ? "BR" : null)].filter(Boolean).join(" / ");
  blocos.push({ tipo: "campos", titulo: "SERVIÇO PRESTADO", linhas: [[
    { rotulo: "SERVIÇO PRESTADO", valor: "", destaque: true },
    { rotulo: "Código de Tributação Nacional / Municipal", valor: ou([codigoNacional(cTribNac), texto(cServ, "cTribMun")].filter(Boolean).join(" / ")) },
    { rotulo: "Código da NBS", valor: ou(nbs(texto(cServ, "cNBS"))) },
    { rotulo: "Local da Prestação / Sigla UF / País", valor: ou(limitar(localPrestacao, 42)) },
  ]] });
  blocos.push({ tipo: "descricao", descricaoCodigo: limitar(texto(inf, "xTribMun") ?? texto(inf, "xTribNac") ?? VAZIO, 167), descricaoServico: limitar(texto(cServ, "xDescServ") ?? VAZIO, 1297) });

  const tribIssqn = texto(tribMun, "tribISSQN");
  if (tribIssqn === "4") {
    blocos.push({ tipo: "aviso", texto: "TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN" });
  } else {
    const bm = filho(tribMun, "BM");
    const incidencia = [texto(inf, "xLocIncid"), ufDe(texto(inf, "cLocIncid")), texto(tribMun, "cPaisResult") ?? (texto(inf, "cLocIncid") ? "BR" : null)].filter(Boolean).join(" / ");
    const linhaEspecial: Linha = [
      { rotulo: "Regime Especial de Tributação do ISSQN", valor: ou(descricao(REG_ESP_TRIB, texto(regTrib, "regEspTrib"))) },
      { rotulo: "Tipo de Imunidade do ISSQN", valor: ou(limitar(descricao(TP_IMUNIDADE, texto(tribMun, "tpImunidade")) ?? "", 37)) },
      { rotulo: "Suspensão da Exigibilidade do ISSQN", valor: ou(limitar(descricao(TP_SUSP, texto(tribMun, "exigSusp", "tpSusp")) ?? "", 37)) },
      { rotulo: "Número Processo Suspensão", valor: ou(texto(tribMun, "exigSusp", "nProcesso")) },
    ];
    const deducoes = filho(valoresDps, "vDedRed");
    const totalDeducoes = texto(deducoes, "vDR") ?? (soma(texto(valoresNfse, "vCalcDR"), texto(ibsCbs, "valores", "vCalcReeRepRes"))?.toFixed(2) ?? null);
    const linhaBeneficio: Linha = [
      { rotulo: "Benefício Municipal", valor: ou(descricao(TP_BM, texto(valoresNfse, "tpBM"))) },
      { rotulo: "Cálculo do BM", valor: ou(moeda(texto(valoresNfse, "vCalcBM") ?? texto(bm, "vRedBCBM"))) },
      { rotulo: "Total Deduções/Reduções", valor: ou(moeda(totalDeducoes)) },
      { rotulo: "Desconto Incondicionado", valor: ou(moeda(texto(descontos, "vDescIncond"))) },
    ];
    const vazia = (linha: Linha) => linha.every((campo) => campo.valor === VAZIO);
    blocos.push({ tipo: "campos", titulo: "TRIBUTAÇÃO MUNICIPAL (ISSQN)", linhas: [
      [
        { rotulo: "TRIBUTAÇÃO MUNICIPAL (ISSQN)", valor: "", destaque: true },
        { rotulo: "Tipo de Tributação do ISSQN", valor: ou(descricao(TRIB_ISSQN, tribIssqn)) },
        { rotulo: "Município / Sigla UF / País de Incidência do ISSQN", valor: ou(limitar(incidencia, 42)), colunas: 2 },
      ],
      // Nota 5: a linha pode ser suprimida quando todos os campos dela estão vazios no XML.
      ...(vazia(linhaEspecial) ? [] : [linhaEspecial]),
      ...(vazia(linhaBeneficio) ? [] : [linhaBeneficio]),
      [
        { rotulo: "BC ISSQN", valor: ou(moeda(texto(valoresNfse, "vBC"))) },
        { rotulo: "Alíquota Aplicada", valor: ou(percentual(texto(valoresNfse, "pAliqAplic"))) },
        { rotulo: "Retenção do ISSQN", valor: ou(descricao(TP_RET_ISSQN, texto(tribMun, "tpRetISSQN"))) },
        { rotulo: "ISSQN Apurado", valor: ou(moeda(texto(valoresNfse, "vISSQN"))) },
      ],
    ] });
  }

  const competencia = texto(dps, "dCompet") ?? "";
  blocos.push({ tipo: "campos", titulo: "TRIBUTAÇÃO FEDERAL (EXCETO CBS)", linhas: [
    [
      { rotulo: "TRIBUTAÇÃO FEDERAL (EXCETO CBS)", valor: "", destaque: true },
      { rotulo: "IRRF", valor: ou(moeda(texto(tribFed, "vRetIRRF"))) },
      { rotulo: "Contribuição Previdenciária - Retida", valor: ou(moeda(texto(tribFed, "vRetCP"))) },
      { rotulo: "Contribuições Sociais - Retidas", valor: ou(moeda(texto(tribFed, "vRetCSLL"))) },
    ],
    // Nota 6: só para competência até o fim de 2026.
    ...(competencia && competencia > "2026-12-31" ? [] : [[
      { rotulo: "PIS - Débito Apuração Própria", valor: ou(moeda(texto(pisCofins, "vPis"))) },
      { rotulo: "COFINS - Débito Apuração Própria", valor: ou(moeda(texto(pisCofins, "vCofins"))) },
      { rotulo: "Descrição Contrib. Sociais - Retidas", valor: ou(limitar(descricao(TP_RET_PIS_COFINS, texto(pisCofins, "tpRetPisCofins")) ?? "", 35)), colunas: 2 as const },
    ]]),
  ] });

  // IBS/CBS: CST/cClassTrib direto em trib (leiaute RTC da restrita) ou dentro de gIBSCBS (leiaute publicado).
  const tribIbsCbs = filho(ibsCbsDps, "valores", "trib");
  const situacaoIbsCbs = filho(tribIbsCbs, "gIBSCBS") ?? tribIbsCbs;
  const valoresIbs = filho(ibsCbs, "valores");
  const totIbs = filho(ibsCbs, "totCIBS");
  const cLocIncid = texto(ibsCbs, "cLocalidadeIncid");
  blocos.push({ tipo: "campos", titulo: "TRIBUTAÇÃO IBS / CBS", linhas: [
    [
      { rotulo: "TRIBUTAÇÃO IBS / CBS", valor: "", destaque: true },
      { rotulo: "CST / cClassTrib", valor: ou([texto(situacaoIbsCbs, "CST"), texto(situacaoIbsCbs, "cClassTrib")].filter(Boolean).join(" / ")) },
      { rotulo: "Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF", valor: ou([texto(ibsCbsDps, "cIndOp"), cLocIncid, texto(ibsCbs, "xLocalidadeIncid"), ufDe(cLocIncid)].filter(Boolean).join(" / ")), colunas: 2 },
    ],
    [
      { rotulo: "Exclusões e Reduções da Base de Cálculo", valor: ou(moeda(soma(texto(descontos, "vDescIncond"), texto(valoresIbs, "vCalcReeRepRes"), texto(valoresNfse, "vISSQN"), texto(pisCofins, "vPis"), texto(pisCofins, "vCofins")))) },
      { rotulo: "Base de Cálculo Após Exclusões e Reduções", valor: ou(moeda(texto(valoresIbs, "vBC"))) },
      { rotulo: "Red. Alíquota IBS / Red. Alíquota CBS", valor: ou([percentual(texto(valoresIbs, "uf", "pRedAliqUF")), percentual(texto(valoresIbs, "mun", "pRedAliqMun")), percentual(texto(valoresIbs, "fed", "pRedAliqCBS"))].some(Boolean) ? [percentual(texto(valoresIbs, "uf", "pRedAliqUF")), percentual(texto(valoresIbs, "mun", "pRedAliqMun")), percentual(texto(valoresIbs, "fed", "pRedAliqCBS"))].map(ou).join(" / ") : null) },
      { rotulo: "Alíquota - IBS UF / IBS Mun", valor: ou([percentual(texto(valoresIbs, "uf", "pIBSUF")), percentual(texto(valoresIbs, "mun", "pIBSMun"))].some(Boolean) ? [percentual(texto(valoresIbs, "uf", "pIBSUF")), percentual(texto(valoresIbs, "mun", "pIBSMun"))].map(ou).join(" / ") : null) },
    ],
    [
      { rotulo: "Alíq. Efetiva Municipal - IBS", valor: ou(percentual(texto(valoresIbs, "mun", "pAliqEfetMun"))) },
      { rotulo: "Valor Apurado Municipal - IBS", valor: ou(moeda(texto(totIbs, "gIBS", "gIBSMunTot", "vIBSMun"))) },
      { rotulo: "Alíq. Efetiva Estadual - IBS", valor: ou(percentual(texto(valoresIbs, "uf", "pAliqEfetUF"))) },
      { rotulo: "Valor Apurado Estadual - IBS", valor: ou(moeda(texto(totIbs, "gIBS", "gIBSUFTot", "vIBSUF"))) },
    ],
    [
      { rotulo: "Valor Total Apurado - IBS", valor: ou(moeda(texto(totIbs, "gIBS", "vIBSTot"))) },
      { rotulo: "Alíquota - CBS", valor: ou(percentual(texto(valoresIbs, "fed", "pCBS"))) },
      { rotulo: "Alíquota Efetiva - CBS", valor: ou(percentual(texto(valoresIbs, "fed", "pAliqEfetCBS"))) },
      { rotulo: "Valor Total Apurado - CBS", valor: ou(moeda(texto(totIbs, "gCBS", "vCBS"))) },
    ],
  ] });

  const totalIbsCbs = soma(texto(totIbs, "gIBS", "vIBSTot"), texto(totIbs, "gCBS", "vCBS"));
  blocos.push({ tipo: "campos", titulo: "VALOR TOTAL DA NFS-E", linhas: [
    [
      { rotulo: "VALOR TOTAL DA NFS-E", valor: "", destaque: true },
      { rotulo: "Valor da Operação / Serviço", valor: ou(moeda(texto(valoresDps, "vServPrest", "vServ"))) },
      { rotulo: "Desconto Incondicionado", valor: ou(moeda(texto(descontos, "vDescIncond"))) },
      { rotulo: "Desconto Condicionado", valor: ou(moeda(texto(descontos, "vDescCond"))) },
    ],
    [
      { rotulo: "Total das Retenções (ISSQN / Federais)", valor: ou(moeda(texto(valoresNfse, "vTotalRet"))) },
      { rotulo: "Valor Líquido da NFS-e", valor: ou(moeda(texto(valoresNfse, "vLiq"))) },
      { rotulo: "Total do IBS/CBS", valor: ou(moeda(totalIbsCbs)) },
      { rotulo: "Valor Líquido da NFS-e + IBS/CBS", valor: ou(moeda(texto(totIbs, "vTotNF"))), destaque: true },
    ],
  ] });

  const complementares = informacoesComplementares({ dps, serv, ibsCbsDps, inf, valoresDps });
  blocos.push({ tipo: "texto", titulo: "INFORMAÇÕES COMPLEMENTARES", texto: complementares.corpo, rodape: complementares.totais });

  return {
    chave,
    qrCode: `${URL_CONSULTA_PUBLICA}${chave}`,
    cabecalho: { municipio: municipioEmitente, ambienteGerador: `Ambiente Gerador: ${ou(descricao(AMB_GER, texto(inf, "ambGer")))}`, tipoAmbiente: `Tipo de Ambiente: ${ou(descricao(TP_AMB, tpAmb))}`, semValidade: tpAmb === "2" },
    identificacao,
    blocos,
    marcaDagua: situacao.substituida ? "SUBSTITUÍDA" : situacao.cancelada ? "CANCELADA" : null,
  };
}

/** Item 2.1.12 e nota da tabela: campos na ordem da NT, separados por "|"; os totais aproximados dos tributos são obrigatórios e fixos no fim. */
function informacoesComplementares(input: { dps: unknown; serv: unknown; ibsCbsDps: unknown; inf: unknown; valoresDps: unknown }) {
  const compl = filho(input.serv, "infoCompl");
  const partes = [
    ["Inf. Cont.:", texto(compl, "xInfComp")],
    ["NFS-e Subst.:", texto(input.dps, "subst", "chSubstda")],
    ["Doc. Ref.:", texto(compl, "docRef")],
    ["Cod. Obra:", texto(input.serv, "obra", "cObra")],
    ["Insc. Imob.:", texto(input.ibsCbsDps, "imovel", "inscImobFisc") ?? texto(input.serv, "obra", "inscImobFisc")],
    ["Cod. Evt.:", texto(input.serv, "atvEvento", "idAtvEvt")],
    ["Doc. Tec.:", texto(compl, "idDocTec")],
    ["Núm. Ped.:", texto(compl, "xPed")],
    ["Item Ped.:", texto(compl, "gItemPed", "xItemPed")],
    ["Inf. A. T. Mun.:", texto(input.inf, "xOutInf")],
  ].filter(([, valor]) => valor).map(([rotulo, valor]) => `${rotulo} ${valor}`);
  const tot = filho(input.valoresDps, "trib", "totTrib");
  const reais = filho(tot, "vTotTrib");
  const porcento = filho(tot, "pTotTrib");
  const simples = texto(tot, "pTotTribSN");
  const totais = reais
    ? `Federais: ${ou(moeda(texto(reais, "vTotTribFed")))}; Estaduais: ${ou(moeda(texto(reais, "vTotTribEst")))}; Municipais: ${ou(moeda(texto(reais, "vTotTribMun")))}`
    : porcento
      ? `Federais: ${ou(percentual(texto(porcento, "pTotTribFed")))}; Estaduais: ${ou(percentual(texto(porcento, "pTotTribEst")))}; Municipais: ${ou(percentual(texto(porcento, "pTotTribMun")))}`
      : simples ? `Simples Nacional: ${ou(percentual(simples))}` : `Federais: ${VAZIO}; Estaduais: ${VAZIO}; Municipais: ${VAZIO}`;
  const linhaTotais = `Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: ${totais}`;
  return { corpo: limitar(partes.join(" | "), 1997), totais: linhaTotais };
}
