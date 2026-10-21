"use client";

import { useActionState, useState } from "react";
import { salvarValores, type EstadoPasso } from "@/app/contribuinte/dps/actions";
import { CST_PIS_COFINS, MOTIVOS_SUBSTITUICAO, RETENCAO_PIS_COFINS, aliquotaEmPontosBase, centavosParaTexto, debitosPisCofins, mascaraValor, valorEmCentavos, type FederalRascunho } from "@/lib/contribuinte/dps";
import { Cartao } from "./portal-shell";
import { Campo, FaixaValidacao, Leitura, Rodape } from "./campos";

export type PreviaTela = { tributacao: string; retencao: string; aliquota: string; origem: string; aviso?: string } | null;

export function FormValores({ rascunhoId, inicial, simples, exigeAliquota, previa, substituicao }: { rascunhoId: string; inicial: { valor: string; aliquota: string; fonte: string; descIncond: string; descCond: string; federal: FederalRascunho | null }; simples: boolean; exigeAliquota: boolean; previa: PreviaTela; substituicao?: { motivoCodigo: string; motivo: string } }) {
  const [estado, enviar, salvando] = useActionState<EstadoPasso, FormData>(salvarValores.bind(null, rascunhoId), { erros: {} });
  const [valor, setValor] = useState(inicial.valor);
  // Campos controlados: o React 19 limpa o formulário depois da action, e a validação não pode apagar o que foi digitado.
  const [aliquota, setAliquota] = useState(inicial.aliquota);
  const [fonte, setFonte] = useState(inicial.fonte);
  const [descIncond, setDescIncond] = useState(inicial.descIncond);
  const [descCond, setDescCond] = useState(inicial.descCond);
  const [motivoCodigo, setMotivoCodigo] = useState(substituicao?.motivoCodigo ?? "");
  const [motivo, setMotivo] = useState(substituicao?.motivo ?? "");
  const erros = estado.erros;
  return <form action={enviar} className="pc-form" noValidate>
    <FaixaValidacao erros={erros} mensagem={estado.mensagem} />
    {substituicao ? <Cartao titulo="Motivo da substituição">
      <div className="pc-grade">
        <Campo rotulo="Código de justificativa" obrigatorio erro={erros.motivoCodigo} id="motivoCodigo" largura="inteira">
          <select id="motivoCodigo" name="motivoCodigo" className="pc-input" value={motivoCodigo} onChange={(e) => setMotivoCodigo(e.target.value)}>
            <option value="">Selecione</option>
            {Object.entries(MOTIVOS_SUBSTITUICAO).map(([codigo, rotulo]) => <option key={codigo} value={codigo}>{codigo} - {rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Descrição do motivo" obrigatorio={motivoCodigo === "99"} erro={erros.motivo} dica="De 15 a 255 caracteres. Obrigatória em 99 - Outros." id="motivo" largura="inteira">
          <textarea id="motivo" name="motivo" rows={3} maxLength={255} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <small className="pc-contador">{motivo.length} / 255</small>
        </Campo>
      </div>
    </Cartao> : null}
    <Cartao titulo="Valores do serviço prestado">
      <div className="pc-grade">
        <Campo rotulo="Valor do serviço prestado (R$)" obrigatorio erro={erros.valor} id="valor" largura="terco">
          <input id="valor" name="valor" inputMode="numeric" className="num" placeholder="0,00" value={valor} readOnly={Boolean(substituicao)} title={substituicao ? "Na substituição o valor é o da nota original" : undefined} onChange={(e) => setValor(mascaraValor(e.target.value))} />
        </Campo>
        <Campo rotulo="Desconto incondicionado (R$)" erro={erros.descIncond} dica="Reduz a base de cálculo do ISSQN." id="descIncond" largura="terco">
          <input id="descIncond" name="descIncond" inputMode="numeric" className="num" placeholder="0,00" value={descIncond} onChange={(e) => setDescIncond(mascaraValor(e.target.value))} />
        </Campo>
        <Campo rotulo="Desconto condicionado (R$)" erro={erros.descCond} id="descCond" largura="terco">
          <input id="descCond" name="descCond" inputMode="numeric" className="num" placeholder="0,00" value={descCond} onChange={(e) => setDescCond(mascaraValor(e.target.value))} />
        </Campo>
      </div>
    </Cartao>
    {simples ? <div className="pc-aviso">Empresa optante pelo Simples Nacional: o ISSQN é apurado pelo Simples, conforme o regime de apuração da empresa.</div> : null}
    <Cartao titulo="Tributação municipal (ISSQN)">
      <div className="pc-grade">
        <Leitura rotulo="Tributação do ISSQN" valor={previa?.tributacao} largura="terco" />
        <Leitura rotulo="Há retenção do ISSQN?" valor={previa?.retencao} largura="terco" />
        {!exigeAliquota ? <Leitura rotulo="Alíquota (%)" valor={previa?.aliquota} largura="terco" /> : null}
      </div>
      {previa?.origem && !exigeAliquota ? <p className="pc-nota">Alíquota: {previa.origem}.</p> : null}
      {previa?.aviso && !exigeAliquota ? <div className="pc-aviso alerta">{previa.aviso}</div> : null}
      {exigeAliquota ? <>
        <div className="pc-aviso alerta">Não há de/para municipal para este serviço: confirme a alíquota do ISSQN e a fonte (ex.: lei municipal, consulta à prefeitura). Fica registrado na auditoria.</div>
        <div className="pc-grade">
          <Campo rotulo="Alíquota do ISSQN (%)" obrigatorio erro={erros.aliquota} id="aliquota" largura="terco">
            <input id="aliquota" name="aliquota" inputMode="decimal" placeholder="Ex.: 2,00" value={aliquota} onChange={(e) => setAliquota(e.target.value)} />
          </Campo>
          <Campo rotulo="Fonte da alíquota" obrigatorio erro={erros.fonte} id="fonte" largura="inteira">
            <input id="fonte" name="fonte" maxLength={500} value={fonte} onChange={(e) => setFonte(e.target.value)} />
          </Campo>
        </div>
      </> : null}
    </Cartao>
    <TributacaoFederal inicial={inicial.federal} valorServico={valor} descIncond={descIncond} erros={erros} />
    <Rodape voltar={`/contribuinte/dps/${rascunhoId}/servico`}><button className="pc-botao" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Avançar"}</button></Rodape>
  </form>;
}

const percentual = (bp: number | undefined) => (bp === undefined ? "" : (bp / 100).toFixed(2).replace(".", ","));

/**
 * Tributação federal, como no Emissor Nacional: PIS/COFINS (débito, não entra no líquido) e as retenções.
 * "Contribuições sociais retidas" é o total de PIS/COFINS/CSLL retido (vRetCSLL), que a Receita desconta do líquido.
 */
function TributacaoFederal({ inicial, valorServico, descIncond, erros }: { inicial: FederalRascunho | null; valorServico: string; descIncond: string; erros: Record<string, string> }) {
  const [cst, setCst] = useState(inicial?.cst ?? "00");
  const [base, setBase] = useState(inicial?.baseCentavos ? centavosParaTexto(inicial.baseCentavos) : "");
  const [pis, setPis] = useState(percentual(inicial?.pisBp) || "0,65");
  const [cofins, setCofins] = useState(percentual(inicial?.cofinsBp) || "3,00");
  const [retencao, setRetencao] = useState(inicial?.retencaoPisCofins ?? "");
  const [irrf, setIrrf] = useState(inicial?.irrfCentavos ? centavosParaTexto(inicial.irrfCentavos) : "");
  const [cs, setCs] = useState(inicial?.csCentavos ? centavosParaTexto(inicial.csCentavos) : "");
  const [cp, setCp] = useState(inicial?.cpCentavos ? centavosParaTexto(inicial.cpCentavos) : "");
  const servico = valorEmCentavos(valorServico) ?? 0;
  const baseSugerida = Math.max(servico - (valorEmCentavos(descIncond) ?? 0), 0);
  const debitos = debitosPisCofins({ baseCentavos: valorEmCentavos(base) ?? 0, pisBp: aliquotaEmPontosBase(pis) ?? 0, cofinsBp: aliquotaEmPontosBase(cofins) ?? 0 });
  // Atalhos das retenções mais comuns sobre o valor do serviço (IRRF 1,5%; PIS/COFINS/CSLL 4,65%).
  const sugerir = (bp: number, definir: (valor: string) => void) => servico
    ? <button type="button" className="pc-link botao" onClick={() => definir(centavosParaTexto(Math.round((servico * bp) / 10000)))}>{percentual(bp)}% do serviço</button> : null;
  const dinheiro = (id: string, valor: string, definir: (valor: string) => void) =>
    <input id={id} name={id} inputMode="numeric" className="num" placeholder="0,00" value={valor} onChange={(e) => definir(mascaraValor(e.target.value))} />;
  return <Cartao titulo="Tributação federal">
    <div className="pc-grade">
      <Campo rotulo="Situação Tributária do PIS/COFINS" obrigatorio erro={erros.cst} id="cst" largura="inteira">
        <select id="cst" name="cst" className="pc-input" value={cst} onChange={(e) => { setCst(e.target.value); if (!base && baseSugerida) setBase(centavosParaTexto(baseSugerida)); }}>
          {Object.entries(CST_PIS_COFINS).map(([codigo, rotulo]) => <option key={codigo} value={codigo}>{codigo} - {rotulo}</option>)}
        </select>
      </Campo>
      {cst !== "00" ? <>
        <Campo rotulo="Base de cálculo do PIS/COFINS (R$)" obrigatorio erro={erros.base} id="basePisCofins" largura="terco">{dinheiro("basePisCofins", base, setBase)}</Campo>
        <Campo rotulo="Alíquota do PIS (%)" obrigatorio erro={erros.pis} id="aliqPis" largura="terco"><input id="aliqPis" name="aliqPis" inputMode="decimal" value={pis} onChange={(e) => setPis(e.target.value)} /></Campo>
        <Campo rotulo="Alíquota da COFINS (%)" obrigatorio erro={erros.cofins} id="aliqCofins" largura="terco"><input id="aliqCofins" name="aliqCofins" inputMode="decimal" value={cofins} onChange={(e) => setCofins(e.target.value)} /></Campo>
        <Leitura rotulo="Valor do PIS (R$)" valor={centavosParaTexto(debitos.pis) || "0,00"} largura="terco" />
        <Leitura rotulo="Valor da COFINS (R$)" valor={centavosParaTexto(debitos.cofins) || "0,00"} largura="terco" />
        <Campo rotulo="Tipo de retenção do PIS/COFINS/CSLL" obrigatorio erro={erros.retencao} id="retencaoPisCofins" largura="terco">
          <select id="retencaoPisCofins" name="retencaoPisCofins" className="pc-input" value={retencao} onChange={(e) => setRetencao(e.target.value)}>
            <option value="">Selecione</option>
            {Object.entries(RETENCAO_PIS_COFINS).map(([codigo, rotulo]) => <option key={codigo} value={codigo}>{codigo} - {rotulo}</option>)}
          </select>
        </Campo>
      </> : null}
      <Campo rotulo="IRRF retido (R$)" erro={erros.irrf} id="irrf" largura="terco">{dinheiro("irrf", irrf, setIrrf)}{sugerir(150, setIrrf)}</Campo>
      <Campo rotulo="Contribuições sociais retidas (R$)" dica="Total de PIS/COFINS/CSLL retido pelo tomador." erro={erros.cs} id="cs" largura="terco">{dinheiro("cs", cs, setCs)}{sugerir(465, setCs)}</Campo>
      <Campo rotulo="Contribuição previdenciária retida (R$)" erro={erros.cp} id="cp" largura="terco">{dinheiro("cp", cp, setCp)}</Campo>
    </div>
    <p className="pc-nota">As retenções reduzem o valor líquido da nota. O PIS/COFINS acima é o débito da empresa e não altera o líquido.</p>
  </Cartao>;
}
