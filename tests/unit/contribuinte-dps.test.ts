import { describe, expect, it } from "vitest";
import { regimeFederal, validarIbsCbs } from "@/lib/contribuinte/dps";
import { ibsCbsObrigatorio } from "@/lib/nfse/ibs-cbs";
import { aliquotaEmPontosBase, centavosParaTexto, mascaraValor, passoLiberado, passoPorSlug, previaValores, validarComercioExterior, validarComplemento, validarIntermediario, validarNovoTomador, validarPessoas, validarServico, validarTomadorExterior, validarValores, valorEmCentavos } from "@/lib/contribuinte/dps";
import { extrasDoRascunho, rascunhoDosExtras } from "@/lib/contribuinte/extras-dps";

describe("valores em reais", () => {
  it("máscara enquanto digita", () => {
    expect(mascaraValor("1")).toBe("0,01");
    expect(mascaraValor("123456")).toBe("1.234,56");
    expect(mascaraValor("R$ 0010000")).toBe("100,00");
    expect(mascaraValor("")).toBe("");
  });
  it("texto → centavos", () => {
    expect(valorEmCentavos("1.234,56")).toBe(123456);
    expect(valorEmCentavos("100")).toBe(10000);
    expect(valorEmCentavos("100,5")).toBe(10050);
    expect(valorEmCentavos("0,00")).toBeNull();
    expect(valorEmCentavos("abc")).toBeNull();
    expect(centavosParaTexto(10000)).toBe("100,00");
  });
  it("alíquota em pontos-base", () => {
    expect(aliquotaEmPontosBase("2,5")).toBe(250);
    expect(aliquotaEmPontosBase("5%")).toBe(500);
    expect(aliquotaEmPontosBase("101")).toBeNull();
    expect(aliquotaEmPontosBase("x")).toBeNull();
  });
});

describe("validação dos passos", () => {
  it("Pessoas: competência obrigatória e não futura; tomador obrigatório", () => {
    const vazio = validarPessoas({ competencia: "", clienteId: "", hoje: "2026-10-20" });
    expect(vazio.ok).toBe(false);
    if (!vazio.ok) expect(vazio.erros).toEqual({ competencia: "Campo obrigatório", tomador: expect.any(String) });
    const futura = validarPessoas({ competencia: "2026-10-21", clienteId: "x", hoje: "2026-10-20" });
    expect(futura.ok).toBe(false);
    expect(validarPessoas({ competencia: "2026-10-20", clienteId: "x", hoje: "2026-10-20" }).ok).toBe(true);
  });
  it("tomador novo: CPF/CNPJ válido e nome", () => {
    const ok = validarNovoTomador({ documento: "00.000.000/0001-91", nome: " Banco ", email: "" });
    expect(ok).toEqual({ ok: true, valor: { documento: "00000000000191", nome: "Banco", email: null, tipo: "COMPANY" } });
    const ruim = validarNovoTomador({ documento: "11.111.111/1111-11", nome: "", email: "x@" });
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(Object.keys(ruim.erros).sort()).toEqual(["documento", "email", "nome"]);
  });
  it("Serviço: serviço e descrição (3 a 1000)", () => {
    expect(validarServico({ modeloId: "", descricao: "ab" }).ok).toBe(false);
    expect(validarServico({ modeloId: "s", descricao: "x".repeat(1001) }).ok).toBe(false);
    expect(validarServico({ modeloId: "s", descricao: "  Honorários contábeis  " })).toEqual({ ok: true, valor: { modeloId: "s", descricao: "Honorários contábeis" } });
  });
  it("Valores: alíquota e fonte só quando o escritório precisa informar", () => {
    expect(validarValores({ valor: "100,00", aliquota: "", fonte: "", exigeAliquota: false })).toEqual({ ok: true, valor: { valorCentavos: 10000 } });
    const falta = validarValores({ valor: "100,00", aliquota: "", fonte: "", exigeAliquota: true });
    expect(falta.ok).toBe(false);
    expect(validarValores({ valor: "100,00", aliquota: "2", fonte: "Lei municipal 123", exigeAliquota: true }))
      .toEqual({ ok: true, valor: { valorCentavos: 10000, aliquotaManualBp: 200, fonteAliquota: "Lei municipal 123" } });
  });
});

