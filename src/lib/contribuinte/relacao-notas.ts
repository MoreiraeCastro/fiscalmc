import "server-only";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import municipios from "@/lib/nfse/data/municipios-ibge.json";
import { downloadAuthorizedFiscalArtifact } from "@/lib/nfse/artifacts/download";
import { getConfiguredNFSeEnvironment } from "@/lib/nfse/environments";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatarDocumento } from "./formato";
import { montarDanfse } from "@/lib/nfse/danfse/modelo";
import { gerarDanfsePdf } from "@/lib/nfse/danfse/pdf";

/**
 * Relação de NFS-e de uma competência (dia 1 ao último dia do mês), no mesmo leiaute da extensão que o escritório
 * usava ("Simples" e "Completa", aba Resumo). Tudo sai do XML oficial: as notas lidas do ADN (inclusive as emitidas
 * fora deste emissor) e, nas emitidas, as nossas que o ADN ainda não devolveu.
 */
export type TipoRelacao = "emitidas" | "recebidas";
export type ModeloRelacao = "simples" | "completa";
export type FormatoArquivos = "xml" | "pdf";

type No = Record<string, unknown>;
const tabelaMunicipios = municipios as unknown as Record<string, [string, string]>;
const leitor = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true });

function filho(no: unknown, ...caminho: string[]): unknown {
  let atual: unknown = no;
  for (const parte of caminho) {
    if (!atual || typeof atual !== "object") return undefined;
    atual = (atual as No)[parte];
    if (Array.isArray(atual)) atual = atual[0];
  }
  return atual;
}
function texto(no: unknown, ...caminho: string[]): string | null {
  const valor = filho(no, ...caminho);
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number") return String(valor);
  if (valor && typeof valor === "object" && "#text" in (valor as No)) return String((valor as No)["#text"]).trim() || null;
  return null;
}
function numero(no: unknown, ...caminho: string[]): number | null {
  const valor = texto(no, ...caminho);
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}
function lugar(nome: string | null, codigo: string | null) {
  const item = codigo ? tabelaMunicipios[codigo] : undefined;
  const cidade = nome ?? item?.[0] ?? null;
  return cidade ? `${cidade}${item?.[1] ? `/${item[1]}` : ""}` : "-";
}
const comCodigo = (codigo: string | null, mapa: Record<string, string>) => (codigo ? `${codigo} - ${mapa[codigo] ?? ""}`.replace(/ - $/, "") : null);
/** "2026-09-17T13:30:19-03:00" → "17/09/2026 às 13:30:19-03:00", como a extensão mostra a data do evento. */
const dataHoraEvento = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}${iso.length > 10 ? ` às ${iso.slice(11)}` : ""}` : null);
function dataExcel(iso: string | null) {
  if (!iso) return null;
  return new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
}

const SIMPLES: Record<string, string> = { "1": "Não Optante", "2": "Optante - MEI", "3": "Optante - ME/EPP" };
const SITUACAO_NFSE: Record<string, string> = { "100": "NFS-e Gerada", "101": "NFS-e de Substituição Gerada", "102": "NFS-e de Decisão Judicial", "103": "NFS-e Avulsa" };
const TRIBUTACAO: Record<string, string> = { "1": "Operação Tributável", "2": "Imunidade", "3": "Exportação de Serviço", "4": "Não Incidência" };
const RETENCAO: Record<string, string> = { "1": "Não Retido", "2": "Retido pelo Tomador", "3": "Retido pelo Intermediário" };
const RETENCAO_FEDERAL: Record<string, string> = {
  "0": "PIS/COFINS/CSLL Não Retidos", "1": "Retido", "2": "Não Retido", "3": "PIS/COFINS/CSLL Retidos",
  "4": "PIS/COFINS Retidos, CSLL Não Retido", "5": "PIS Retido, COFINS/CSLL Não Retidos", "6": "COFINS Retido, PIS/CSLL Não Retidos",
  "7": "PIS Não Retido, COFINS/CSLL Retidos", "8": "PIS/COFINS Não Retidos, CSLL Retido", "9": "COFINS Não Retido, PIS/CSLL Retidos",
};
const CST_PIS_COFINS: Record<string, string> = {
  "00": "Nenhum", "01": "Operação Tributável com Alíquota Básica", "02": "Operação Tributável com Alíquota Diferenciada",
  "03": "Operação Tributável com Alíquota por Unidade de Medida de Produto", "04": "Operação Tributável monofásica - Revenda a Alíquota Zero",
  "05": "Operação Tributável por Substituição Tributária", "06": "Operação Tributável a Alíquota Zero", "07": "Operação Tributável da Contribuição",
  "08": "Operação sem Incidência da Contribuição", "09": "Operação com Suspensão da Contribuição",
};

export type Evento = { codigo: string | null; descricao: string | null; autor: string | null; data: string | null; registro: string | null; substituicao: boolean };

/** Evento do ADN (cancelamento, cancelamento por substituição...): o grupo eNNNNNN do pedido de registro. */
export function lerEvento(xml: string): Evento | null {
  let raiz: unknown;
  try { raiz = leitor.parse(xml); } catch { return null; }
  const inf = filho(raiz, "evento", "infEvento");
  const ped = filho(inf, "pedRegEvento", "infPedReg");
  if (!ped || typeof ped !== "object") return null;
  const chave = Object.keys(ped as No).find((k) => /^e\d{6}$/.test(k));
  const autor = texto(ped, "CNPJAutor") ?? texto(ped, "CPFAutor");
  return {
    codigo: chave ? chave.slice(1) : null,
    descricao: chave ? texto(ped, chave, "xDesc") : null,
    autor: autor ? formatarDocumento(autor) : null,
    data: texto(ped, "dhEvento"),
    registro: texto(inf, "dhProc"),
    substituicao: chave === "e105102",
  };
}

type Nota = { chave: string; xml: string };

const CABECALHO_COMPLETA = ["Número NFS-e", "Data Geração", "Competência", "CNPJ/CPF Prestador", "Nome Prestador", "CNPJ/CPF Tomador", "Nome Tomador", "Município Serviço", "Valor do Serviço (R$)", "Insc. Municipal Emitente", "Simples Nacional", "DPS Nº", "DPS Série", "Situação NFS-e", "Tributação do ISSQN", "Município de Incidência", "Desconto Incond. (R$)", "Base de Cálculo (R$)", "Alíquota ISSQN (%)", "Valor do ISSQN (R$)", "Retenção ISSQN", "Cód. Tributação Nacional", "Item da NBS", "Descrição do Serviço", "CST IBS/CBS", "Class. Tributária IBS/CBS", "Indicador da Operação", "BC IBS/CBS (R$)", "Reemb./Repasse/Ressarc. (R$)", "Alíquota CBS (%)", "Red. Alíquota CBS (%)", "Alíq. Efetiva CBS (%)", "Valor CBS Total (R$)", "Alíquota IBS Estadual (%)", "Red. Alíq. IBS Estadual (%)", "Alíq. Efetiva IBS Estadual (%)", "Valor IBS Estadual (R$)", "Alíquota IBS Municipal (%)", "Red. Alíq. IBS Municipal (%)", "Alíq. Efetiva IBS Municipal (%)", "Valor IBS Municipal (R$)", "Valor IBS Total (R$)", "Sit. Trib. PIS/COFINS", "BC PIS/COFINS (R$)", "PIS - Alíquota (%)", "PIS - Débito (R$)", "COFINS - Alíquota (%)", "COFINS - Débito (R$)", "Descr. Contrib. Sociais Ret.", "IRRF (R$)", "Contrib. Sociais Ret. (R$)", "Contrib. Previd. Ret. (R$)", "% Total Tributos (SN)", "Insc. Municipal Tomador", "Informações Complementares", "Evento", "Autor do Evento", "Data do Evento", "Data Registro do Evento", "Situação", "Chave NFS-e"];
const COLUNAS_SIMPLES = ["Número NFS-e", "Data Geração", "Competência", "CNPJ/CPF Prestador", "Nome Prestador", "CNPJ/CPF Tomador", "Nome Tomador", "Município Serviço", "Valor do Serviço (R$)", "Valor do ISSQN (R$)", "Retenção ISSQN", "Cód. Tributação Nacional", "Situação", "Chave NFS-e"];
const DATAS = new Set(["Data Geração"]);
const PERCENTUAIS = new Set(CABECALHO_COMPLETA.filter((c) => c.includes("(%)")));

/** Uma linha "Completa" (61 colunas, na ordem da extensão) a partir do XML e dos eventos da nota. */
export function linhaCompleta(xml: string, eventos: Evento[]): { valores: Record<string, unknown>; situacao: "Normal" | "Cancelada" | "Substituída" } | null {
  let raiz: unknown;
  try { raiz = leitor.parse(xml); } catch { return null; }
  const inf = filho(raiz, "NFSe", "infNFSe");
  if (!inf) return null;
  const dps = filho(inf, "DPS", "infDPS");
  const prest = filho(dps, "prest");
  const toma = filho(dps, "toma");
  const emit = filho(inf, "emit");
  const serv = filho(dps, "serv");
  const cServ = filho(serv, "cServ");
  const vDps = filho(dps, "valores");
  const tribMun = filho(vDps, "trib", "tribMun");
  const tribFed = filho(vDps, "trib", "tribFed");
  const pc = filho(tribFed, "piscofins");
  const totTrib = filho(vDps, "trib", "totTrib");
  const vNfse = filho(inf, "valores");
  const ibsDps = filho(dps, "IBSCBS");
  const ibsNfse = filho(inf, "IBSCBS");
  const vIbs = filho(ibsNfse, "valores");
  const tot = filho(ibsNfse, "totCIBS");

  // Vale o evento que muda a situação (cancelamento, por substituição ou não); sem ele, o mais recente.
  const encerra = (e: Evento) => e.substituicao || e.codigo === "101101";
  const evento = [...eventos].sort((a, b) => Number(encerra(b)) - Number(encerra(a)) || (b.registro ?? "").localeCompare(a.registro ?? ""))[0];
  const situacao = !evento ? "Normal" : evento.substituicao ? "Substituída" : evento.codigo === "101101" ? "Cancelada" : "Normal";
  const competencia = texto(dps, "dCompet");
  const cTribNac = texto(cServ, "cTribNac");
  const cNbs = texto(cServ, "cNBS");
  const somaTrib = ["vTotTribFed", "vTotTribEst", "vTotTribMun"].map((k) => numero(totTrib, "vTotTrib", k));
  const totalTributos = numero(totTrib, "pTotTribSN") ?? (somaTrib.some((v) => v !== null) ? somaTrib.reduce<number>((t, v) => t + (v ?? 0), 0) : null);
  const docTomador = texto(toma, "CNPJ") ?? texto(toma, "CPF") ?? texto(toma, "NIF");

  return {
    situacao,
    valores: {
      "Número NFS-e": numero(inf, "nNFSe") ?? texto(inf, "nNFSe"),
      "Data Geração": dataExcel(texto(inf, "dhProc")),
      "Competência": competencia ? `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}` : null,
      "CNPJ/CPF Prestador": formatarDocumento(texto(emit, "CNPJ") ?? texto(emit, "CPF") ?? texto(prest, "CNPJ") ?? texto(prest, "CPF")),
      "Nome Prestador": texto(emit, "xNome") ?? texto(prest, "xNome"),
      "CNPJ/CPF Tomador": docTomador ?? "-",
      "Nome Tomador": texto(toma, "xNome") ?? "Não informado",
      // Como na extensão: o município emissor da nota (xLocEmi), não o local da prestação.
      "Município Serviço": lugar(texto(inf, "xLocEmi"), texto(emit, "enderNac", "cMun") ?? texto(dps, "cLocEmi")),
      "Valor do Serviço (R$)": numero(vDps, "vServPrest", "vServ"),
      "Insc. Municipal Emitente": texto(emit, "IM") ?? "-",
      "Simples Nacional": SIMPLES[texto(prest, "regTrib", "opSimpNac") ?? ""] ?? "-",
      "DPS Nº": texto(dps, "nDPS"),
      "DPS Série": texto(dps, "serie"),
      "Situação NFS-e": comCodigo(texto(inf, "cStat"), SITUACAO_NFSE),
      "Tributação do ISSQN": comCodigo(texto(tribMun, "tribISSQN"), TRIBUTACAO),
      "Município de Incidência": texto(inf, "cLocIncid") ? lugar(texto(inf, "xLocIncid"), texto(inf, "cLocIncid")) : "-",
      "Desconto Incond. (R$)": numero(vDps, "vDescCondIncond", "vDescIncond") ?? 0,
      "Base de Cálculo (R$)": numero(vNfse, "vBC"),
      "Alíquota ISSQN (%)": numero(vNfse, "pAliqAplic"),
      "Valor do ISSQN (R$)": numero(vNfse, "vISSQN"),
      "Retenção ISSQN": comCodigo(texto(tribMun, "tpRetISSQN"), RETENCAO),
      "Cód. Tributação Nacional": cTribNac ? `${cTribNac} - ${texto(inf, "xTribNac") ?? ""}`.replace(/ - $/, "") : null,
      "Item da NBS": cNbs ? `${cNbs} - ${texto(inf, "xNBS") ?? ""}`.replace(/ - $/, "") : null,
      "Descrição do Serviço": texto(cServ, "xDescServ")?.replace(/\s+/g, " ") ?? null,
      "CST IBS/CBS": texto(ibsDps, "valores", "trib", "gIBSCBS", "CST") ?? texto(ibsDps, "valores", "trib", "CST"),
      "Class. Tributária IBS/CBS": texto(ibsDps, "valores", "trib", "gIBSCBS", "cClassTrib") ?? texto(ibsDps, "valores", "trib", "cClassTrib"),
      "Indicador da Operação": texto(ibsDps, "cIndOp"),
      "BC IBS/CBS (R$)": numero(vIbs, "vBC"),
      "Reemb./Repasse/Ressarc. (R$)": numero(vIbs, "vCalcReeRepRes"),
      "Alíquota CBS (%)": numero(vIbs, "fed", "pCBS"),
      "Red. Alíquota CBS (%)": numero(vIbs, "fed", "pRedAliqCBS"),
      "Alíq. Efetiva CBS (%)": numero(vIbs, "fed", "pAliqEfetCBS"),
      "Valor CBS Total (R$)": numero(tot, "gCBS", "vCBS"),
      "Alíquota IBS Estadual (%)": numero(vIbs, "uf", "pIBSUF"),
      "Red. Alíq. IBS Estadual (%)": numero(vIbs, "uf", "pRedAliqUF"),
      "Alíq. Efetiva IBS Estadual (%)": numero(vIbs, "uf", "pAliqEfetUF"),
      "Valor IBS Estadual (R$)": numero(tot, "gIBS", "gIBSUFTot", "vIBSUF"),
      "Alíquota IBS Municipal (%)": numero(vIbs, "mun", "pIBSMun"),
      "Red. Alíq. IBS Municipal (%)": numero(vIbs, "mun", "pRedAliqMun"),
      "Alíq. Efetiva IBS Municipal (%)": numero(vIbs, "mun", "pAliqEfetMun"),
      "Valor IBS Municipal (R$)": numero(tot, "gIBS", "gIBSMunTot", "vIBSMun"),
      "Valor IBS Total (R$)": numero(tot, "gIBS", "vIBSTot"),
      "Sit. Trib. PIS/COFINS": texto(pc, "CST") && texto(pc, "CST") !== "00" ? comCodigo(texto(pc, "CST"), CST_PIS_COFINS) : "Não informado",
      "BC PIS/COFINS (R$)": numero(pc, "vBCPisCofins") ?? 0,
      "PIS - Alíquota (%)": numero(pc, "pAliqPis") ?? 0,
      "PIS - Débito (R$)": numero(pc, "vPis") ?? 0,
      "COFINS - Alíquota (%)": numero(pc, "pAliqCofins") ?? 0,
      "COFINS - Débito (R$)": numero(pc, "vCofins") ?? 0,
      "Descr. Contrib. Sociais Ret.": comCodigo(texto(pc, "tpRetPisCofins"), RETENCAO_FEDERAL) ?? "0 - PIS/COFINS/CSLL Não Retidos",
      "IRRF (R$)": numero(tribFed, "vRetIRRF") ?? 0,
      "Contrib. Sociais Ret. (R$)": numero(tribFed, "vRetCSLL") ?? 0,
      "Contrib. Previd. Ret. (R$)": numero(tribFed, "vRetCP") ?? 0,
      "% Total Tributos (SN)": totalTributos,
      "Insc. Municipal Tomador": texto(toma, "IM") ?? "-",
      "Informações Complementares": texto(serv, "infoCompl", "xInfComp") ?? "-",
      "Evento": evento ? `Evento de ${evento.descricao ?? evento.codigo ?? ""}`.trim() : null,
      "Autor do Evento": evento?.autor ?? null,
      "Data do Evento": evento ? dataHoraEvento(evento.data) : null,
      "Data Registro do Evento": evento ? dataHoraEvento(evento.registro) : null,
      "Situação": situacao,
      "Chave NFS-e": (texto(inf, "@_Id") ?? "").replace(/^NFS/, ""),
    },
  };
}

/** Último dia da competência "AAAA-MM". */
export function intervaloDaCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { de: `${competencia}-01`, ate: `${competencia}-${String(ultimo).padStart(2, "0")}` };
}

async function paginas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const saida: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw new Error("Não foi possível ler as notas.");
    saida.push(...(data ?? []));
    if (!data || data.length < 1000) return saida;
  }
}

/** As notas da competência e os eventos de cada uma. */
async function notasDaCompetencia(empresaId: string, tipo: TipoRelacao, de: string, ate: string) {
  const db = createAdminClient();
  const ambiente = getConfiguredNFSeEnvironment();
  const papeis = tipo === "emitidas" ? ["PRESTADOR"] : ["TOMADOR", "INTERMEDIARIO"];
  const doAdn = await paginas((i, f) => db.from("received_documents").select("access_key,xml")
    .eq("organization_id", empresaId).eq("environment", ambiente).eq("document_type", "NFSE").in("role", papeis)
    .gte("competence", de).lte("competence", ate).order("nsu", { ascending: true }).range(i, f));
  const notas = new Map<string, Nota>(doAdn.map((item) => [item.access_key as string, { chave: item.access_key as string, xml: item.xml as string }]));

  if (tipo === "emitidas") {
    // Nossas notas que o ADN ainda não devolveu: o XML vem do que guardamos na emissão.
    const nossas = await paginas((i, f) => db.from("invoices").select("id,nfse_number,access_key")
      .eq("organization_id", empresaId).eq("environment", ambiente).in("status", ["ISSUED", "CANCELLED"])
      .not("access_key", "is", null).gte("service_date", de).lte("service_date", ate).range(i, f));
    for (const nota of nossas) {
      if (notas.has(nota.access_key as string)) continue;
      const arquivo = await downloadAuthorizedFiscalArtifact({ invoiceId: nota.id as string, organizationId: empresaId, artifactType: "NFSE_XML", nfseNumber: nota.nfse_number as string | null }).catch(() => null);
      if (arquivo) notas.set(nota.access_key as string, { chave: nota.access_key as string, xml: Buffer.from(await arquivo.body.arrayBuffer()).toString("utf8") });
    }
  }

  const chaves = [...notas.keys()];
  const eventos = new Map<string, Evento[]>();
  for (let i = 0; i < chaves.length; i += 200) {
    const { data } = await db.from("received_documents").select("access_key,xml")
      .eq("organization_id", empresaId).eq("environment", ambiente).eq("document_type", "EVENTO").in("access_key", chaves.slice(i, i + 200));
    for (const item of data ?? []) {
      const evento = lerEvento(item.xml as string);
      if (evento) eventos.set(item.access_key as string, [...(eventos.get(item.access_key as string) ?? []), evento]);
    }
  }
  return [...notas.values()].map((nota) => ({ ...nota, eventos: eventos.get(nota.chave) ?? [] }));
}

/** Monta o .xlsx (aba Relação + aba Resumo) e o nome do arquivo no padrão da extensão. */
export async function gerarRelacao(input: { empresaId: string; razaoSocial: string; tipo: TipoRelacao; modelo: ModeloRelacao; competencia: string; agora?: Date }) {
  const { de, ate } = intervaloDaCompetencia(input.competencia);
  const notas = await notasDaCompetencia(input.empresaId, input.tipo, de, ate);
  const linhas = notas.map((nota) => linhaCompleta(nota.xml, nota.eventos)).filter((linha): linha is NonNullable<typeof linha> => Boolean(linha))
    .sort((a, b) => Number(b.valores["Número NFS-e"] ?? 0) - Number(a.valores["Número NFS-e"] ?? 0));
  const colunas = input.modelo === "completa" ? CABECALHO_COMPLETA : COLUNAS_SIMPLES;

  const livro = new ExcelJS.Workbook();
  const relacao = livro.addWorksheet("Relação", { views: [{ state: "frozen", ySplit: 1 }] });
  relacao.columns = colunas.map((titulo) => ({
    header: titulo, key: titulo,
    width: titulo === "Descrição do Serviço" || titulo.startsWith("Cód. Tributação") || titulo === "Item da NBS" || titulo === "Informações Complementares" ? 50
      : titulo.startsWith("Nome") ? 38 : titulo === "Chave NFS-e" ? 52 : Math.max(12, Math.min(28, titulo.length + 2)),
    style: DATAS.has(titulo) ? { numFmt: "dd/mm/yyyy" } : titulo.includes("(R$)") ? { numFmt: "#,##0.00" } : PERCENTUAIS.has(titulo) ? { numFmt: "0.00" } : {},
  }));
  relacao.getRow(1).font = { bold: true };
  for (const linha of linhas) relacao.addRow(colunas.map((titulo) => linha.valores[titulo] ?? null));
  relacao.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, linhas.length + 1), column: colunas.length } };

  // Linha de total, como na extensão: soma só as notas "Normal" e respeita o filtro do Excel (SUBTOTAL ignora o que está oculto).
  if (linhas.length) {
    const ultima = linhas.length + 1;
    const situacao = relacao.getColumn(colunas.indexOf("Situação") + 1).letter;
    const dinheiro = colunas.map((titulo, i) => (titulo.includes("(R$)") ? i + 1 : 0)).filter(Boolean);
    const total = relacao.getRow(ultima + 1);
    const normais = linhas.filter((l) => l.situacao === "Normal").length;
    total.getCell(dinheiro[0] - 1).value = `TOTAL só normais (${normais} ${normais === 1 ? "nota" : "notas"})`;
    for (const coluna of dinheiro) {
      const letra = relacao.getColumn(coluna).letter;
      total.getCell(coluna).value = { formula: `SUMPRODUCT(SUBTOTAL(109,OFFSET(${letra}2,ROW(${letra}2:${letra}${ultima})-ROW(${letra}2),0)),--(${situacao}2:${situacao}${ultima}="Normal"))` };
    }
    total.font = { bold: true };
  }

  const resumo = livro.addWorksheet("Resumo");
  resumo.columns = [{ header: "Situação", key: "s", width: 16 }, { header: "Qtd", key: "q", width: 8 }, { header: "Valor (R$)", key: "v", width: 18, style: { numFmt: "#,##0.00" } }];
  resumo.getRow(1).font = { bold: true };
  const valor = (situacao: string) => linhas.filter((l) => l.situacao === situacao).reduce((t, l) => t + Number(l.valores["Valor do Serviço (R$)"] ?? 0), 0);
  const qtd = (situacao: string) => linhas.filter((l) => l.situacao === situacao).length;
  for (const situacao of ["Normal", "Cancelada", "Substituída"]) resumo.addRow([situacao, qtd(situacao), valor(situacao)]);
  resumo.addRow(["Total", linhas.length, ["Normal", "Cancelada", "Substituída"].reduce((t, s) => t + valor(s), 0)]).font = { bold: true };
  resumo.addRow([]);
  const agora = input.agora ?? new Date();
  const local = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(agora);
  const parte = (tipo: string) => local.find((p) => p.type === tipo)?.value ?? "";
  resumo.addRow(["Gerado em:", `${parte("day")}/${parte("month")}/${parte("year")}, ${parte("hour")}:${parte("minute")}:${parte("second")}`]);

  const dia = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
  const carimbo = `${parte("day")}${parte("month")}${parte("year")}-${parte("hour")}${parte("minute")}${parte("second")}`;
  const nome = `${input.razaoSocial.replace(/[\\/:*?"<>|]+/g, " ").trim()} - ${input.tipo === "emitidas" ? "Emitidas" : "Recebidas"} - ${input.modelo === "completa" ? "Completa" : "Simples"} - ${dia(de)} a ${dia(ate)} - ${carimbo}.xlsx`;
  return { arquivo: new Uint8Array(await livro.xlsx.writeBuffer()), nome, quantidade: linhas.length };
}

function carimboAgora(agora: Date) {
  const local = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(agora);
  const parte = (tipo: string) => local.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("day")}${parte("month")}${parte("year")}-${parte("hour")}${parte("minute")}${parte("second")}`;
}

const nomeSeguro = (texto: string) => texto.replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).replace(/[.\s]+$/, "");

/**
 * Os arquivos das NFS-e da competência num .zip: o XML oficial de cada nota ou o DANFS-e (montado do XML, no leiaute
 * nacional, com a marca de cancelada/substituída). Um arquivo por nota: "<Emitida|Recebida> - <número> - <contraparte>".
 */
export async function gerarArquivosNotas(input: { empresaId: string; razaoSocial: string; tipo: TipoRelacao; formato: FormatoArquivos; competencia: string; agora?: Date }) {
  const { de, ate } = intervaloDaCompetencia(input.competencia);
  const notas = await notasDaCompetencia(input.empresaId, input.tipo, de, ate);
  const zip = new JSZip();
  const usados = new Set<string>();
  let quantidade = 0;
  for (const nota of notas) {
    const linha = linhaCompleta(nota.xml, nota.eventos);
    const numero = String(linha?.valores["Número NFS-e"] ?? nota.chave.slice(-15));
    const contraparte = String((input.tipo === "emitidas" ? linha?.valores["Nome Tomador"] : linha?.valores["Nome Prestador"]) ?? "");
    let base = nomeSeguro(`${input.tipo === "emitidas" ? "Emitida" : "Recebida"} - ${numero}${contraparte ? ` - ${contraparte}` : ""}`);
    if (usados.has(base)) base = `${base} - ${nota.chave.slice(-8)}`;
    usados.add(base);
    if (input.formato === "xml") {
      zip.file(`${base}.xml`, nota.xml);
    } else {
      const modelo = montarDanfse(nota.xml, { cancelada: linha?.situacao === "Cancelada", substituida: linha?.situacao === "Substituída" });
      if (!modelo) continue;
      zip.file(`${base}.pdf`, await gerarDanfsePdf(modelo));
    }
    quantidade++;
  }
  const dia = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
  const nome = `${input.razaoSocial.replace(/[\\/:*?"<>|]+/g, " ").trim()} - ${input.tipo === "emitidas" ? "Emitidas" : "Recebidas"} - ${input.formato.toUpperCase()} - ${dia(de)} a ${dia(ate)} - ${carimboAgora(input.agora ?? new Date())}.zip`;
  return { arquivo: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), nome, quantidade };
}
