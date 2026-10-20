import forge from "node-forge";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { loadA1Material } from "@/lib/nfse/certificate/parse";
import { validateDpsXml, validateEventRequestXml } from "@/lib/nfse/dps/xsd";
import { buildDpsXml } from "@/lib/nfse/dps/xml";
import { mapToDpsModel } from "@/lib/nfse/dps/model";
import { buildFiscalDocument } from "@/lib/nfse/issuance/domain";
import { buildCancellationEventXml, prepareCancellationEvent, readSefinError, transmitCancellationEvent } from "@/lib/nfse/events/cancellation";
import { MtlsRequestError } from "@/lib/nfse/client/mtls-http-client";

const CHAVE = "33045572240241895000170000000000000126106849781234";
const base = { accessKey: CHAVE, authorTaxId: "40.241.895/0001-70", reasonCode: "1" as const, reason: "Valor do serviço informado errado na emissão", emittedAt: new Date("2026-10-20T15:00:00Z") };

function material() {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey; certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2026-01-01T00:00:00Z"); certificate.validity.notAfter = new Date("2027-01-01T00:00:00Z");
  certificate.setSubject([{ name: "commonName", value: "Teste" }, { name: "serialNumber", value: "40241895000170" }]);
  certificate.setIssuer([{ name: "commonName", value: "Emissor de teste" }]);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, certificate, "senha", { algorithm: "3des" })).getBytes(), "binary");
  return loadA1Material(p12, "senha", new Date("2026-10-20T00:00:00Z"));
}

describe("evento de cancelamento (e101101)", () => {
  it("monta o pedido no leiaute oficial e passa no XSD de produção e da restrita", async () => {
    const xml = buildCancellationEventXml({ ...base, environment: "PRODUCTION" });
    expect(xml).toContain(`<infPedReg Id="PRE${CHAVE}101101">`);
    expect(xml).toContain("<tpAmb>1</tpAmb>");
    expect(xml).toContain("<dhEvento>2026-10-20T12:00:00-03:00</dhEvento>");
    expect(xml).toContain("<CNPJAutor>40241895000170</CNPJAutor>");
    expect(xml).toContain("<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>Valor do serviço informado errado na emissão</xMotivo></e101101>");
    await expect(validateEventRequestXml(xml, "PRODUCTION")).resolves.toMatchObject({ valid: true });
    await expect(validateEventRequestXml(buildCancellationEventXml({ ...base, environment: "PRODUCTION_RESTRICTED" }), "PRODUCTION_RESTRICTED")).resolves.toMatchObject({ valid: true });
  });

  it("recusa chave, motivo e autor inválidos antes de assinar", () => {
    expect(() => buildCancellationEventXml({ ...base, environment: "PRODUCTION", accessKey: "123" })).toThrow();
    expect(() => buildCancellationEventXml({ ...base, environment: "PRODUCTION", reason: "curto" })).toThrow();
    expect(() => buildCancellationEventXml({ ...base, environment: "PRODUCTION", authorTaxId: "1" })).toThrow();
  });

  it("assina o infPedReg e o pedido assinado continua válido no XSD", async () => {
    const certificado = material();
    const prepared = await prepareCancellationEvent({ ...base, environment: "PRODUCTION_RESTRICTED", organizationId: "org", certificateProvider: { getCertificateMaterial: async () => certificado } });
    expect(prepared.signedXml).toContain("<Signature xmlns=\"http://www.w3.org/2000/09/xmldsig#\">");
    expect(prepared.signedXml.indexOf("</infPedReg>")).toBeLessThan(prepared.signedXml.indexOf("<Signature"));
    const enviado = gunzipSync(Buffer.from(prepared.payload.pedidoRegistroEventoXmlGZipB64, "base64")).toString("utf8");
    expect(enviado).toBe(prepared.signedXml);
  });
});

