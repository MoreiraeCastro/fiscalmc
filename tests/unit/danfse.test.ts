import { describe, expect, it } from "vitest";
import { dataHora, documento, limitar, moeda, montarDanfse, URL_CONSULTA_PUBLICA, type Bloco, type Campo } from "@/lib/nfse/danfse/modelo";
import { PDFDocument } from "pdf-lib";
import { gerarDanfsePdf } from "@/lib/nfse/danfse/pdf";

const CHAVE = "33045572240241895000170000000000048726107479028174";

function xml(opcoes: { tpAmb?: string; toma?: boolean; interm?: boolean; dest?: boolean; tribISSQN?: string; ibsCbs?: boolean; compl?: boolean; competencia?: string; totTrib?: string } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${CHAVE}">
<xLocEmi>Rio de Janeiro</xLocEmi><xLocPrestacao>Rio de Janeiro</xLocPrestacao><nNFSe>487</nNFSe><cLocIncid>3304557</cLocIncid><xLocIncid>Rio de Janeiro</xLocIncid>
<xTribNac>Contabilidade, inclusive serviços técnicos e auxiliares.</xTribNac><ambGer>2</ambGer><cStat>100</cStat><dhProc>2026-10-24T02:02:21-03:00</dhProc>
<emit><CNPJ>40241895000170</CNPJ><xNome>ASSESSORIA CONTABIL MOREIRA &amp; CASTRO</xNome><enderNac><xLgr>AVENIDA RIO BRANCO</xLgr><nro>00099</nro><xBairro>CENTRO</xBairro><cMun>3304557</cMun><UF>RJ</UF><CEP>20040004</CEP></enderNac><fone>2122323926</fone></emit>
<valores><vBC>1000.00</vBC><pAliqAplic>5.00</pAliqAplic><vISSQN>50.00</vISSQN><vTotalRet>0.00</vTotalRet><vLiq>1000.00</vLiq></valores>
${opcoes.ibsCbs ? `<IBSCBS><cLocalidadeIncid>3304557</cLocalidadeIncid><xLocalidadeIncid>Rio de Janeiro</xLocalidadeIncid><valores><vBC>950.00</vBC><uf><pIBSUF>0.10</pIBSUF></uf><mun><pIBSMun>0.00</pIBSMun></mun><fed><pCBS>0.90</pCBS></fed></valores><totCIBS><vTotNF>1009.50</vTotNF><gIBS><vIBSTot>0.95</vIBSTot></gIBS><gCBS><vCBS>8.55</vCBS></gCBS></totCIBS></IBSCBS>` : ""}
<DPS versao="1.01"><infDPS Id="DPS1"><tpAmb>${opcoes.tpAmb ?? "1"}</tpAmb><dhEmi>2026-10-24T02:02:10-03:00</dhEmi><serie>900</serie><nDPS>483</nDPS><dCompet>${opcoes.competencia ?? "2026-10-24"}</dCompet><tpEmit>1</tpEmit>
<prest><CNPJ>40241895000170</CNPJ><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest>
${opcoes.toma === false ? "" : `<toma><CNPJ>65925173000166</CNPJ><xNome>RESTAURANTE NOODLE HOUSE LTDA</xNome><end><endNac><cMun>3304557</cMun><CEP>20771004</CEP></endNac><xLgr>Avenida Dom Hélder Câmara</xLgr><nro>05080</nro><xBairro>Cachambi</xBairro></end><fone>21993611262</fone></toma>`}
${opcoes.interm ? `<interm><CPF>12345678909</CPF><xNome>Fulano Intermediário</xNome></interm>` : ""}
<serv><locPrest><cLocPrestacao>3304557</cLocPrestacao></locPrest><cServ><cTribNac>171901</cTribNac><cTribMun>001</cTribMun><xDescServ>1 SERVIÇOS CONTÁBEIS N/MÊS</xDescServ><cNBS>113022100</cNBS></cServ>
${opcoes.compl ? `<infoCompl><idDocTec>ART-1</idDocTec><docRef>REF-9</docRef><xPed>PED-7</xPed><xInfComp>Pagamento via PIX</xInfComp></infoCompl>` : ""}</serv>
<valores><vServPrest><vServ>1000.00</vServ></vServPrest><trib><tribMun><tribISSQN>${opcoes.tribISSQN ?? "1"}</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>
<tribFed><piscofins><CST>00</CST><tpRetPisCofins>0</tpRetPisCofins></piscofins><vRetIRRF>15.00</vRetIRRF></tribFed>
<totTrib>${opcoes.totTrib ?? "<pTotTrib><pTotTribFed>13.45</pTotTribFed><pTotTribEst>0.00</pTotTribEst><pTotTribMun>4.73</pTotTribMun></pTotTrib>"}</totTrib></trib></valores>
${opcoes.ibsCbs ? `<IBSCBS><finNFSe>0</finNFSe><cIndOp>100301</cIndOp>${opcoes.dest ? `<dest><CNPJ>11222333000181</CNPJ><xNome>Destino SA</xNome></dest>` : ""}<valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS>` : ""}
</infDPS></DPS></infNFSe></NFSe>`;
}

const campos = (bloco: Bloco | undefined): Campo[] => (bloco?.tipo === "campos" ? bloco.linhas.flat() : []);
const valor = (bloco: Bloco | undefined, rotulo: string) => campos(bloco).find((campo) => campo.rotulo === rotulo)?.valor;
const bloco = (modelo: ReturnType<typeof montarDanfse>, titulo: string) => modelo?.blocos.find((item) => item.tipo === "campos" && item.titulo === titulo);
const avisos = (modelo: ReturnType<typeof montarDanfse>) => modelo?.blocos.filter((item) => item.tipo === "aviso").map((item) => (item.tipo === "aviso" ? item.texto : ""));

describe("formatos do DANFSe (NT 008/2026)", () => {
  it("documentos, datas, moeda e reticências", () => {
    expect(documento("40241895000170")).toBe("40.241.895/0001-70");
    expect(documento("12345678909")).toBe("123.456.789-09");
    expect(dataHora("2026-10-24T02:02:21-03:00")).toBe("24/10/2026 02:02:21");
    expect(moeda("1234.5")).toBe("R$ 1.234,50");
    expect(limitar("abcdef", 3)).toBe("abc...");
  });
});

describe("modelo do DANFSe", () => {
  it("identificação: chave sem o prefixo NFS, QR da consulta pública, descrições dos códigos", () => {
    const modelo = montarDanfse(xml())!;
    expect(modelo.chave).toBe(CHAVE);
    expect(modelo.qrCode).toBe(`${URL_CONSULTA_PUBLICA}${CHAVE}`);
    const identificacao = modelo.identificacao.flat();
    expect(identificacao.find((campo) => campo.rotulo === "NÚMERO DA NFS-E")?.valor).toBe("487");
    expect(identificacao.find((campo) => campo.rotulo === "EMITENTE DA NFS-E")).toMatchObject({ valor: "Prestador", destaque: true });
    expect(identificacao.find((campo) => campo.rotulo === "SITUAÇÃO DA NFS-E")?.valor).toBe("NFS-e Gerada");
    expect(modelo.cabecalho).toMatchObject({ municipio: "Município: Rio de Janeiro / RJ", ambienteGerador: "Ambiente Gerador: Sistema Nacional da NFS-e", tipoAmbiente: "Tipo de Ambiente: Produção", semValidade: false });
    expect(modelo.marcaDagua).toBeNull();
  });

  it("prestador vem do emitente da NFS-e quando a DPS não traz nome e endereço", () => {
    const prestador = bloco(montarDanfse(xml()), "PRESTADOR / FORNECEDOR");
    expect(valor(prestador, "Nome / Nome Empresarial")).toBe("ASSESSORIA CONTABIL MOREIRA & CASTRO");
    expect(valor(prestador, "Endereço")).toBe("AVENIDA RIO BRANCO, 00099, CENTRO");
    expect(valor(prestador, "Código IBGE / CEP")).toBe("3304557 / 20.040-004");
    expect(valor(prestador, "Simples Nacional na Data de Competência")).toBe("Optante - Microempresa ou Empresa de...");
  });

  it("campos vazios viram traço (nota 12)", () => {
    expect(valor(bloco(montarDanfse(xml()), "TOMADOR / ADQUIRENTE"), "E-mail")).toBe("-");
  });

  it("blocos suprimidos: sem tomador, destinatário = tomador, sem intermediário (notas 2 e 3)", () => {
    expect(avisos(montarDanfse(xml()))).toEqual(["O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO", "INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e"]);
    expect(avisos(montarDanfse(xml({ toma: false })))).toEqual(["TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e", "DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e", "INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e"]);
    const completo = montarDanfse(xml({ interm: true, ibsCbs: true, dest: true }));
    expect(avisos(completo)).toEqual([]);
    expect(valor(bloco(completo, "INTERMEDIÁRIO DA OPERAÇÃO"), "CNPJ / CPF / NIF")).toBe("123.456.789-09");
  });

  it("ISSQN: não incidência suprime o bloco (nota 4); linhas vazias somem (nota 5)", () => {
    expect(avisos(montarDanfse(xml({ tribISSQN: "4" })))).toContain("TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN");
    const iss = bloco(montarDanfse(xml()), "TRIBUTAÇÃO MUNICIPAL (ISSQN)");
    expect(valor(iss, "Alíquota Aplicada")).toBe("5,00%");
    expect(valor(iss, "Município / Sigla UF / País de Incidência do ISSQN")).toBe("Rio de Janeiro / RJ / BR");
    expect(campos(iss).some((campo) => campo.rotulo === "Benefício Municipal")).toBe(false);
    expect(campos(iss).some((campo) => campo.rotulo === "Regime Especial de Tributação do ISSQN")).toBe(true);
  });

  it("PIS/COFINS só até a competência 2026 (nota 6)", () => {
    expect(campos(bloco(montarDanfse(xml()), "TRIBUTAÇÃO FEDERAL (EXCETO CBS)")).some((campo) => campo.rotulo === "PIS - Débito Apuração Própria")).toBe(true);
    expect(campos(bloco(montarDanfse(xml({ competencia: "2027-01-05" })), "TRIBUTAÇÃO FEDERAL (EXCETO CBS)")).some((campo) => campo.rotulo === "PIS - Débito Apuração Própria")).toBe(false);
  });

  it("IBS/CBS e valor total com IBS/CBS", () => {
    const modelo = montarDanfse(xml({ ibsCbs: true }));
    expect(valor(bloco(modelo, "TRIBUTAÇÃO IBS / CBS"), "CST / cClassTrib")).toBe("000 / 000001");
    expect(valor(bloco(modelo, "TRIBUTAÇÃO IBS / CBS"), "Valor Total Apurado - CBS")).toBe("R$ 8,55");
    expect(valor(bloco(modelo, "VALOR TOTAL DA NFS-E"), "Total do IBS/CBS")).toBe("R$ 9,50");
    expect(campos(bloco(modelo, "VALOR TOTAL DA NFS-E")).find((campo) => campo.rotulo === "Valor Líquido da NFS-e + IBS/CBS")).toMatchObject({ valor: "R$ 1.009,50", destaque: true });
    expect(modelo?.identificacao.flat().find((campo) => campo.rotulo === "FINALIDADE")?.valor).toBe("NFS-e regular");
  });

  it("informações complementares na ordem da NT, com os totais aproximados fixos", () => {
    const texto = montarDanfse(xml({ compl: true }))?.blocos.find((item) => item.tipo === "texto");
    expect(texto).toMatchObject({ texto: "Inf. Cont.: Pagamento via PIX | Doc. Ref.: REF-9 | Doc. Tec.: ART-1 | Núm. Ped.: PED-7", rodape: "Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: 13,45%; Estaduais: 0,00%; Municipais: 4,73%" });
    const reais = montarDanfse(xml({ totTrib: "<vTotTrib><vTotTribFed>20.18</vTotTribFed><vTotTribEst>0.00</vTotTribEst><vTotTribMun>7.10</vTotTribMun></vTotTrib>" }))?.blocos.find((item) => item.tipo === "texto");
    expect(reais).toMatchObject({ rodape: "Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: R$ 20,18; Estaduais: R$ 0,00; Municipais: R$ 7,10" });
  });

  it("homologação e marca d'água", () => {
    expect(montarDanfse(xml({ tpAmb: "2" }))?.cabecalho.semValidade).toBe(true);
    expect(montarDanfse(xml(), { cancelada: true })?.marcaDagua).toBe("CANCELADA");
    expect(montarDanfse(xml(), { cancelada: true, substituida: true })?.marcaDagua).toBe("SUBSTITUÍDA");
  });

  it("XML que não é NFS-e não monta DANFSe", () => {
    expect(montarDanfse("<evento/>")).toBeNull();
    expect(montarDanfse("não é xml <<<")).toBeNull();
  });
});

describe("PDF do DANFSe", () => {
  it("gera um PDF de uma página, mesmo com descrição enorme e caracteres fora do WinAnsi", async () => {
    const enorme = xml({ ibsCbs: true, interm: true, dest: true, compl: true }).replace("1 SERVIÇOS CONTÁBEIS N/MÊS", `${"Serviço muito detalhado 😀 ".repeat(80)}`);
    const pdf = await gerarDanfsePdf(montarDanfse(enorme, { substituida: true })!);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });
});
