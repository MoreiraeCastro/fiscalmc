"use client";

import { useState } from "react";
import type { IbsCbsRascunho } from "@/lib/contribuinte/dps";
import { CST_IBS_CBS } from "@/lib/nfse/ibs-cbs";
import indicadores from "@/lib/contribuinte/indicadores-operacao.json";
import { Campo, Leitura } from "./campos";

/** Campos do IBS/CBS (CST, classificação, indicador da operação do Anexo C e consumo pessoal), usados no passo Serviço e nos favoritos. */
/** prefixo: na emissão rápida os campos levam "ibs_" para não colidir com o "cst" do PIS/COFINS no mesmo formulário. */
export function CamposIbsCbs({ inicial, erros, prefixo = "" }: { inicial: IbsCbsRascunho; erros: Record<string, string>; prefixo?: string }) {
  const p = (nome: string) => `${prefixo}${nome}`;
  const [tributo, setTributo] = useState(inicial);
  const mudar = (campo: keyof IbsCbsRascunho, valor: string) => setTributo((atual) => ({ ...atual, [campo]: valor }));
  const indicador = indicadores.find((item) => item.codigo === tributo.indicadorOperacao);
  return <>
    <div className="pc-grade">
      <Campo rotulo="Código de Situação Tributária" obrigatorio erro={erros[p("cst")]} id={p("cst")} largura="meia">
        <select id={p("cst")} name={p("cst")} className="pc-input" value={tributo.cst} onChange={(e) => mudar("cst", e.target.value)}>
          {Object.entries(CST_IBS_CBS).map(([codigo, rotulo]) => <option key={codigo} value={codigo}>{codigo} - {rotulo}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Código de Classificação Tributária" obrigatorio erro={erros[p("classificacao")]} dica="6 dígitos. 000001 = situações tributadas integralmente pelo IBS e CBS." id={p("classificacao")} largura="meia">
        <input id={p("classificacao")} name={p("classificacao")} inputMode="numeric" maxLength={6} value={tributo.classificacao} onChange={(e) => mudar("classificacao", e.target.value.replace(/[^0-9]/g, ""))} />
      </Campo>
      <Campo rotulo="Código indicador da operação" obrigatorio erro={erros[p("indicadorOperacao")]} id={p("indicadorOperacao")} largura="inteira">
        <select id={p("indicadorOperacao")} name={p("indicadorOperacao")} className="pc-input" value={tributo.indicadorOperacao} onChange={(e) => mudar("indicadorOperacao", e.target.value)}>
          <option value="">Selecione</option>
          {indicadores.map((item) => <option key={item.codigo} value={item.codigo}>{item.codigo} - {item.operacao} ({item.local})</option>)}
        </select>
      </Campo>
      {indicador ? <p className="pc-nota pc-campo inteira">Local de incidência: {indicador.local}.</p> : null}
      <fieldset className="pc-opcoes pc-campo meia">
        <legend>Operação de uso ou consumo pessoal?</legend>
        <label><input type="radio" name={p("consumoPessoal")} value="0" checked={tributo.consumoPessoal === "0"} onChange={() => mudar("consumoPessoal", "0")} /> Não</label>
        <label><input type="radio" name={p("consumoPessoal")} value="1" checked={tributo.consumoPessoal === "1"} onChange={() => mudar("consumoPessoal", "1")} /> Sim</label>
      </fieldset>
      <Leitura rotulo="O destinatário é o próprio adquirente?" valor="Sim" largura="meia" />
    </div>
    <p className="pc-nota">Base de cálculo, alíquotas e valores de IBS e CBS são calculados pela Receita na emissão.</p>
  </>;
}
