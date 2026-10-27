"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { History, LoaderCircle, Search, X } from "lucide-react";
import { consultarTomador, salvarRapida, type EstadoPasso } from "@/app/contribuinte/dps/actions";
import { formatarDocumento } from "@/lib/contribuinte/formato";
import type { TomadorSalvo } from "@/lib/contribuinte/emissao";
import { DESCRICAO_MAX, mascaraValor, type ComplementoRascunho, type FederalRascunho, type IbsCbsRascunho, type IntermediarioRascunho, type RegimeFederal } from "@/lib/contribuinte/dps";
import type { CnpjLookupCustomer } from "@/lib/nfse/cnpj-lookup";
import { Cartao } from "./portal-shell";
import { Campo, FaixaValidacao, Rodape } from "./campos";
import { CamposIbsCbs } from "./campos-ibs-cbs";
import { Intermediario, mascaraDocumento, UltimosTomadores } from "./form-pessoas";
import { InformacoesComplementares } from "./form-servico";
import { TributacaoFederal } from "./form-valores";
import { SeletorServicoNacional, type CodigoNacionalOpcao, type ServicoUsado } from "./seletor-servico-nacional";

export type ServicoRapido = { id: string; nome: string; codigo: string | null; descricaoCodigo: string | null; descricaoPadrao: string | null };

export type InicialRapida = {
  competencia: string;
  tomador: { clienteId: string; documento: string | null; nome: string } | null;
  semTomador: boolean;
  modeloId: string;
  descricao: string;
  valor: string;
  descIncond: string;
  descCond: string;
  informarIbsCbs: boolean;
  ibsCbs: IbsCbsRascunho;
  intermediario: IntermediarioRascunho | null;
  complemento: ComplementoRascunho | null;
  federal: FederalRascunho | null;
};

/** Campos que ficam em "Mais opções": se um deles der erro, a seção abre sozinha. */
const CAMPOS_MAIS_OPCOES = /^(competencia|ibs_|interm|descIncond|descCond|cst|base|pis|cofins|retencao|irrf|cs|cp|docTecnico|docReferencia|pedido|informacoes)/;

/**
 * Emissão rápida: tomador, serviço, descrição e valor numa tela só. O resto (competência, IBS/CBS, intermediário, descontos,
 * retenções federais e informações complementares) fica em "Mais opções", com os mesmos padrões da emissão completa.
 * Os nomes dos campos são os mesmos dos passos 1 a 3, para o servidor usar as mesmas regras (salvarRapida).
 */
