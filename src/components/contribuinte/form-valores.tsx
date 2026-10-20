"use client";

import { useActionState, useState } from "react";
import { salvarValores, type EstadoPasso } from "@/app/contribuinte/dps/actions";
import { mascaraValor } from "@/lib/contribuinte/dps";
import { Cartao } from "./portal-shell";
import { Campo, FaixaValidacao, Leitura, Rodape } from "./campos";

export type PreviaTela = { tributacao: string; retencao: string; aliquota: string; origem: string; aviso?: string } | null;

export function FormValores({ rascunhoId, inicial, simples, exigeAliquota, previa }: { rascunhoId: string; inicial: { valor: string; aliquota: string; fonte: string }; simples: boolean; exigeAliquota: boolean; previa: PreviaTela }) {
  const [estado, enviar, salvando] = useActionState<EstadoPasso, FormData>(salvarValores.bind(null, rascunhoId), { erros: {} });
  const [valor, setValor] = useState(inicial.valor);
  // Campos controlados: o React 19 limpa o formulário depois da action, e a validação não pode apagar o que foi digitado.
  const [aliquota, setAliquota] = useState(inicial.aliquota);
  const [fonte, setFonte] = useState(inicial.fonte);
  const erros = estado.erros;
  return <form action={enviar} className="pc-form" noValidate>
    <FaixaValidacao erros={erros} mensagem={estado.mensagem} />
    <Cartao titulo="Valores do serviço prestado">
      <div className="pc-grade">
        <Campo rotulo="Valor do serviço prestado (R$)" obrigatorio erro={erros.valor} id="valor" largura="terco">
          <input id="valor" name="valor" inputMode="numeric" className="num" placeholder="0,00" value={valor} onChange={(e) => setValor(mascaraValor(e.target.value))} />
        </Campo>
        <Leitura rotulo="Desconto incondicionado (R$)" valor="0,00" largura="terco" />
        <Leitura rotulo="Desconto condicionado (R$)" valor="0,00" largura="terco" />
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
    <Cartao titulo="Tributação federal">
      <p className="pc-texto">PIS/COFINS, IRRF e contribuições retidas seguem a configuração fiscal da empresa (sem retenções federais na nota).</p>
    </Cartao>
    <Rodape voltar={`/contribuinte/dps/${rascunhoId}/servico`}><button className="pc-botao" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Avançar"}</button></Rodape>
  </form>;
}