describe("fluxo", () => {
  it("cada passo exige os anteriores", () => {
    expect(passoLiberado({})).toBe(1);
    const t = { clienteId: "c", documento: null, nome: "T" };
    expect(passoLiberado({ competencia: "2026-10-20", tomador: t })).toBe(2);
    expect(passoLiberado({ competencia: "2026-10-20", tomador: t, servico: { modeloId: "s", descricao: "abc" } })).toBe(3);
    expect(passoLiberado({ competencia: "2026-10-20", tomador: t, servico: { modeloId: "s", descricao: "abc" }, valores: { valorCentavos: 1 } })).toBe(4);
    expect(passoPorSlug("valores")?.numero).toBe(3);
    expect(passoPorSlug("x")).toBeNull();
  });
  it("prévia: ISSQN e líquido (retido desconta)", () => {
    expect(previaValores({ valorCentavos: 10000, aliquotaBp: 200, retido: false })).toMatchObject({ base: 10000, issqn: 200, retido: 0, liquido: 10000 });
    expect(previaValores({ valorCentavos: 10000, aliquotaBp: 500, retido: true })).toMatchObject({ base: 10000, issqn: 500, retido: 500, liquido: 9500 });
    expect(previaValores({ valorCentavos: 10000, retido: true }).issqn).toBeNull();
  });
  it("prévia bate com a SEFIN da restrita: descontos e retenções federais", () => {
    // Nota A (21/10/2026): 1.000,00 com 10,00 incondicionado e 5,00 condicionado → vLiq 985,00.
    expect(previaValores({ valorCentavos: 100000, retido: false, descIncondCentavos: 1000, descCondCentavos: 500 })).toMatchObject({ base: 99000, liquido: 98500 });
    // Nota B: IRRF 14,85 + CS 9,90 → vTotalRet 24,75 e vLiq 975,25; o PIS/COFINS do piscofins é débito e não desconta.
    const b = previaValores({ valorCentavos: 100000, retido: false, federal: { cst: "01", baseCentavos: 99000, pisBp: 65, cofinsBp: 300, retencaoPisCofins: "3", irrfCentavos: 1485, csCentavos: 990 } });
    expect(b).toMatchObject({ retido: 2475, liquido: 97525, debitos: { pis: 644, cofins: 2970 } });
  });
});

