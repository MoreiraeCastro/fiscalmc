"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { buscarNbs, opcoesDoCodigo, type OpcoesDoCodigo } from "@/app/contribuinte/dps/actions";
import type { NbsCandidate } from "@/lib/organizations/nbs-activity-resolver";
import { Campo } from "./campos";

export type CodigoNacionalOpcao = { id: string; codigo: string; descricao: string };
/** Serviço que a empresa já usa, para aparecer primeiro e para reabrir o rascunho com o que foi escolhido. */
export type ServicoUsado = { id: string; codigoNacionalId: string | null; codigoMunicipal: string | null; nbs: string | null; automatico: boolean };

const MAX_LISTA = 60;

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
  const [buscaNbs, setBuscaNbs] = useState("");
  const [outrasNbs, setOutrasNbs] = useState<NbsCandidate[]>([]);
  const [consultando, iniciar] = useTransition();
  const [buscandoNbs, iniciarNbs] = useTransition();

  const escolhido = catalogo.find((item) => item.id === codigoId) ?? null;
  const idsUsados = useMemo(() => new Set(usados.map((item) => item.codigoNacionalId)), [usados]);
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const digitos = busca.replace(/\D/g, "");
    const filtrados = termo ? catalogo.filter((item) => item.descricao.toLocaleLowerCase("pt-BR").includes(termo) || (digitos.length >= 2 && item.codigo.replace(/\D/g, "").startsWith(digitos))) : catalogo;
    // Os que a empresa já usa vêm primeiro.
    return [...filtrados.filter((item) => idsUsados.has(item.id)), ...filtrados.filter((item) => !idsUsados.has(item.id))].slice(0, MAX_LISTA);
  }, [busca, catalogo, idsUsados]);

  function consultar(id: string, manterEscolhas: boolean) {
    iniciar(async () => {
      const resultado = await opcoesDoCodigo(id, competencia);
      setResposta(resultado);
      if (manterEscolhas) return;
      setCodigoMunicipal(resultado.opcoes?.length === 1 ? resultado.opcoes[0].code : "");
      setNbs(resultado.nbs?.length === 1 ? resultado.nbs[0].nbsCode : "");
    });
  }

  useEffect(() => {
    if (inicial?.codigoNacionalId) consultar(inicial.codigoNacionalId, true);
    // Só ao abrir: reconsulta o código do rascunho para mostrar o complemento e as NBS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function escolher(item: CodigoNacionalOpcao) {
    if (item.id === codigoId) return;
    setCodigoId(item.id);
    setResposta(null);
    setOutrasNbs([]);
    setBuscaNbs("");
    aoEscolherCodigo(item.descricao);
    consultar(item.id, false);
  }

  function pesquisarNbs() {
    const termo = buscaNbs.trim();
    if (termo.length < 2) return;
    iniciarNbs(async () => setOutrasNbs(await buscarNbs(termo)));
  }

  const existente = resposta?.existente;
  const listaNbs = [...(resposta?.nbs ?? []), ...outrasNbs.filter((item) => !resposta?.nbs?.some((sugerida) => sugerida.nbsCode === item.nbsCode))];
  const nbsEscolhidaFora = nbs && !listaNbs.some((item) => item.nbsCode === nbs);

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
      : existente ? <div className="pc-aviso">Este código já está configurado pelo escritório para esta empresa ({existente.codigoMunicipal ? `código complementar ${existente.codigoMunicipal}, ` : ""}NBS {existente.nbs ?? "—"}). A emissão usa essa configuração.</div>
      : resposta?.opcoes ? <div className="pc-grade">
        <Campo rotulo="Código Complementar Municipal" obrigatorio erro={erros.codigoMunicipal} id="codigoMunicipal" largura="meia">
          {resposta.opcoes.length ? <select id="codigoMunicipal" className="pc-input" value={codigoMunicipal} onChange={(e) => setCodigoMunicipal(e.target.value)}>
            {resposta.opcoes.length > 1 ? <option value="">Selecione</option> : null}
            {resposta.opcoes.map((opcao) => <option key={opcao.code} value={opcao.code}>{opcao.code} · ISS {aliquota(opcao.rateBasisPoints)}{opcao.incidence !== "SIM" ? " · sem incidência" : ""}</option>)}
          </select> : <div className="pc-aviso alerta">O município não tem este código nos parâmetros nacionais. Escolha outro código ou peça ao escritório para configurar.</div>}
        </Campo>
        <Campo rotulo="Item da NBS correspondente" obrigatorio erro={erros.nbs} id="nbs" largura="meia">
          <select id="nbs" className="pc-input" value={nbs} onChange={(e) => setNbs(e.target.value)}>
            <option value="">{listaNbs.length ? "Selecione" : "Pesquise abaixo"}</option>
            {nbsEscolhidaFora ? <option value={nbs}>{nbs}</option> : null}
            {listaNbs.map((item) => <option key={item.nbsCode} value={item.nbsCode}>{item.nbsDisplayCode} - {item.nbsDescription}</option>)}
          </select>
          <div className="pc-linha-busca">
            <input className="pc-input" placeholder="Procurar outra NBS" value={buscaNbs} onChange={(e) => setBuscaNbs(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pesquisarNbs(); } }} />
            <button type="button" className="pc-botao secundario" onClick={pesquisarNbs} disabled={buscandoNbs}>{buscandoNbs ? "Buscando…" : "Buscar"}</button>
          </div>
        </Campo>
      </div> : null : null}
  </>;
}