export function FormRapida({ regime = null, rascunhoId, hoje, ibsCbsObrigatorioDesde, tomadores, servicos, nacional, inicial }: {
  rascunhoId: string | null;
  hoje: string;
  ibsCbsObrigatorioDesde: string;
  tomadores: TomadorSalvo[];
  servicos: ServicoRapido[];
  /** Lista nacional (empresa sem exigência de revisão) ou null (só os serviços liberados pelo escritório). */
  nacional: { catalogo: CodigoNacionalOpcao[]; usados: ServicoUsado[] } | null;
  inicial: InicialRapida;
  /** Regime de PIS/COFINS da empresa: decide o bloco federal. */
  regime?: RegimeFederal;
}) {
  const [estado, enviar, salvando] = useActionState<EstadoPasso, FormData>(salvarRapida.bind(null, rascunhoId), { erros: {} });
  const erros = estado.erros;
  const [competencia, setCompetencia] = useState(inicial.competencia);
  const ibsCbsObrigatorio = Boolean(competencia) && competencia >= ibsCbsObrigatorioDesde;
  const [informarIbsCbs, setInformarIbsCbs] = useState(inicial.informarIbsCbs);
  const [semTomador, setSemTomador] = useState(inicial.semTomador);
  const [clienteId, setClienteId] = useState(inicial.tomador?.clienteId ?? "");
  const [documento, setDocumento] = useState(inicial.tomador?.documento ? formatarDocumento(inicial.tomador.documento) : "");
  const [nome, setNome] = useState(inicial.tomador?.nome ?? "");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState<CnpjLookupCustomer | null>(null);
  const [aviso, setAviso] = useState("");
  const [historico, setHistorico] = useState(false);
  const [consultando, iniciarConsulta] = useTransition();
  const [modeloId, setModeloId] = useState(inicial.modeloId);
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [descricaoPadrao, setDescricaoPadrao] = useState(servicos.find((item) => item.id === inicial.modeloId)?.descricaoPadrao ?? "");
  const [valor, setValor] = useState(inicial.valor);
  const [descIncond, setDescIncond] = useState(inicial.descIncond);
  const [descCond, setDescCond] = useState(inicial.descCond);
  const temMaisOpcoes = Boolean(inicial.intermediario || inicial.complemento || inicial.descIncond || inicial.descCond || (inicial.federal && (inicial.federal.cst !== "00" || inicial.federal.irrfCentavos || inicial.federal.csCentavos || inicial.federal.cpCentavos)) || inicial.competencia !== hoje);
  const erroEmMaisOpcoes = Object.keys(erros).some((campo) => CAMPOS_MAIS_OPCOES.test(campo));
  const nomeDaReceita = !clienteId && Boolean(endereco?.legalName);

  function usarSalvo(item: TomadorSalvo) {
    if (item.exterior) { setAviso("Tomador no exterior: use a emissão completa."); setHistorico(false); return; }
    setSemTomador(false); setClienteId(item.id); setDocumento(formatarDocumento(item.documento)); setNome(item.nome); setEmail(item.email ?? ""); setEndereco(null); setAviso(""); setHistorico(false);
  }
  function limpar() {
    setClienteId(""); setDocumento(""); setNome(""); setEmail(""); setEndereco(null); setAviso("");
  }
  function pesquisar(valorDocumento = documento) {
    if (!valorDocumento.trim()) return;
    iniciarConsulta(async () => {
      const resposta = await consultarTomador(valorDocumento);
      if (resposta.salvo) { usarSalvo(resposta.salvo); setAviso("Tomador já cadastrado para esta empresa."); return; }
      setClienteId("");
      if (resposta.receita) {
        setNome(resposta.receita.legalName); setEmail(resposta.receita.email); setEndereco(resposta.receita);
        setAviso(resposta.receita.situacaoCadastral && resposta.receita.situacaoCadastral !== "ATIVA" ? `Atenção: situação cadastral na Receita = ${resposta.receita.situacaoCadastral}.` : "");
        return;
      }
      setEndereco(null);
      setAviso(resposta.erro ?? "CPF não cadastrado: informe o nome.");
    });
  }
  function escolherServico(id: string) {
    const anterior = servicos.find((item) => item.id === modeloId);
    const proximo = servicos.find((item) => item.id === id);
    setModeloId(id);
    if (proximo?.descricaoPadrao && (!descricao.trim() || descricao === anterior?.descricaoPadrao)) setDescricao(proximo.descricaoPadrao);
  }
  function trocarDescricaoPadrao(nova: string) {
    if (!descricao.trim() || descricao === descricaoPadrao) setDescricao(nova);
    setDescricaoPadrao(nova);
  }

  return <form action={enviar} className="pc-form" noValidate>
    <FaixaValidacao erros={erros} mensagem={estado.mensagem} />

    <Cartao titulo="Para quem é a nota">
      <input type="hidden" name="onde" value={semTomador ? "NAO_INFORMADO" : "BRASIL"} />
      <input type="hidden" name="clienteId" value={semTomador ? "" : clienteId} />
      <input type="hidden" name="endereco" value={endereco ? JSON.stringify(endereco) : ""} />
      {semTomador ? <p className="pc-nota">A nota sai sem tomador. <button type="button" className="pc-link botao" onClick={() => setSemTomador(false)}>Informar o tomador</button></p> : <>
        <div className="pc-grade">
          <Campo rotulo="CPF/CNPJ do tomador" obrigatorio erro={erros.documento ?? erros.tomador} id="documento" largura="meia">
            <div className="pc-com-botoes">
              <input id="documento" name="documento" inputMode="numeric" autoComplete="off" autoFocus={!clienteId} value={documento} readOnly={Boolean(clienteId)}
                onChange={(e) => {
                  const valorDigitado = mascaraDocumento(e.target.value);
                  setDocumento(valorDigitado); setAviso("");
                  if (endereco) { setEndereco(null); setNome(""); setEmail(""); }
                  if (valorDigitado.replace(/\D/g, "").length === 14) pesquisar(valorDigitado);
                }}
                onBlur={() => { if (!clienteId && !nome && documento.replace(/\D/g, "").length === 11) pesquisar(); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pesquisar(); } }} />
              {clienteId ? <button type="button" className="pc-icone-botao" title="Trocar tomador" aria-label="Trocar tomador" onClick={limpar}><X size={17} aria-hidden /></button>
                : <button type="button" className="pc-icone-botao" title="Pesquisar" aria-label="Pesquisar CPF/CNPJ" onClick={() => pesquisar()} disabled={consultando}>{consultando ? <LoaderCircle className="spin" size={17} aria-hidden /> : <Search size={17} aria-hidden />}</button>}
              <button type="button" className="pc-icone-botao" title="Últimos Tomadores" aria-label="Últimos Tomadores" onClick={() => setHistorico(true)}><History size={17} aria-hidden /></button>
            </div>
          </Campo>
          <Campo rotulo="Nome/Razão Social" obrigatorio erro={erros.nome} id="nome" largura="meia">
            <input id="nome" name="nome" value={nome} readOnly={Boolean(clienteId) || nomeDaReceita} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          {!clienteId && documento ? <Campo rotulo="E-mail do tomador" erro={erros.email} id="email" largura="meia"><input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo> : null}
        </div>
        {aviso ? <p className="pc-nota">{aviso}</p> : null}
        <p className="pc-nota">
          <button type="button" className="pc-link botao" onClick={() => { limpar(); setSemTomador(true); }}>Nota sem tomador</button>
          {" · "}Tomador no exterior? Use a <Link className="pc-link" href="/contribuinte/dps/novo/pessoas">emissão completa</Link>.
        </p>
      </>}
    </Cartao>

    <Cartao titulo="Serviço">
      {nacional ? <SeletorServicoNacional catalogo={nacional.catalogo} usados={nacional.usados} competencia={competencia} erros={erros}
        inicial={nacional.usados.find((item) => item.id === modeloId) ?? null} aoEscolherCodigo={trocarDescricaoPadrao} />
        : <Campo rotulo="Serviço" obrigatorio erro={erros.servico} id="servico" largura="inteira">
          <select id="servico" name="servico" className="pc-input" value={modeloId} onChange={(e) => escolherServico(e.target.value)}>
            <option value="">Selecione</option>
            {servicos.map((item) => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} - ` : ""}{item.descricaoCodigo ?? item.nome}</option>)}
          </select>
        </Campo>}
      <div className="pc-grade">
        <Campo rotulo="Descrição do serviço" obrigatorio erro={erros.descricao} id="descricao" largura="inteira">
          <textarea id="descricao" name="descricao" rows={3} maxLength={DESCRICAO_MAX} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <Campo rotulo="Valor do serviço (R$)" obrigatorio erro={erros.valor} id="valor" largura="terco">
          <input id="valor" name="valor" inputMode="numeric" className="num" placeholder="0,00" value={valor} onChange={(e) => setValor(mascaraValor(e.target.value))} />
        </Campo>
      </div>
    </Cartao>

    <details className="pc-mais-opcoes" open={temMaisOpcoes || erroEmMaisOpcoes || undefined}>
      <summary>Mais opções <small>competência, IBS/CBS, intermediário, descontos, retenções federais e informações complementares</small></summary>
      <Cartao titulo="Competência e IBS/CBS">
        <div className="pc-grade">
          <Campo rotulo="Data de competência" obrigatorio erro={erros.competencia} id="competencia" largura="terco">
            <input id="competencia" name="competencia" type="date" max={hoje} value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </Campo>
          <fieldset className="pc-opcoes pc-campo meia">
            <legend>Informar IBS/CBS?</legend>
            <label><input type="checkbox" name="ibsCbs" value="SIM" checked={informarIbsCbs || ibsCbsObrigatorio} disabled={ibsCbsObrigatorio} onChange={(e) => setInformarIbsCbs(e.target.checked)} /> {ibsCbsObrigatorio ? "Sim (obrigatório para esta competência)" : "Sim"}</label>
          </fieldset>
        </div>
        {informarIbsCbs || ibsCbsObrigatorio ? <CamposIbsCbs inicial={inicial.ibsCbs} erros={erros} prefixo="ibs_" /> : null}
      </Cartao>
      <Intermediario inicial={inicial.intermediario} erros={erros} />
      <Cartao titulo="Descontos">
        <div className="pc-grade">
          <Campo rotulo="Desconto incondicionado (R$)" erro={erros.descIncond} id="descIncond" largura="terco"><input id="descIncond" name="descIncond" inputMode="numeric" className="num" placeholder="0,00" value={descIncond} onChange={(e) => setDescIncond(mascaraValor(e.target.value))} /></Campo>
          <Campo rotulo="Desconto condicionado (R$)" erro={erros.descCond} id="descCond" largura="terco"><input id="descCond" name="descCond" inputMode="numeric" className="num" placeholder="0,00" value={descCond} onChange={(e) => setDescCond(mascaraValor(e.target.value))} /></Campo>
        </div>
      </Cartao>
      <TributacaoFederal inicial={inicial.federal} valorServico={valor} descIncond={descIncond} erros={erros} regime={regime} />
      <InformacoesComplementares inicial={inicial.complemento ?? {}} erros={erros} />
    </details>

    <Rodape><button className="pc-botao destaque" type="submit" disabled={salvando}>{salvando ? "Conferindo…" : "Revisar e emitir"}</button></Rodape>

    {historico ? <UltimosTomadores tomadores={tomadores.filter((item) => !item.exterior)} onEscolher={usarSalvo} onFechar={() => setHistorico(false)} /> : null}
  </form>;
}