describe("campos novos da DPS no rascunho", () => {
  const exterior = { nifInformado: "SIM", nif: "987654321", motivo: "", nome: "ACME LLC", email: "", pais: "US", logradouro: "Main Street", numero: "100", complemento: "", bairro: "Downtown", cidade: "New York", cep: "10001", estado: "NY" };
  it("tomador no exterior: NIF ou motivo, país válido e endereço completo", () => {
    expect(validarTomadorExterior(exterior, ["US"])).toMatchObject({ ok: true, valor: { nif: "987654321", motivo: null, pais: "US" } });
    expect(validarTomadorExterior({ ...exterior, nifInformado: "NAO", motivo: "2" }, ["US"])).toMatchObject({ ok: true, valor: { nif: null, motivo: "2" } });
    expect(validarTomadorExterior({ ...exterior, nifInformado: "NAO" }, ["US"])).toMatchObject({ ok: false, erros: { motivo: "Campo obrigatório" } });
    expect(validarTomadorExterior({ ...exterior, pais: "BR", cidade: "" }, ["US", "BR"])).toMatchObject({ ok: false, erros: { pais: "Campo obrigatório", cidade: "Campo obrigatório" } });
  });
  it("intermediário com erros prefixados", () => {
    expect(validarIntermediario({ documento: "00.000.000/0001-91", nome: "BANCO DO BRASIL SA", email: "" })).toEqual({ ok: true, valor: { documento: "00000000000191", nome: "BANCO DO BRASIL SA" } });
    expect(validarIntermediario({ documento: "123", nome: "", email: "" })).toMatchObject({ ok: false, erros: { intermDocumento: "CPF/CNPJ inválido", intermNome: "Campo obrigatório" } });
  });
  it("informações complementares opcionais, com limites do leiaute", () => {
    expect(validarComplemento({ docTecnico: "", docReferencia: "", pedido: "", informacoes: "  " })).toEqual({ ok: true, valor: undefined });
    expect(validarComplemento({ docTecnico: "", docReferencia: "", pedido: "OS 7", informacoes: "Ref. outubro" })).toEqual({ ok: true, valor: { pedido: "OS 7", informacoes: "Ref. outubro" } });
    expect(validarComplemento({ docTecnico: "x".repeat(41), docReferencia: "", pedido: "", informacoes: "" }).ok).toBe(false);
  });
  it("comércio exterior: DI/RE só quando há movimentação temporária de bens", () => {
    const base = { modo: "1", vinculo: "0", moeda: "220", valorMoeda: "180,00", mecPrestador: "01", mecTomador: "01", movTempBens: "1", nDI: "", nRE: "", mdic: "0" };
    expect(validarComercioExterior(base)).toEqual({ ok: true, valor: { modo: "1", vinculo: "0", moeda: "220", valorMoedaCentavos: 18000, mecPrestador: "01", mecTomador: "01", movTempBens: "1", mdic: "0" } });
    expect(validarComercioExterior({ ...base, movTempBens: "2" })).toMatchObject({ ok: false, erros: { nDI: "Campo obrigatório" } });
  });
  it("valores: descontos menores que o serviço; federal só quando informado", () => {
    const federal = { cst: "00", base: "", pis: "", cofins: "", retencao: "", irrf: "", cs: "", cp: "" };
    expect(validarValores({ valor: "100,00", aliquota: "", fonte: "", exigeAliquota: false, descIncond: "", descCond: "0,00", federal })).toEqual({ ok: true, valor: { valorCentavos: 10000 } });
    expect(validarValores({ valor: "100,00", aliquota: "", fonte: "", exigeAliquota: false, descIncond: "60,00", descCond: "40,00", federal }).ok).toBe(false);
    expect(validarValores({ valor: "1.000,00", aliquota: "", fonte: "", exigeAliquota: false, federal: { ...federal, irrf: "15,00" } })).toEqual({ ok: true, valor: { valorCentavos: 100000, federal: { cst: "00", irrfCentavos: 1500 } } });
    expect(validarValores({ valor: "1.000,00", aliquota: "", fonte: "", exigeAliquota: false, federal: { ...federal, cst: "01", base: "1.000,00", pis: "0,65", cofins: "3" } })).toMatchObject({ ok: false, erros: { retencao: "Campo obrigatório" } });
  });
  it("tomador no exterior só libera o passo 3 com o comércio exterior", () => {
    const dados = { competencia: "2026-10-20", tomador: { clienteId: "c", documento: null, nome: "ACME", exterior: true }, servico: { modeloId: "s", descricao: "abc" } };
    expect(passoLiberado(dados)).toBe(2);
    expect(passoLiberado({ ...dados, comercioExterior: { modo: "1", vinculo: "0", moeda: "220", valorMoedaCentavos: 1, mecPrestador: "01", mecTomador: "01", movTempBens: "1", mdic: "0" } })).toBe(3);
  });
  it("extras do pedido: só o preenchido, comércio exterior só com tomador no exterior", () => {
    const comercioExterior = { modo: "1", vinculo: "0", moeda: "220", valorMoedaCentavos: 18000, mecPrestador: "01", mecTomador: "01", movTempBens: "1", mdic: "0" as const };
    expect(extrasDoRascunho({ valores: { valorCentavos: 100 } }, false)).toEqual({});
    expect(extrasDoRascunho({ comercioExterior }, false)).toEqual({});
    expect(extrasDoRascunho({
      intermediario: { documento: "00000000000191", nome: "BB" }, complemento: { informacoes: "Ref." }, comercioExterior,
      valores: { valorCentavos: 100000, descIncondCentavos: 1000, federal: { cst: "01", baseCentavos: 99000, pisBp: 65, cofinsBp: 300, retencaoPisCofins: "3", irrfCentavos: 1485, csCentavos: 990 } },
    }, true).extras).toEqual({
      intermediary: { taxId: "00000000000191", name: "BB" }, complement: { text: "Ref." },
      foreignTrade: { mode: "1", relationship: "0", currencyCode: "220", amountInCurrencyCents: 18000, providerSupport: "01", customerSupport: "01", temporaryGoods: "1", shareWithMdic: "0" },
      values: { unconditionalDiscountCents: 1000 },
      federal: { pisCofins: { cst: "01", baseCents: 99000, pisBasisPoints: 65, cofinsBasisPoints: 300, pisCents: 644, cofinsCents: 2970, retention: "3" }, irrfCents: 1485, csllCents: 990 },
    });
  });
});

