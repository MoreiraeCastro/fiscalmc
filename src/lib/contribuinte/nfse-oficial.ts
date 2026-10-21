// Lê o XML oficial da NFS-e (NFSe_v1.01) para a tela Visualizar. Função pura, tolerante a campos ausentes.
import { XMLParser } from "fast-xml-parser";

type No = Record<string, unknown>;

function filho(no: unknown, ...caminho: string[]): unknown {
  let atual: unknown = no;
  for (const parte of caminho) {
    if (!atual || typeof atual !== "object") return undefined;
    atual = (atual as No)[parte];
  }
  return atual;
}

function texto(no: unknown, ...caminho: string[]): string | null {
  const valor = filho(no, ...caminho);
  if (typeof valor === "string") return valor;
  if (typeof valor === "number") return String(valor);
  if (valor && typeof valor === "object" && "#text" in (valor as No)) return String((valor as No)["#text"]);
  return null;
}

/** "1234.50" → centavos. */
function centavos(valor: string | null) {
  if (!valor || !/^-?\d+(\.\d{1,2})?$/.test(valor)) return null;
  const [inteiro, decimal = ""] = valor.split(".");
  const sinal = valor.startsWith("-") ? -1 : 1;
  return sinal * (Math.abs(Number(inteiro)) * 100 + Number(decimal.padEnd(2, "0")));
}

/** No exterior: municipio = cidade, uf = estado/província, cep = código postal e pais = ISO. */
export type EnderecoOficial = { logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; municipio: string | null; uf: string | null; cep: string | null; pais?: string | null };
export type PessoaOficial = { documento: string | null; nome: string | null; inscricaoMunicipal: string | null; telefone: string | null; email: string | null; endereco: EnderecoOficial | null };

export type NfseOficial = {
  numero: string | null;
  dataProcessamento: string | null;
  localEmissao: string | null;
  localPrestacao: string | null;
  localIncidencia: string | null;
  descricaoTributacaoNacional: string | null;
  descricaoTributacaoMunicipal: string | null;
  descricaoNbs: string | null;
  versaoAplicacao: string | null;
  ambienteGerador: string | null;
  situacao: string | null;
  emitente: PessoaOficial;
  tomador: PessoaOficial | null;
  intermediario: PessoaOficial | null;
  /** Grupo infoCompl da DPS. */
  complemento: { docTecnico: string | null; docReferencia: string | null; pedido: string | null; informacoes: string | null } | null;
  descontos: { incondicionado: number | null; condicionado: number | null };
  /** Grupo tribFed da DPS (PIS/COFINS e retenções federais). */
  federal: { cst: string | null; basePisCofins: number | null; pis: number | null; cofins: number | null; tipoRetencao: string | null; irrf: number | null; cs: number | null; cp: number | null } | null;
  dps: { emitidaEm: string | null; serie: string | null; numero: string | null; competencia: string | null; versao: string | null };
  regime: { opcaoSimples: string | null; apuracaoSimples: string | null; regimeEspecial: string | null };
  servico: { codigoNacional: string | null; codigoMunicipal: string | null; descricao: string | null; nbs: string | null; localPrestacao: string | null };
  tributacao: { tributacaoIssqn: string | null; retencao: string | null; aliquotaInformada: string | null };
  valores: { servico: number | null; baseCalculo: number | null; aliquotaAplicada: string | null; issqn: number | null; totalRetido: number | null; liquido: number | null };
  substituida: string | null;
  /** IBS/CBS calculado pela SEFIN (grupo IBSCBS da NFS-e) + classificação informada na DPS. */
  ibsCbs: { localIncidencia: string | null; baseCalculo: number | null; aliquotaIbsUf: string | null; aliquotaIbsMun: string | null; aliquotaCbs: string | null; ibs: number | null; cbs: number | null; cst: string | null; classificacao: string | null; indicadorOperacao: string | null } | null;
};

function endereco(no: unknown): EnderecoOficial | null {
  // Emitente (NFS-e): enderNac com tudo dentro. Tomador (DPS): end com endNac (cMun/CEP) e o resto ao lado.
  const ender = filho(no, "enderNac");
  if (ender) return { logradouro: texto(ender, "xLgr"), numero: texto(ender, "nro"), complemento: texto(ender, "xCpl"), bairro: texto(ender, "xBairro"), municipio: texto(ender, "cMun"), uf: texto(ender, "UF"), cep: texto(ender, "CEP") };
  const end = filho(no, "end");
  if (!end) return null;
  const ext = filho(end, "endExt");
  if (ext) return { logradouro: texto(end, "xLgr"), numero: texto(end, "nro"), complemento: texto(end, "xCpl"), bairro: texto(end, "xBairro"), municipio: texto(ext, "xCidade"), uf: texto(ext, "xEstProvReg"), cep: texto(ext, "cEndPost"), pais: texto(ext, "cPais") };
  return { logradouro: texto(end, "xLgr"), numero: texto(end, "nro"), complemento: texto(end, "xCpl"), bairro: texto(end, "xBairro"), municipio: texto(end, "endNac", "cMun"), uf: null, cep: texto(end, "endNac", "CEP") };
}

function pessoa(no: unknown): PessoaOficial {
  return {
    documento: texto(no, "CNPJ") ?? texto(no, "CPF") ?? texto(no, "NIF"), nome: texto(no, "xNome"), inscricaoMunicipal: texto(no, "IM"),
    telefone: texto(no, "fone"), email: texto(no, "email"), endereco: endereco(no),
  };
}

