"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { salvarFavoritoAction, type EstadoFavorito } from "@/app/contribuinte/favoritos/actions";
import { DESCRICAO_MAX, mascaraValor, type IbsCbsRascunho } from "@/lib/contribuinte/dps";
import { formatarDocumento } from "@/lib/contribuinte/formato";
import { Cartao } from "./portal-shell";
import { Campo, FaixaValidacao } from "./campos";
import { CamposIbsCbs } from "./campos-ibs-cbs";

export type FavoritoInicial = { nome: string; servico: string; descricao: string; tomador: string; valor: string; informarIbsCbs: boolean; ibsCbs: IbsCbsRascunho };
type Opcao = { id: string; rotulo: string; descricaoPadrao?: string | null };

/** "Novo/Editar Serviço Favorito": o que vier preenchido aqui entra pronto na emissão. */
export function FormFavorito({ favoritoId, inicial, servicos, tomadores }: { favoritoId: string | null; inicial: FavoritoInicial; servicos: Opcao[]; tomadores: { id: string; documento: string | null; nome: string }[] }) {
  const [estado, enviar, salvando] = useActionState<EstadoFavorito, FormData>(salvarFavoritoAction.bind(null, favoritoId), { erros: {} });
  const [nome, setNome] = useState(inicial.nome);
  const [servico, setServico] = useState(inicial.servico);
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [tomador, setTomador] = useState(inicial.tomador);
  const [valor, setValor] = useState(inicial.valor);
  const [informarIbsCbs, setInformarIbsCbs] = useState(inicial.informarIbsCbs);
  const erros = estado.erros;

  function escolherServico(id: string) {
    const anterior = servicos.find((item) => item.id === servico);
    const proximo = servicos.find((item) => item.id === id);
    setServico(id);
    if (proximo?.descricaoPadrao && (!descricao.trim() || descricao === anterior?.descricaoPadrao)) setDescricao(proximo.descricaoPadrao);
  }

  return <form action={enviar} className="pc-form" noValidate>
    <FaixaValidacao erros={erros} mensagem={estado.mensagem} />
    <Cartao titulo="Identificação">
      <div className="pc-grade">
        <Campo rotulo="Nome do favorito" obrigatorio erro={erros.nome} dica="Como ele aparece na lista. Ex.: Honorários mensais" id="nome" largura="inteira">
          <input id="nome" name="nome" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
      </div>
    </Cartao>
    <Cartao titulo="Serviço/Fornecimento prestado">
      <div className="pc-grade">
        <Campo rotulo="Código de Tributação Nacional" obrigatorio erro={erros.servico} id="servico" largura="inteira">
          <select id="servico" name="servico" className="pc-input" value={servico} onChange={(e) => escolherServico(e.target.value)}>
            <option value="">Selecione</option>
            {servicos.map((item) => <option key={item.id} value={item.id}>{item.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Descrição do Serviço/Fornecimento" obrigatorio erro={erros.descricao} id="descricao" largura="inteira">
          <textarea id="descricao" name="descricao" rows={5} maxLength={DESCRICAO_MAX} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <small className="pc-contador">Total de caracteres: {descricao.length} / {DESCRICAO_MAX}</small>
        </Campo>
      </div>
    </Cartao>
    <Cartao titulo="Tomador e valor (opcionais)">
      <div className="pc-grade">
        <Campo rotulo="Tomador/Adquirente" erro={erros.tomador} dica="Deixe em branco para escolher na hora da emissão." id="tomador" largura="meia">
          <select id="tomador" name="tomador" className="pc-input" value={tomador} onChange={(e) => setTomador(e.target.value)}>
            <option value="">Escolher na emissão</option>
            <option value="NAO_INFORMADO">Tomador/Adquirente não informado</option>
            {tomadores.map((item) => <option key={item.id} value={item.id}>{item.documento ? `${formatarDocumento(item.documento)} - ` : ""}{item.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Valor do serviço (R$)" erro={erros.valor} dica="Em branco: informado na emissão." id="valor" largura="terco">
          <input id="valor" name="valor" inputMode="numeric" className="num" placeholder="0,00" value={valor} onChange={(e) => setValor(mascaraValor(e.target.value))} />
        </Campo>
      </div>
    </Cartao>
    <Cartao titulo="IBS/CBS">
      <fieldset className="pc-opcoes">
        <legend>Preencher as informações IBS/CBS?</legend>
        <label><input type="radio" name="ibsCbs" value="SIM" checked={informarIbsCbs} onChange={() => setInformarIbsCbs(true)} /> Sim</label>
        <label><input type="radio" name="ibsCbs" value="NAO" checked={!informarIbsCbs} onChange={() => setInformarIbsCbs(false)} /> Não</label>
      </fieldset>
      {informarIbsCbs ? <CamposIbsCbs inicial={inicial.ibsCbs} erros={erros} /> : <p className="pc-nota">Quando a competência exigir IBS/CBS, o passo Serviço pede as informações.</p>}
    </Cartao>
    <footer className="pc-rodape-passo">
      <Link className="pc-botao secundario" href="/contribuinte/favoritos">Voltar</Link>
      <button className="pc-botao" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar favorito"}</button>
    </footer>
  </form>;
}
