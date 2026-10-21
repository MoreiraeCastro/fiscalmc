"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { salvarServico, type EstadoPasso } from "@/app/contribuinte/dps/actions";
import { DESCRICAO_MAX, type IbsCbsRascunho } from "@/lib/contribuinte/dps";
import { Cartao } from "./portal-shell";
import { Campo, FaixaValidacao, Leitura, Rodape } from "./campos";
import { CamposIbsCbs } from "./campos-ibs-cbs";

export type ServicoOpcao = { id: string; nome: string; codigo: string | null; descricaoCodigo: string | null; nbs: string | null; municipioPrestacao: string; descricaoPadrao: string | null };

export function FormServico({ rascunhoId, servicos, inicial, escritorio, empresaId, ibsCbs }: { rascunhoId: string; servicos: ServicoOpcao[]; inicial: { modeloId: string; descricao: string }; escritorio: boolean; empresaId: string; ibsCbs: IbsCbsRascunho | null }) {
  const [estado, enviar, salvando] = useActionState<EstadoPasso, FormData>(salvarServico.bind(null, rascunhoId), { erros: {} });
  const [modeloId, setModeloId] = useState(inicial.modeloId || (servicos.length === 1 ? servicos[0].id : ""));
  const [descricao, setDescricao] = useState(inicial.descricao || (servicos.length === 1 ? servicos[0].descricaoPadrao ?? "" : ""));
  const [busca, setBusca] = useState("");
  const servico = servicos.find((item) => item.id === modeloId);
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return servicos;
    return servicos.filter((item) => `${item.codigo ?? ""} ${item.nome} ${item.descricaoCodigo ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo));
  }, [busca, servicos]);
  const erros = estado.erros;

  function escolher(id: string) {
    const anterior = servicos.find((item) => item.id === modeloId);
    const proximo = servicos.find((item) => item.id === id);
    setModeloId(id);
    // Troca a descrição só se ela ainda for a padrão do serviço anterior (não apaga o que foi digitado).
    if (proximo?.descricaoPadrao && (!descricao.trim() || descricao === anterior?.descricaoPadrao)) setDescricao(proximo.descricaoPadrao);
  }

  if (!servicos.length) return <Cartao titulo="Serviço/Fornecimento prestado">
    <div className="pc-aviso alerta">Esta empresa ainda não tem serviço pronto para emissão. {escritorio ? <>Configure em <Link className="pc-link" href={`/admin/empresas/${empresaId}?tab=services`}>Serviços da empresa</Link>.</> : "Peça ao escritório para liberar o serviço."}</div>
  </Cartao>;

  return <form action={enviar} className="pc-form" noValidate>
    <FaixaValidacao erros={erros} mensagem={estado.mensagem} />
    <Cartao titulo="Local da prestação do serviço">
      <div className="pc-grade">
        <Leitura rotulo="País" valor="Brasil" largura="terco" />
        <Leitura rotulo="Município" valor={servico?.municipioPrestacao ?? "Conforme o serviço escolhido"} largura="meia" />
      </div>
    </Cartao>
    <Cartao titulo="Serviço/Fornecimento prestado">
      <input type="hidden" name="servico" value={modeloId} />
      <Campo rotulo="Código de Tributação Nacional" obrigatorio erro={erros.servico} dica="Serviços revisados pelo escritório para esta empresa." id="busca-servico">
        {servicos.length > 6 ? <input id="busca-servico" className="pc-input" placeholder="Pesquisar código ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} /> : null}
        <div className="pc-lista-servicos" role="radiogroup" aria-label="Serviços">
          {visiveis.map((item) => <label key={item.id} className={item.id === modeloId ? "escolhido" : undefined}>
            <input type="radio" name="_servico" checked={item.id === modeloId} onChange={() => escolher(item.id)} />
            <span><strong>{item.codigo ? `${item.codigo} - ` : ""}{item.descricaoCodigo ?? item.nome}</strong>{item.descricaoCodigo && item.nome !== item.descricaoCodigo ? <small>{item.nome}</small> : null}</span>
          </label>)}
          {!visiveis.length ? <p className="pc-vazio">Nenhum serviço encontrado.</p> : null}
        </div>
      </Campo>
      {servico ? <div className="pc-grade">
        <Leitura rotulo="O serviço é caso de imunidade, exportação ou não incidência do ISSQN?" valor="Conforme a configuração do serviço" largura="meia" />
        <Leitura rotulo="Item da NBS correspondente" valor={servico.nbs} largura="meia" />
      </div> : null}
      <Campo rotulo="Descrição do Serviço/Fornecimento" obrigatorio erro={erros.descricao} id="descricao" largura="inteira">
        <textarea id="descricao" name="descricao" rows={6} maxLength={DESCRICAO_MAX} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        <small className="pc-contador">Total de caracteres: {descricao.length} / {DESCRICAO_MAX}</small>
      </Campo>
    </Cartao>
    {ibsCbs ? <Cartao titulo="IBS/CBS"><CamposIbsCbs inicial={ibsCbs} erros={erros} /></Cartao> : null}
    <Rodape voltar={`/contribuinte/dps/${rascunhoId}/pessoas`}><button className="pc-botao" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Avançar"}</button></Rodape>
  </form>;
}
