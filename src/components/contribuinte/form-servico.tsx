"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { salvarServico, type EstadoPasso } from "@/app/contribuinte/dps/actions";
import { DESCRICAO_MAX, INFO_COMPLEMENTAR_MAX, MECANISMO_PRESTADOR, MECANISMO_TOMADOR, MODO_PRESTACAO, MOEDAS, MOVIMENTACAO_BENS, VINCULO_PARTES, centavosParaTexto, mascaraValor, type ComercioExteriorRascunho, type ComplementoRascunho, type IbsCbsRascunho } from "@/lib/contribuinte/dps";
import { Cartao } from "./portal-shell";
import { Campo, FaixaValidacao, Leitura, Rodape } from "./campos";
import { CamposIbsCbs } from "./campos-ibs-cbs";

export type ServicoOpcao = { id: string; nome: string; codigo: string | null; descricaoCodigo: string | null; nbs: string | null; municipioPrestacao: string; descricaoPadrao: string | null };

export function FormServico({ rascunhoId, servicos, inicial, escritorio, empresaId, ibsCbs, complemento, comercioExterior }: { rascunhoId: string; servicos: ServicoOpcao[]; inicial: { modeloId: string; descricao: string }; escritorio: boolean; empresaId: string; ibsCbs: IbsCbsRascunho | null; complemento: ComplementoRascunho | null; /** null = tomador no Brasil (sem o grupo); objeto vazio = exterior ainda sem dados. */ comercioExterior: Partial<ComercioExteriorRascunho> | null }) {
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
    {comercioExterior ? <ComercioExterior inicial={comercioExterior} erros={erros} /> : null}
    <InformacoesComplementares inicial={complemento ?? {}} erros={erros} />
    {ibsCbs ? <Cartao titulo="IBS/CBS">
      {comercioExterior ? <div className="pc-aviso alerta">Tomador no exterior: o indicador 100301 (domicílio do adquirente) é recusado pela Receita (E0239). Escolha o indicador e a situação tributária próprios da operação com o exterior.</div> : null}
      <CamposIbsCbs inicial={ibsCbs} erros={erros} />
    </Cartao> : null}
    <Rodape voltar={`/contribuinte/dps/${rascunhoId}/pessoas`}><button className="pc-botao" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Avançar"}</button></Rodape>
  </form>;
}