describe("IBS/CBS no rascunho", () => {
  it("obrigatório desde 10/2026 na restrita e 01/2027 em produção", () => {
    expect(ibsCbsObrigatorio("PRODUCTION_RESTRICTED", "2026-10-01")).toBe(true);
    expect(ibsCbsObrigatorio("PRODUCTION_RESTRICTED", "2026-09-30")).toBe(false);
    expect(ibsCbsObrigatorio("PRODUCTION", "2026-12-31")).toBe(false);
    expect(ibsCbsObrigatorio("PRODUCTION", "2027-01-01")).toBe(true);
  });
  it("valida CST, classificação e indicador da tabela oficial", () => {
    expect(validarIbsCbs({ cst: "000", classificacao: "000.001", indicadorOperacao: "100301", consumoPessoal: "0" }, ["100301"])).toEqual({ ok: true, valor: { cst: "000", classificacao: "000001", indicadorOperacao: "100301", consumoPessoal: "0" } });
    const ruim = validarIbsCbs({ cst: "0", classificacao: "1", indicadorOperacao: "999999", consumoPessoal: "x" }, ["100301"]);
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(Object.keys(ruim.erros).sort()).toEqual(["classificacao", "cst", "indicadorOperacao"]);
  });
  it("com IBS/CBS marcado, o passo 3 só libera depois de informar a classificação", () => {
    const base = { competencia: "2026-10-20", semTomador: true, informarIbsCbs: true, servico: { modeloId: "s", descricao: "abc" } };
    expect(passoLiberado(base)).toBe(2);
    expect(passoLiberado({ ...base, ibsCbs: { cst: "000", classificacao: "000001", indicadorOperacao: "100301", consumoPessoal: "0" } })).toBe(3);
  });
});

describe("substituição herda os extras da original", () => {
  it("ida e volta: extras do pedido → rascunho → extras", () => {
    const dados = {
      intermediario: { documento: "00000000000191", nome: "BB", email: "a@b.co" }, complemento: { docTecnico: "ART1", informacoes: "Ref." },
      comercioExterior: { modo: "2", vinculo: "1", moeda: "978", valorMoedaCentavos: 500, mecPrestador: "01", mecTomador: "02", movTempBens: "2", nDI: "123", mdic: "1" as const },
      valores: { valorCentavos: 100000, descCondCentavos: 300, federal: { cst: "01", baseCentavos: 100000, pisBp: 65, cofinsBp: 300, retencaoPisCofins: "1", cpCentavos: 1100 } },
    };
    const extras = extrasDoRascunho(dados, true).extras;
    expect(rascunhoDosExtras(extras, 100000)).toEqual(dados);
    expect(rascunhoDosExtras(null, 500)).toEqual({ valores: { valorCentavos: 500 } });
  });
});

describe("PIS/COFINS pelo regime da empresa", () => {
  const federal = (cst: string, pis = "0,65", cofins = "3,00") => ({ cst, base: "1000,00", pis, cofins, retencao: "0", irrf: "", cs: "", cp: "" });
  it("regime decide o bloco federal", () => {
    expect(regimeFederal(true, null)).toBe("simples");
    expect(regimeFederal(false, "SIMPLES_NACIONAL")).toBe("simples");
    expect(regimeFederal(false, "LUCRO_PRESUMIDO")).toBe("presumido");
    expect(regimeFederal(false, "LUCRO_REAL")).toBe("real");
    expect(regimeFederal(false, null)).toBeNull();
  });
  it("CST sem débito leva só o CST e a retenção", () => {
    expect(validarValores({ valor: "1000,00", aliquota: "", fonte: "", exigeAliquota: false, federal: federal("08") }))
      .toEqual({ ok: true, valor: { valorCentavos: 100000, federal: { cst: "08", retencaoPisCofins: "0" } } });
  });
  it("CST com débito não aceita alíquota zero", () => {
    expect(validarValores({ valor: "1000,00", aliquota: "", fonte: "", exigeAliquota: false, federal: federal("01", "0", "3,00") }).ok).toBe(false);
    expect(validarValores({ valor: "1000,00", aliquota: "", fonte: "", exigeAliquota: false, federal: federal("01") }).ok).toBe(true);
  });
  it("CST sem débito vai para a DPS sem base nem valores", () => {
    const { extras } = extrasDoRascunho({ valores: { valorCentavos: 100000, federal: { cst: "08", retencaoPisCofins: "0" } } }, false);
    expect(extras?.federal?.pisCofins).toEqual({ cst: "08", retention: "0" });
  });
});

