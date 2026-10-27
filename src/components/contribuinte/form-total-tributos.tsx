"use client";

import { useActionState, useState } from "react";
import { salvarTotalTributosAction, type EstadoConfiguracoes } from "@/app/contribuinte/configuracoes/actions";
import { Campo } from "./campos";

export type InicialTotalTributos = { modo: "nenhum" | "simples" | "percentuais"; aliquotaSimples: string; federal: string; estadual: string; municipal: string };

/** Valor aproximado dos tributos: as mesmas opções de Configurações do Emissor Nacional. */
export function FormTotalTributos({ inicial, simplesMeEpp, podeEditar }: { inicial: InicialTotalTributos; simplesMeEpp: boolean; podeEditar: boolean }) {
  const [estado, enviar, salvando] = useActionState<EstadoConfiguracoes, FormData>(salvarTotalTributosAction, { erros: {} });
  const [modo, setModo] = useState(inicial.modo);
  const opcao = (valor: InicialTotalTributos["modo"], rotulo: string) => <label className="pc-opcao">
    <input type="radio" name="modo" value={valor} checked={modo === valor} disabled={!podeEditar} onChange={() => setModo(valor)} />{rotulo}
  </label>;
  return <form action={enviar} className="pc-form" noValidate>
    {estado.mensagem ? <div className={`pc-aviso ${estado.ok ? "sucesso" : "alerta"}`} role="status">{estado.mensagem}</div> : null}
    <div className="pc-opcoes">
      {opcao("nenhum", simplesMeEpp ? "Não informar (percentuais zerados)" : "Não informar")}
      {opcao("percentuais", "Configurar os valores percentuais correspondentes")}
      {simplesMeEpp ? opcao("simples", "Informar alíquota do Simples Nacional") : null}
    </div>
    {modo === "simples" ? <div className="pc-grade">
      <Campo rotulo="Alíquota no Simples Nacional (%)" obrigatorio erro={estado.erros.aliquotaSimples} dica="A alíquota efetiva do DAS. Sai em todas as NFS-e." id="aliquotaSimples" largura="terco">
        <input id="aliquotaSimples" name="aliquotaSimples" inputMode="decimal" placeholder="Ex.: 6,00" defaultValue={inicial.aliquotaSimples} readOnly={!podeEditar} />
      </Campo>
    </div> : null}
    {modo === "percentuais" ? <div className="pc-grade">
      <Campo rotulo="Federal (%)" erro={estado.erros.federal} id="federal" largura="terco"><input id="federal" name="federal" inputMode="decimal" placeholder="0,00" defaultValue={inicial.federal} readOnly={!podeEditar} /></Campo>
      <Campo rotulo="Estadual (%)" erro={estado.erros.estadual} id="estadual" largura="terco"><input id="estadual" name="estadual" inputMode="decimal" placeholder="0,00" defaultValue={inicial.estadual} readOnly={!podeEditar} /></Campo>
      <Campo rotulo="Municipal (%)" erro={estado.erros.municipal} id="municipal" largura="terco"><input id="municipal" name="municipal" inputMode="decimal" placeholder="0,00" defaultValue={inicial.municipal} readOnly={!podeEditar} /></Campo>
    </div> : null}
    {podeEditar ? <footer className="pc-rodape-passo"><span /><button className="pc-botao" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></footer> : null}
  </form>;
}