/** Comércio exterior (grupo comExt): obrigatório quando o tomador está no exterior. */
function ComercioExterior({ inicial, erros }: { inicial: Partial<ComercioExteriorRascunho>; erros: Record<string, string> }) {
  const [dados, setDados] = useState({
    modo: inicial.modo ?? "1", vinculo: inicial.vinculo ?? "0", moeda: inicial.moeda ?? "220", valorMoeda: inicial.valorMoedaCentavos ? centavosParaTexto(inicial.valorMoedaCentavos) : "",
    mecPrestador: inicial.mecPrestador ?? "01", mecTomador: inicial.mecTomador ?? "01", movTempBens: inicial.movTempBens ?? "1", nDI: inicial.nDI ?? "", nRE: inicial.nRE ?? "", mdic: inicial.mdic ?? "0",
  });
  const mudar = (campo: keyof typeof dados, valor: string) => setDados((atual) => ({ ...atual, [campo]: valor }));
  const lista = (campo: keyof typeof dados, opcoes: Record<string, string>, rotulo: string, largura: "meia" | "terco" | "inteira" = "meia") =>
    <Campo rotulo={rotulo} obrigatorio erro={erros[`cx_${campo}`]} id={`cx_${campo}`} largura={largura}>
      <select id={`cx_${campo}`} name={`cx_${campo}`} className="pc-input" value={dados[campo]} onChange={(e) => mudar(campo, e.target.value)}>
        {Object.entries(opcoes).map(([codigo, texto]) => <option key={codigo} value={codigo}>{codigo} - {texto}</option>)}
      </select>
    </Campo>;
  return <Cartao titulo="Comércio exterior">
    <div className="pc-grade">
      {lista("modo", MODO_PRESTACAO, "Modo de prestação")}
      {lista("vinculo", VINCULO_PARTES, "Vínculo entre as partes no negócio")}
      {lista("moeda", MOEDAS, "Moeda", "terco")}
      <Campo rotulo="Valor do serviço na moeda" obrigatorio erro={erros.cx_valorMoeda} id="cx_valorMoeda" largura="terco">
        <input id="cx_valorMoeda" name="cx_valorMoeda" inputMode="numeric" className="num" placeholder="0,00" value={dados.valorMoeda} onChange={(e) => mudar("valorMoeda", mascaraValor(e.target.value))} />
      </Campo>
      {lista("mecPrestador", MECANISMO_PRESTADOR, "Mecanismo de apoio/fomento ao comércio exterior (prestador)")}
      {lista("mecTomador", MECANISMO_TOMADOR, "Mecanismo de apoio/fomento ao comércio exterior (tomador)")}
      {lista("movTempBens", MOVIMENTACAO_BENS, "Vínculo da operação à movimentação temporária de bens")}
      {dados.movTempBens === "2" ? <Campo rotulo="Número da Declaração de Importação" obrigatorio erro={erros.cx_nDI} id="cx_nDI" largura="terco"><input id="cx_nDI" name="cx_nDI" maxLength={12} value={dados.nDI} onChange={(e) => mudar("nDI", e.target.value)} /></Campo> : null}
      {dados.movTempBens === "3" ? <Campo rotulo="Número do Registro de Exportação" obrigatorio erro={erros.cx_nRE} id="cx_nRE" largura="terco"><input id="cx_nRE" name="cx_nRE" maxLength={12} value={dados.nRE} onChange={(e) => mudar("nRE", e.target.value)} /></Campo> : null}
      <fieldset className="pc-opcoes pc-campo meia">
        <legend>Compartilhar a NFS-e com a Secretaria de Comércio Exterior (MDIC)?<span className="pc-obrigatorio"> *</span></legend>
        <label><input type="radio" name="cx_mdic" value="0" checked={dados.mdic === "0"} onChange={() => mudar("mdic", "0")} /> Não</label>
        <label><input type="radio" name="cx_mdic" value="1" checked={dados.mdic === "1"} onChange={() => mudar("mdic", "1")} /> Sim</label>
      </fieldset>
    </div>
  </Cartao>;
}

/** Informações complementares (grupo infoCompl): todas opcionais. */
function InformacoesComplementares({ inicial, erros }: { inicial: ComplementoRascunho; erros: Record<string, string> }) {
  const [dados, setDados] = useState({ docTecnico: inicial.docTecnico ?? "", docReferencia: inicial.docReferencia ?? "", pedido: inicial.pedido ?? "", informacoes: inicial.informacoes ?? "" });
  const mudar = (campo: keyof typeof dados) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDados((atual) => ({ ...atual, [campo]: e.target.value }));
  return <Cartao titulo="Informações complementares">
    <div className="pc-grade">
      <Campo rotulo="Número do documento de responsabilidade técnica" dica="ART, RRT ou similar." erro={erros.docTecnico} id="docTecnico" largura="terco"><input id="docTecnico" name="docTecnico" maxLength={40} value={dados.docTecnico} onChange={mudar("docTecnico")} /></Campo>
      <Campo rotulo="Documento de referência" erro={erros.docReferencia} id="docReferencia" largura="terco"><input id="docReferencia" name="docReferencia" maxLength={255} value={dados.docReferencia} onChange={mudar("docReferencia")} /></Campo>
      <Campo rotulo="Número do Pedido/Ordem de Compra/OS/Projeto" erro={erros.pedido} id="pedido" largura="terco"><input id="pedido" name="pedido" maxLength={60} value={dados.pedido} onChange={mudar("pedido")} /></Campo>
      <Campo rotulo="Informações complementares" erro={erros.informacoes} id="informacoes" largura="inteira">
        <textarea id="informacoes" name="informacoes" rows={4} maxLength={INFO_COMPLEMENTAR_MAX} value={dados.informacoes} onChange={mudar("informacoes")} />
        <small className="pc-contador">Total de caracteres: {dados.informacoes.length} / {INFO_COMPLEMENTAR_MAX}</small>
      </Campo>
    </div>
  </Cartao>;
}