describe("transmissão do evento", () => {
  const http = (status: number, body: unknown) => ({ postJsonTracked: async () => ({ status, body }), requestText: async () => ({ status: 404, body: "" }) });
  const pedido = { environment: "PRODUCTION_RESTRICTED" as const, accessKey: CHAVE, organizationId: "org", payload: {} };

  it("201 = evento registrado (XML do evento descompactado)", async () => {
    const { gzipSync } = await import("node:zlib");
    const result = await transmitCancellationEvent({ ...pedido, http: http(201, { eventoXmlGZipB64: gzipSync("<evento/>").toString("base64") }) });
    expect(result).toEqual({ status: "REGISTERED", eventXml: "<evento/>" });
  });
  it("400 = recusado com o motivo da SEFIN", async () => {
    const result = await transmitCancellationEvent({ ...pedido, http: http(400, { erro: { codigo: "E0840", descricao: "Prazo de cancelamento expirado" } }) });
    expect(result).toEqual({ status: "REJECTED", code: "E0840", message: "Prazo de cancelamento expirado" });
  });
  it("erro depois de enviar = situação incerta; antes de enviar = pode tentar de novo", async () => {
    const enviado = { postJsonTracked: async () => { throw new MtlsRequestError("x", "POSSIBLY_SENT"); }, requestText: async () => ({ status: 404, body: "" }) };
    await expect(transmitCancellationEvent({ ...pedido, http: enviado })).resolves.toEqual({ status: "UNKNOWN" });
    const naoEnviado = { postJsonTracked: async () => { throw new MtlsRequestError("x", "NOT_SENT"); }, requestText: async () => ({ status: 404, body: "" }) };
    await expect(transmitCancellationEvent({ ...pedido, http: naoEnviado })).rejects.toThrow();
  });
  it("lê os dois formatos de erro", () => {
    expect(readSefinError({ erros: [{ Codigo: "E1", Descricao: "Falhou", complemento: "detalhe" }] })).toEqual({ code: "E1", message: "Falhou (detalhe)" });
    expect(readSefinError({})).toEqual({ code: "SEFIN_REJECTED", message: "Pedido recusado pela SEFIN." });
  });
});

describe("DPS de substituição (grupo subst)", () => {
  function dps(substitution?: { accessKey: string; reasonCode: "01" | "99"; reason?: string }, semTomador = false) {
    const document = buildFiscalDocument({ organization: { id: "o", taxId: "40241895000170", municipalRegistration: "01910680", municipalityCode: "3304557" }, customer: { taxId: "68644533000140", legalName: "ORLA RIO" }, service: { nationalTaxCode: "171901" }, taxConfiguration: { regime: "SIMPLES_NACIONAL", taxationType: "MUNICIPAL", iss: { withheld: false, source: "MUNICIPAL_INTEGRATION" }, ibsCbs: { customerFieldsEnabled: false } }, amountCents: 10000, serviceDate: "2026-10-20", description: "Serviços contábeis", dpsNumber: 7n, dpsSeries: "00001" });
    const model = mapToDpsModel(document, { issuer: { taxId: "40241895000170", municipalRegistration: "01910680", name: "MOREIRA", emitName: false, emitAddress: false }, ...(semTomador ? {} : { customer: { taxId: "68644533000140", name: "ORLA RIO" } }), serviceLocation: { municipalityCode: "3304557" }, dpsMunicipalTaxCode: "001", nbsCode: "113022100", fiscal: { regime: { simpleNational: "3", simpleAssessment: "1", special: "0" }, iss: { taxation: "1", withholding: "1", rateSource: "PARAMETRIZED_BY_NATIONAL" }, totalTaxes: { indicator: "0" } }, emittedAt: "2026-10-20T12:00:00-03:00", applicationVersion: "t", environment: "2", ...(substitution ? { substitution } : {}) });
    return buildDpsXml(model);
  }
  it("inclui subst logo depois de cLocEmi e passa no XSD", async () => {
    const xml = dps({ accessKey: CHAVE, reasonCode: "99", reason: "Correção da descrição do serviço prestado" });
    expect(xml).toContain(`<cLocEmi>3304557</cLocEmi><subst><chSubstda>${CHAVE}</chSubstda><cMotivo>99</cMotivo><xMotivo>Correção da descrição do serviço prestado</xMotivo></subst><prest>`);
    await expect(validateDpsXml(xml, "PRODUCTION_RESTRICTED")).resolves.toMatchObject({ valid: true });
    await expect(validateDpsXml(xml, "PRODUCTION")).resolves.toMatchObject({ valid: true });
  });
  it("Tomador/Adquirente não informado: DPS sem o grupo toma, válida no XSD", async () => {
    const xml = dps(undefined, true);
    expect(xml).not.toContain("<toma>");
    await expect(validateDpsXml(xml, "PRODUCTION")).resolves.toMatchObject({ valid: true });
  });
  it("sem substituição não muda a DPS", () => {
    expect(dps()).not.toContain("<subst>");
  });
  it("recusa chave inválida ou motivo curto", () => {
    expect(() => dps({ accessKey: "1", reasonCode: "01" })).toThrow();
    expect(() => dps({ accessKey: CHAVE, reasonCode: "99", reason: "curto" })).toThrow();
  });
});
