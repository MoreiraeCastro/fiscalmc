import { describe, expect, it } from "vitest";
import { intervaloDoPeriodo, linhaCompleta } from "@/lib/contribuinte/relacao-notas";

/** Nota de R$ 10.000 com ISS retido pelo tomador, IRRF, INSS e PIS/COFINS/CSLL retidos. */
function xml(opcoes: { tpRetISSQN?: string; vLiq?: string | null } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS33045572240241895000170000000000048726107479028174">
<xLocEmi>Rio de Janeiro</xLocEmi><nNFSe>91</nNFSe><cStat>100</cStat><dhProc>2026-10-24T02:02:21-03:00</dhProc>
<emit><CNPJ>40241895000170</CNPJ><xNome>PRESTADOR LTDA</xNome><enderNac><cMun>3304557</cMun><UF>RJ</UF></enderNac></emit>
<valores><vBC>10000.00</vBC><pAliqAplic>5.00</pAliqAplic><vISSQN>500.00</vISSQN>${opcoes.vLiq === null ? "" : `<vLiq>${opcoes.vLiq ?? "8434.50"}</vLiq>`}</valores>
<DPS versao="1.01"><infDPS Id="DPS1"><dCompet>2026-10-24</dCompet>
<prest><CNPJ>40241895000170</CNPJ><regTrib><opSimpNac>1</opSimpNac></regTrib></prest>
<toma><CNPJ>65925173000166</CNPJ><xNome>TOMADOR SA</xNome></toma>
<serv><cServ><cTribNac>171901</cTribNac><xDescServ>Serviço</xDescServ></cServ></serv>
<valores><vServPrest><vServ>10000.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>${opcoes.tpRetISSQN ?? "2"}</tpRetISSQN></tribMun>
<tribFed><piscofins><CST>01</CST><tpRetPisCofins>3</tpRetPisCofins></piscofins><vRetCP>450.00</vRetCP><vRetIRRF>150.00</vRetIRRF><vRetCSLL>465.50</vRetCSLL></tribFed></trib></valores>
</infDPS></DPS></infNFSe></NFSe>`;
}

describe("relação com retenções", () => {
  it("separa cada retenção, soma o total e usa o líquido da nota", () => {
    const v = linhaCompleta(xml(), [])!.valores;
    expect(v["ISSQN Retido (R$)"]).toBe(500);
    expect(v["IRRF Retido (R$)"]).toBe(150);
    expect(v["INSS Retido (R$)"]).toBe(450);
    expect(v["PIS/COFINS/CSLL Retidos (R$)"]).toBe(465.5);
    expect(v["Total Retido (R$)"]).toBe(1565.5);
    expect(v["Valor Líquido (R$)"]).toBe(8434.5);
    expect(v["Retenção ISSQN"]).toBe("2 - Retido pelo Tomador");
  });

  it("ISS não retido não entra no retido", () => {
    const v = linhaCompleta(xml({ tpRetISSQN: "1" }), [])!.valores;
    expect(v["ISSQN Retido (R$)"]).toBe(0);
    expect(v["Total Retido (R$)"]).toBe(1065.5);
  });

  it("sem vLiq no XML, o líquido é o serviço menos o retido", () => {
    const v = linhaCompleta(xml({ vLiq: null }), [])!.valores;
    expect(v["Valor Líquido (R$)"]).toBe(8434.5);
  });
});

describe("período de várias competências", () => {
  it("vai do dia 1 da primeira ao último dia da última", () => {
    expect(intervaloDoPeriodo("2026-01", "2026-03")).toEqual({ de: "2026-01-01", ate: "2026-03-31" });
    expect(intervaloDoPeriodo("2024-02")).toEqual({ de: "2024-02-01", ate: "2024-02-29" });
    expect(intervaloDoPeriodo("2025-11", "2026-02")).toEqual({ de: "2025-11-01", ate: "2026-02-28" });
  });
});
