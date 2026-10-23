import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { eCancelamento, lerRespostaDistribuicao, resumirItem } from "@/lib/nfse/distribution/parse";

const EMPRESA = "11222333000181";

function nfse(input: { emitente: string; tomador?: string; intermediario?: string }) {
  return `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS33045572211222333000181000000000000126010000000001">
<xLocEmi>Rio de Janeiro</xLocEmi><nNFSe>123</nNFSe><dhProc>2026-01-20T02:16:30-03:00</dhProc>
<emit><CNPJ>${input.emitente}</CNPJ><xNome>Prestador Ltda</xNome><enderNac><xLgr>Rua A</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>3304557</cMun><UF>RJ</UF><CEP>20000000</CEP></enderNac></emit>
<valores><vLiq>950.00</vLiq><vISSQN>50.00</vISSQN></valores>
<DPS versao="1.01"><infDPS><dCompet>2026-01-15</dCompet>
${input.tomador ? `<toma><CNPJ>${input.tomador}</CNPJ><xNome>Tomador SA</xNome></toma>` : ""}
${input.intermediario ? `<interm><CNPJ>${input.intermediario}</CNPJ><xNome>Interm</xNome></interm>` : ""}
<serv><cServ><cTribNac>171901</cTribNac><xDescServ>Contabilidade</xDescServ></cServ></serv>
<valores><vServPrest><vServ>1000.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>2</tpRetISSQN></tribMun></trib></valores>
</infDPS></DPS></infNFSe></NFSe>`;
}

const item = (xml: string, extra: Record<string, unknown> = {}) => ({
  NSU: 7, ChaveAcesso: "33045572211222333000181000000000000126010000000001", TipoDocumento: "NFSE", ArquivoXml: gzipSync(Buffer.from(xml)).toString("base64"), DataHoraGeracao: "2026-01-20T02:16:30.81", ...extra,
});

describe("lote da distribuição do ADN", () => {
  it("lê o formato real (status + LoteDFe)", () => {
    const corpo = JSON.stringify({ StatusProcessamento: "DOCUMENTOS_LOCALIZADOS", LoteDFe: [item(nfse({ emitente: "1", tomador: EMPRESA }))], Alertas: [], Erros: [], TipoAmbiente: "PRODUCAO" });
    const resposta = lerRespostaDistribuicao(corpo);
    expect(resposta?.status).toBe("DOCUMENTOS_LOCALIZADOS");
    expect(resposta?.itens).toHaveLength(1);
    expect(resposta?.erros).toBeNull();
  });

  it("sem documentos e rejeição", () => {
    expect(lerRespostaDistribuicao(JSON.stringify({ StatusProcessamento: "NENHUM_DOCUMENTO_LOCALIZADO", LoteDFe: null }))?.status).toBe("NENHUM_DOCUMENTO_LOCALIZADO");
    const rejeicao = lerRespostaDistribuicao(JSON.stringify({ StatusProcessamento: "REJEICAO", Erros: [{ Codigo: "E1", Descricao: "x" }] }));
    expect(rejeicao?.status).toBe("REJEICAO");
    expect(rejeicao?.erros).toContain("E1");
    expect(lerRespostaDistribuicao("<html>")).toBeNull();
  });
});

describe("resumo de cada documento", () => {
  it("nota recebida: empresa tomadora, com valores em centavos e ISS retido", () => {
    const linha = resumirItem(item(nfse({ emitente: "99888777000166", tomador: EMPRESA })), EMPRESA);
    expect(linha).toMatchObject({
      role: "TOMADOR", nsu: 7, document_type: "NFSE", nfse_number: "123", competence: "2026-01-15", issuer_tax_id: "99888777000166", issuer_name: "Prestador Ltda",
      issuer_municipality_code: "3304557", customer_tax_id: EMPRESA, national_tax_code: "171901", amount_cents: 100000, net_cents: 95000, iss_cents: 5000, iss_withheld: true,
      generated_at: "2026-01-20T02:16:30.81-03:00",
    });
    expect(linha.xml).toContain("<nNFSe>123</nNFSe>");
  });

  it("nota emitida pela própria empresa fica como PRESTADOR (não aparece em Recebidas)", () => {
    expect(resumirItem(item(nfse({ emitente: EMPRESA, tomador: "99888777000166" })), EMPRESA).role).toBe("PRESTADOR");
  });

  it("empresa intermediária", () => {
    expect(resumirItem(item(nfse({ emitente: "99888777000166", tomador: "55444333000122", intermediario: EMPRESA })), EMPRESA).role).toBe("INTERMEDIARIO");
  });

  it("evento de cancelamento guarda só o tipo e a chave da nota", () => {
    const evento = resumirItem(item("<evento><infEvento/></evento>", { TipoDocumento: "EVENTO", TipoEvento: "CANCELAMENTO" }), EMPRESA);
    expect(evento).toMatchObject({ role: "OUTRO", document_type: "EVENTO", event_type: "CANCELAMENTO" });
    expect(eCancelamento(evento)).toBe(true);
    expect(eCancelamento({ document_type: "NFSE", event_type: null })).toBe(false);
  });
});
