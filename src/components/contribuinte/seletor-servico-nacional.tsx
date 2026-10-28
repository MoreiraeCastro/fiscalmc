"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { opcoesDoCodigo, todasNbs, type OpcoesDoCodigo } from "@/app/contribuinte/dps/actions";
import type { NbsCandidate } from "@/lib/organizations/nbs-activity-resolver";
import { Campo } from "./campos";

export type CodigoNacionalOpcao = { id: string; codigo: string; descricao: string };
/** Serviço que a empresa já usa, para aparecer primeiro e para reabrir o rascunho com o que foi escolhido. */
export type ServicoUsado = { id: string; codigoNacionalId: string | null; codigoMunicipal: string | null; nbs: string | null; automatico: boolean };

const MAX_LISTA = 60;

const semAcento = (texto: string) => texto.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function aliquota(bp: number) {
  return `${(bp / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/**
 * Passo 2 como no Emissor Nacional: "Código de Tributação Nacional" (lista completa com busca) → "Código Complementar Municipal"
 * (parâmetros do município no ADN) → "Item da NBS". Escreve os campos ocultos que salvarServico usa para montar o serviço da empresa.
 */
export function SeletorServicoNacional({ catalogo, usados, inicial, competencia, erros, aoEscolherCodigo }: {
  catalogo: CodigoNacionalOpcao[];
  usados: ServicoUsado[];
  inicial: ServicoUsado | null;
  competencia: string;
  erros: Record<string, string>;
  /** Avisa o formulário para trocar a descrição padrão. */
  aoEscolherCodigo: (descricao: string) => void;
}) {
  const [codigoId, setCodigoId] = useState(inicial?.codigoNacionalId ?? "");
  const [busca, setBusca] = useState("");
  const [resposta, setResposta] = useState<OpcoesDoCodigo | null>(null);
  const [codigoMunicipal, setCodigoMunicipal] = useState(inicial?.automatico ? inicial.codigoMunicipal ?? "" : "");
  const [nbs, setNbs] = useState(inicial?.automatico ? inicial.nbs ?? "" : "");
  const [filtroNbs, setFiltroNbs] = useState("");
  const [todas, setTodas] = useState<NbsCandidate[] | null>(null);
  const [tabelaInteira, setTabelaInteira] = useState(false);
  const [consultando, iniciar] = useTransition();

  const escolhido = catalogo.find((item) => item.id === codigoId) ?? null;
  const idsUsados = useMemo(() => new Set(usados.map((item) => item.codigoNacionalId)), [usados]);
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const digitos = busca.replace(/\D/g, "");
    const filtrados = termo ? catalogo.filter((item) => item.descricao.toLocaleLowerCase("pt-BR").includes(termo) || (digitos.length >= 2 && item.codigo.replace(/\D/g, "").startsWith(digitos))) : catalogo;
    // Os que a empresa já usa vêm primeiro.
    return [...filtrados.filter((item) => idsUsados.has(item.id)), ...filtrados.filter((item) => !idsUsados.has(item.id))].slice(0, MAX_LISTA);
  }, [busca, catalogo, idsUsados]);

  // A NBS nunca é marcada sozinha: quem emite escolhe na tabela inteira (as sugeridas para o código vêm primeiro).
  function consultar(id: string, manterEscolhas: boolean, outraNbs = false) {
    iniciar(async () => {
      const resultado = await opcoesDoCodigo(id, competencia, outraNbs);
      setResposta(resultado);
      if (manterEscolhas) return;
      setCodigoMunicipal(resultado.opcoes?.length === 1 ? resultado.opcoes[0].code : "");
      setNbs("");
    });
  }

  useEffect(() => {
    if (inicial?.codigoNacionalId) consultar(inicial.codigoNacionalId, true);
    // Só ao abrir: reconsulta o código do rascunho para mostrar o complemento e as NBS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tabela NBS inteira (≈900 itens) só vem se pedirem, e uma vez só.
  useEffect(() => {
    if (!tabelaInteira || todas) return;
    let vivo = true;
    todasNbs().then((lista) => { if (vivo) setTodas(lista); });
    return () => { vivo = false; };
  }, [tabelaInteira, todas]);

  function escolher(item: CodigoNacionalOpcao) {
    if (item.id === codigoId) return;
    setCodigoId(item.id);
    setResposta(null);
    setFiltroNbs("");
    setTabelaInteira(false);
    aoEscolherCodigo(item.descricao);
    consultar(item.id, false);
  }

  const existente = resposta?.existente;
  // Lista do serviço: as NBS do mesmo grupo da correlação oficial (as oficiais primeiro); a tabela inteira só se pedirem.
  const doServico = useMemo(() => resposta?.nbs ?? [], [resposta]);
  const sugeridas = useMemo(() => new Set(doServico.filter((item) => item.oficial).map((item) => item.nbsCode)), [doServico]);
  const listaNbs = useMemo(() => {
    const base = tabelaInteira && todas ? todas : doServico;
    const termo = semAcento(filtroNbs.trim());
    const digitos = filtroNbs.replace(/\D/g, "");
    const filtradas = termo ? base.filter((item) => semAcento(item.nbsDescription).includes(termo) || (digitos.length >= 2 && item.nbsCode.startsWith(digitos))) : base;
    return [...filtradas.filter((item) => sugeridas.has(item.nbsCode)), ...filtradas.filter((item) => !sugeridas.has(item.nbsCode))];
  }, [todas, tabelaInteira, doServico, filtroNbs, sugeridas]);
  const nbsEscolhida = [...doServico, ...(todas ?? [])].find((item) => item.nbsCode === nbs) ?? null;

  return <>
    {existente ? <input type="hidden" name="servico" value={existente.id} /> : <>
      <input type="hidden" name="servico" value="" />
      <input type="hidden" name="codigoNacional" value={codigoId} />
      <input type="hidden" name="codigoMunicipal" value={codigoMunicipal} />
      <input type="hidden" name="nbs" value={nbs} />
    </>}
    <Campo rotulo="Código de Tributação Nacional" obrigatorio erro={erros.servico} id="busca-servico" largura="inteira">
      <input id="busca-servico" className="pc-input" placeholder="Pesquisar código ou descrição (ex.: 17.19 ou contabilidade)" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="pc-lista-servicos" role="radiogroup" aria-label="Código de Tributação Nacional">
        {escolhido && !visiveis.some((item) => item.id === escolhido.id) ? <label className="escolhido">
          <input type="radio" name="_codigo" checked readOnly />
          <span><strong>{escolhido.codigo} - {escolhido.descricao}</strong></span>
        </label> : null}
        {visiveis.map((item) => <label key={item.id} className={item.id === codigoId ? "escolhido" : undefined}>
          <input type="radio" name="_codigo" checked={item.id === codigoId} onChange={() => escolher(item)} />
          <span><strong>{item.codigo} - {item.descricao}</strong>{idsUsados.has(item.id) ? <small>Já usado por esta empresa</small> : null}</span>
        </label>)}
        {!visiveis.length ? <p className="pc-vazio">Nenhum código encontrado.</p> : null}
      </div>
    </Campo>

    {codigoId ? consultando && !resposta ? <p className="pc-nota">Consultando os parâmetros do município…</p>
      : resposta?.erro ? <div className="pc-aviso alerta">{resposta.erro}</div>
      : existente ? <div className="pc-aviso">Este código já está configurado pelo escritório para esta empresa ({existente.codigoMunicipal ? `código complementar ${existente.codigoMunicipal}, ` : ""}NBS {existente.nbs ?? "—"}). A emissão usa essa configuração.
        <div className="pc-acoes"><button type="button" className="pc-botao secundario" disabled={consultando} onClick={() => consultar(codigoId, false, true)}>{consultando ? "Abrindo…" : "Usar outra NBS nesta nota"}</button></div></div>
      : resposta?.opcoes ? <div className="pc-grade">
        <Campo rotulo="Código Complementar Municipal" obrigatorio erro={erros.codigoMunicipal} id="codigoMunicipal" largura="meia">
          {resposta.opcoes.length ? <select id="codigoMunicipal" className="pc-input" value={codigoMunicipal} onChange={(e) => setCodigoMunicipal(e.target.value)}>
            {resposta.opcoes.length > 1 ? <option value="">Selecione</option> : null}
            {resposta.opcoes.map((opcao) => <option key={opcao.code} value={opcao.code}>{opcao.code} · ISS {aliquota(opcao.rateBasisPoints)}{opcao.incidence !== "SIM" ? " · sem incidência" : ""}</option>)}
          </select> : <div className="pc-aviso alerta">O município não tem este código nos parâmetros nacionais. Escolha outro código ou peça ao escritório para configurar.</div>}
        </Campo>
        <Campo rotulo="Item da NBS" obrigatorio erro={erros.nbs} id="busca-nbs" largura="inteira">
          <input id="busca-nbs" className="pc-input" placeholder="Digite o código (ex.: 1.2301.99.00) ou parte da descrição" value={filtroNbs} onChange={(e) => setFiltroNbs(e.target.value)} />
          <p className="pc-nota">{nbsEscolhida ? <>Escolhida: <strong>{nbsEscolhida.nbsDisplayCode} - {nbsEscolhida.nbsDescription}</strong></> : nbs ? <>Escolhida: <strong>{nbs}</strong></> : tabelaInteira ? "Tabela NBS inteira." : "NBS possíveis para este serviço. A da correspondência oficial vem primeiro."}</p>
          <div className="pc-lista-servicos" role="radiogroup" aria-label="Item da NBS">
            {listaNbs.map((item) => <label key={item.nbsCode} className={item.nbsCode === nbs ? "escolhido" : undefined}>
              <input type="radio" name="_nbs" checked={item.nbsCode === nbs} onChange={() => setNbs(item.nbsCode)} />
              <span><strong>{item.nbsDisplayCode} - {item.nbsDescription}</strong>{sugeridas.has(item.nbsCode) ? <small>Correspondência oficial</small> : null}</span>
            </label>)}
            {tabelaInteira && !todas ? <p className="pc-nota">Carregando a tabela NBS inteira…</p> : !listaNbs.length ? <p className="pc-vazio">Nenhuma NBS encontrada{tabelaInteira ? "" : " neste grupo"}.</p> : null}
          </div>
          <button type="button" className="pc-link" onClick={() => setTabelaInteira((valor) => !valor)}>{tabelaInteira ? "Voltar às NBS deste serviço" : "Não achou? Procurar em toda a tabela NBS"}</button>
        </Campo>
      </div> : null : null}
  </>;
}
