import { describe, expect, it } from "vitest";
import { lerNfseOficial } from "@/lib/contribuinte/nfse-oficial";
import { passoLiberado, validarCancelamento, validarMotivoSubstituicao } from "@/lib/contribuinte/dps";

const XML = `<?xml version="1.0" encoding="utf-8"?><NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS33045572240241895000170000000000000126106849781234">
<xLocEmi>Rio de Janeiro</xLocEmi><xLocPrestacao>Rio de Janeiro</xLocPrestacao><nNFSe>126</nNFSe><cLocIncid>3304557</cLocIncid><xLocIncid>Rio de Janeiro</xLocIncid>
<xTribNac>Contabilidade, inclusive serviços técnicos e auxiliares.</xTribNac><xNBS>Serviços de contabilidade</xNBS><verAplic>SefinNac_1.6</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><procEmi>1</procEmi><cStat>100</cStat>
<dhProc>2026-10-20T12:00:01-03:00</dhProc><nDFSe>1</nDFSe>
<emit><CNPJ>40241895000170</CNPJ><IM>01910680</IM><xNome>MOREIRA &amp; CASTRO</xNome><enderNac><xLgr>Av. Rio Branco</xLgr><nro>99</nro><xBairro>Centro</xBairro><cMun>3304557</cMun><UF>RJ</UF><CEP>20040004</CEP></enderNac><email>a@b.com</email></emit>
<valores><vBC>100.00</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>2.00</vISSQN><vTotalRet>0.00</vTotalRet><vLiq>100.00</vLiq></valores>
<DPS versao="1.01"><infDPS Id="DPS1"><tpAmb>2</tpAmb><dhEmi>2026-10-20T11:59:00-03:00</dhEmi><verAplic>FISCALMC_0.1</verAplic><serie>00001</serie><nDPS>7</nDPS><dCompet>2026-10-20</dCompet><tpEmit>1</tpEmit><cLocEmi>3304557</cLocEmi>
<subst><chSubstda>33045572240241895000170000000000000125106849781234</chSubstda><cMotivo>99</cMotivo></subst>
<prest><CNPJ>40241895000170</CNPJ><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest>
<toma><CNPJ>68644533000140</CNPJ><xNome>ORLA RIO</xNome><end><endNac><cMun>3304557</cMun><CEP>22610141</CEP></endNac><xLgr>Do Joá</xLgr><nro>3336</nro><xBairro>Barra</xBairro></end></toma>
<serv><locPrest><cLocPrestacao>3304557</cLocPrestacao></locPrest><cServ><cTribNac>171901</cTribNac><cTribMun>001</cTribMun><xDescServ>Honorários de outubro</xDescServ><cNBS>113022100</cNBS></cServ></serv>
<valores><vServPrest><vServ>100.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun></trib></valores></infDPS></DPS></infNFSe></NFSe>`;

describe("XML oficial da NFS-e", () => {
  it("lê identificação, pessoas, serviço e valores", () => {
    const nota = lerNfseOficial(XML)!;
    expect(nota.numero).toBe("126");
    expect(nota.situacao).toBe("100");
    expect(nota.emitente).toMatchObject({ documento: "40241895000170", nome: "MOREIRA & CASTRO", inscricaoMunicipal: "01910680" });
    expect(nota.emitente.endereco).toMatchObject({ logradouro: "Av. Rio Branco", municipio: "3304557", uf: "RJ", cep: "20040004" });
    expect(nota.tomador).toMatchObject({ documento: "68644533000140", nome: "ORLA RIO" });
    expect(nota.tomador?.endereco).toMatchObject({ logradouro: "Do Joá", municipio: "3304557", cep: "22610141" });
    expect(nota.dps).toMatchObject({ serie: "00001", numero: "7", competencia: "2026-10-20", versao: "1.01" });
    expect(nota.servico).toMatchObject({ codigoNacional: "171901", descricao: "Honorários de outubro", nbs: "113022100" });
    expect(nota.valores).toEqual({ servico: 10000, baseCalculo: 10000, aliquotaAplicada: "2.00", issqn: 200, totalRetido: 0, liquido: 10000 });
    expect(nota.substituida).toBe("33045572240241895000170000000000000125106849781234");
    expect(nota.regime.opcaoSimples).toBe("3");
  });
  it("XML inválido ou de outro tipo devolve null", () => {
    expect(lerNfseOficial("<x>")).toBeNull();
    expect(lerNfseOficial("<evento/>")).toBeNull();
  });
});

describe("motivos", () => {
  it("cancelamento: código 1/2/9 e descrição de 15 a 255", () => {
    expect(validarCancelamento({ codigo: "1", motivo: "  Valor   errado na emissão " })).toEqual({ ok: true, valor: { codigo: "1", motivo: "Valor errado na emissão" } });
    const ruim = validarCancelamento({ codigo: "3", motivo: "curto" });
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(Object.keys(ruim.erros).sort()).toEqual(["codigo", "motivo"]);
  });
  it("substituição: descrição obrigatória só em 99 - Outros", () => {
    expect(validarMotivoSubstituicao({ codigo: "01", motivo: "" })).toEqual({ ok: true, valor: { motivoCodigo: "01" } });
    expect(validarMotivoSubstituicao({ codigo: "99", motivo: "" }).ok).toBe(false);
    expect(validarMotivoSubstituicao({ codigo: "99", motivo: "Correção da descrição do serviço" }).ok).toBe(true);
  });
  it("rascunho de substituição só libera o passo 4 com o motivo", () => {
    const base = { competencia: "2026-10-20", tomador: { clienteId: "c", documento: null, nome: "T" }, servico: { modeloId: "s", descricao: "abc" }, valores: { valorCentavos: 100 } };
    const subst = { notaId: "n", chave: "1".repeat(50), numero: "1", competencia: "2026-10-20", valorCentavos: 100 };
    expect(passoLiberado({ ...base, substituicao: subst })).toBe(3);
    expect(passoLiberado({ ...base, substituicao: { ...subst, motivoCodigo: "01" } })).toBe(4);
  });
});
