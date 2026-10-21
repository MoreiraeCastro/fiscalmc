// Rascunho do Portal Contribuinte → grupos opcionais da DPS no pedido de emissão (campo "extras" de POST /api/invoices).
import { debitosPisCofins, type DadosRascunho } from "./dps";

export type ExtrasDps = {
  intermediary?: { taxId: string; name: string; email?: string };
  complement?: { technicalDocument?: string; referenceDocument?: string; purchaseOrder?: string; text?: string };
  foreignTrade?: { mode: string; relationship: string; currencyCode: string; amountInCurrencyCents: number; providerSupport: string; customerSupport: string; temporaryGoods: string; importDeclaration?: string; exportRegistration?: string; shareWithMdic: "0" | "1" };
  values?: { unconditionalDiscountCents?: number; conditionalDiscountCents?: number };
  federal?: { pisCofins?: { cst: string; baseCents: number; pisBasisPoints: number; cofinsBasisPoints: number; pisCents: number; cofinsCents: number; retention?: string }; socialSecurityCents?: number; irrfCents?: number; csllCents?: number };
};

/** Caminho de volta (substituição): os extras gravados na nota original preenchem o rascunho da substituta. */
export function rascunhoDosExtras(extras: ExtrasDps | null | undefined, valorCentavos: number): Pick<DadosRascunho, "intermediario" | "complemento" | "comercioExterior" | "valores"> {
  if (!extras) return { valores: { valorCentavos } };
  const { intermediary: i, complement: c, foreignTrade: x, values: v, federal: f } = extras;
  return {
    ...(i ? { intermediario: { documento: i.taxId, nome: i.name, ...(i.email ? { email: i.email } : {}) } } : {}),
    ...(c ? { complemento: { ...(c.technicalDocument ? { docTecnico: c.technicalDocument } : {}), ...(c.referenceDocument ? { docReferencia: c.referenceDocument } : {}), ...(c.purchaseOrder ? { pedido: c.purchaseOrder } : {}), ...(c.text ? { informacoes: c.text } : {}) } } : {}),
    ...(x ? { comercioExterior: { modo: x.mode, vinculo: x.relationship, moeda: x.currencyCode, valorMoedaCentavos: x.amountInCurrencyCents, mecPrestador: x.providerSupport, mecTomador: x.customerSupport, movTempBens: x.temporaryGoods, ...(x.importDeclaration ? { nDI: x.importDeclaration } : {}), ...(x.exportRegistration ? { nRE: x.exportRegistration } : {}), mdic: x.shareWithMdic } } : {}),
    valores: {
      valorCentavos,
      ...(v?.unconditionalDiscountCents ? { descIncondCentavos: v.unconditionalDiscountCents } : {}),
      ...(v?.conditionalDiscountCents ? { descCondCentavos: v.conditionalDiscountCents } : {}),
      ...(f ? { federal: {
        cst: f.pisCofins?.cst ?? "00",
        ...(f.pisCofins ? { baseCentavos: f.pisCofins.baseCents, pisBp: f.pisCofins.pisBasisPoints, cofinsBp: f.pisCofins.cofinsBasisPoints, ...(f.pisCofins.retention ? { retencaoPisCofins: f.pisCofins.retention } : {}) } : {}),
        ...(f.irrfCents ? { irrfCentavos: f.irrfCents } : {}), ...(f.csllCents ? { csCentavos: f.csllCents } : {}), ...(f.socialSecurityCents ? { cpCentavos: f.socialSecurityCents } : {}),
      } } : {}),
    },
  };
}

/** Monta os extras só com o que foi preenchido; o comércio exterior vai apenas com tomador no exterior. */
export function extrasDoRascunho(dados: DadosRascunho, tomadorExterior: boolean): { extras?: ExtrasDps } {
  const extras: ExtrasDps = {};
  const i = dados.intermediario;
  if (i) extras.intermediary = { taxId: i.documento, name: i.nome, ...(i.email ? { email: i.email } : {}) };
  const c = dados.complemento;
  if (c && (c.docTecnico || c.docReferencia || c.pedido || c.informacoes)) {
    extras.complement = { ...(c.docTecnico ? { technicalDocument: c.docTecnico } : {}), ...(c.docReferencia ? { referenceDocument: c.docReferencia } : {}), ...(c.pedido ? { purchaseOrder: c.pedido } : {}), ...(c.informacoes ? { text: c.informacoes } : {}) };
  }
  const x = tomadorExterior ? dados.comercioExterior : undefined;
  if (x) {
    extras.foreignTrade = {
      mode: x.modo, relationship: x.vinculo, currencyCode: x.moeda, amountInCurrencyCents: x.valorMoedaCentavos, providerSupport: x.mecPrestador, customerSupport: x.mecTomador,
      temporaryGoods: x.movTempBens, ...(x.nDI ? { importDeclaration: x.nDI } : {}), ...(x.nRE ? { exportRegistration: x.nRE } : {}), shareWithMdic: x.mdic,
    };
  }
  const v = dados.valores;
  if (v?.descIncondCentavos || v?.descCondCentavos) extras.values = { ...(v.descIncondCentavos ? { unconditionalDiscountCents: v.descIncondCentavos } : {}), ...(v.descCondCentavos ? { conditionalDiscountCents: v.descCondCentavos } : {}) };
  const f = v?.federal;
  if (f) {
    const pisCofins = f.cst !== "00" && f.baseCentavos !== undefined && f.pisBp !== undefined && f.cofinsBp !== undefined
      ? (() => { const debitos = debitosPisCofins(f); return { cst: f.cst, baseCents: f.baseCentavos!, pisBasisPoints: f.pisBp!, cofinsBasisPoints: f.cofinsBp!, pisCents: debitos.pis, cofinsCents: debitos.cofins, ...(f.retencaoPisCofins ? { retention: f.retencaoPisCofins } : {}) }; })()
      : undefined;
    const federal = { ...(pisCofins ? { pisCofins } : {}), ...(f.cpCentavos ? { socialSecurityCents: f.cpCentavos } : {}), ...(f.irrfCentavos ? { irrfCents: f.irrfCentavos } : {}), ...(f.csCentavos ? { csllCents: f.csCentavos } : {}) };
    if (Object.keys(federal).length) extras.federal = federal;
  }
  return Object.keys(extras).length ? { extras } : {};
}