export function lerNfseOficial(xml: string): NfseOficial | null {
  let raiz: unknown;
  try {
    raiz = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true }).parse(xml);
  } catch {
    return null;
  }
  const inf = filho(raiz, "NFSe", "infNFSe");
  if (!inf) return null;
  const dps = filho(inf, "DPS", "infDPS");
  const toma = filho(dps, "toma");
  const interm = filho(dps, "interm");
  const compl = filho(dps, "serv", "infoCompl");
  const tribFed = filho(dps, "valores", "trib", "tribFed");
  const pisCofins = filho(tribFed, "piscofins");
  const cServ = filho(dps, "serv", "cServ");
  const tribMun = filho(dps, "valores", "trib", "tribMun");
  const regTrib = filho(dps, "prest", "regTrib");
  return {
    numero: texto(inf, "nNFSe"), dataProcessamento: texto(inf, "dhProc"), localEmissao: texto(inf, "xLocEmi"), localPrestacao: texto(inf, "xLocPrestacao"),
    localIncidencia: texto(inf, "xLocIncid"), descricaoTributacaoNacional: texto(inf, "xTribNac"), descricaoTributacaoMunicipal: texto(inf, "xTribMun"), descricaoNbs: texto(inf, "xNBS"),
    versaoAplicacao: texto(inf, "verAplic"), ambienteGerador: texto(inf, "ambGer"), situacao: texto(inf, "cStat"),
    emitente: pessoa(filho(inf, "emit")),
    tomador: toma ? pessoa(toma) : null,
    intermediario: interm ? pessoa(interm) : null,
    complemento: compl ? { docTecnico: texto(compl, "idDocTec"), docReferencia: texto(compl, "docRef"), pedido: texto(compl, "xPed"), informacoes: texto(compl, "xInfComp") } : null,
    descontos: { incondicionado: centavos(texto(dps, "valores", "vDescCondIncond", "vDescIncond")), condicionado: centavos(texto(dps, "valores", "vDescCondIncond", "vDescCond")) },
    federal: tribFed ? {
      cst: texto(pisCofins, "CST"), basePisCofins: centavos(texto(pisCofins, "vBCPisCofins")), pis: centavos(texto(pisCofins, "vPis")), cofins: centavos(texto(pisCofins, "vCofins")), tipoRetencao: texto(pisCofins, "tpRetPisCofins"),
      irrf: centavos(texto(tribFed, "vRetIRRF")), cs: centavos(texto(tribFed, "vRetCSLL")), cp: centavos(texto(tribFed, "vRetCP")),
    } : null,
    dps: { emitidaEm: texto(dps, "dhEmi"), serie: texto(dps, "serie"), numero: texto(dps, "nDPS"), competencia: texto(dps, "dCompet"), versao: texto(filho(inf, "DPS"), "@_versao") },
    regime: { opcaoSimples: texto(regTrib, "opSimpNac"), apuracaoSimples: texto(regTrib, "regApTribSN"), regimeEspecial: texto(regTrib, "regEspTrib") },
    servico: { codigoNacional: texto(cServ, "cTribNac"), codigoMunicipal: texto(cServ, "cTribMun"), descricao: texto(cServ, "xDescServ"), nbs: texto(cServ, "cNBS"), localPrestacao: texto(dps, "serv", "locPrest", "cLocPrestacao") },
    tributacao: { tributacaoIssqn: texto(tribMun, "tribISSQN"), retencao: texto(tribMun, "tpRetISSQN"), aliquotaInformada: texto(tribMun, "pAliq") },
    valores: {
      servico: centavos(texto(dps, "valores", "vServPrest", "vServ")), baseCalculo: centavos(texto(inf, "valores", "vBC")), aliquotaAplicada: texto(inf, "valores", "pAliqAplic"),
      issqn: centavos(texto(inf, "valores", "vISSQN")), totalRetido: centavos(texto(inf, "valores", "vTotalRet")), liquido: centavos(texto(inf, "valores", "vLiq")),
    },
    substituida: texto(dps, "subst", "chSubstda"),
    ibsCbs: ibsCbsOficial(filho(inf, "IBSCBS"), filho(dps, "IBSCBS")),
  };
}

function ibsCbsOficial(nota: unknown, declarado: unknown): NfseOficial["ibsCbs"] {
  if (!nota && !declarado) return null;
  // Na DPS: CST/cClassTrib direto em trib (leiaute RTC da restrita) ou dentro de gIBSCBS (leiaute publicado).
  const trib = filho(declarado, "valores", "trib");
  const sit = filho(trib, "gIBSCBS") ?? trib;
  return {
    localIncidencia: texto(nota, "xLocalidadeIncid"), baseCalculo: centavos(texto(nota, "valores", "vBC")),
    aliquotaIbsUf: texto(nota, "valores", "uf", "pIBSUF"), aliquotaIbsMun: texto(nota, "valores", "mun", "pIBSMun"), aliquotaCbs: texto(nota, "valores", "fed", "pCBS"),
    ibs: centavos(texto(nota, "totCIBS", "gIBS", "vIBSTot")), cbs: centavos(texto(nota, "totCIBS", "gCBS", "vCBS")),
    cst: texto(sit, "CST"), classificacao: texto(sit, "cClassTrib"), indicadorOperacao: texto(declarado, "cIndOp"),
  };
}

export const SITUACAO_NFSE: Record<string, string> = { "100": "100 - NFS-e Gerada", "101": "101 - NFS-e de Substituição Gerada", "102": "102 - NFS-e de Decisão Judicial", "103": "103 - NFS-e Avulsa" };
export const AMBIENTE_GERADOR: Record<string, string> = { "1": "Prefeitura", "2": "Sefin Nacional NFS-e" };
