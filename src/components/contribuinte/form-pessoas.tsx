"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { History, LoaderCircle, Search, X } from "lucide-react";
import { consultarTomador, salvarPessoas, type EstadoPasso } from "@/app/contribuinte/dps/actions";
import { formatarDocumento } from "@/lib/contribuinte/formato";
import type { TomadorSalvo } from "@/lib/contribuinte/emissao";
import type { CnpjLookupCustomer } from "@/lib/nfse/cnpj-lookup";
import { Cartao } from "./portal-shell";
import { Campo, FaixaValidacao, Leitura, Rodape } from "./campos";

export type EmitenteResumo = { razaoSocial: string; cnpj: string; municipio: string; inscricaoMunicipal: string | null; opcaoSimples: string; apuracaoSimples: string | null; email: string | null; telefone: string | null; endereco: string };

type Inicial = { competencia: string; tomador: { clienteId: string; documento: string | null; nome: string } | null; semTomador: boolean };

/** Máscara de CPF (até 11 dígitos) ou CNPJ enquanto digita. */
function mascaraDocumento(texto: string) {
  const d = texto.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})$/, "$1.$2.$3/$4-$5");
}

export function FormPessoas({ rascunhoId, inicial, emitente, tomadores, hoje }: { rascunhoId: string | null; inicial: Inicial; emitente: EmitenteResumo; tomadores: TomadorSalvo[]; hoje: string }) {
  const [estado, enviar, salvando] = useActionState<EstadoPasso, FormData>(salvarPessoas.bind(null, rascunhoId), { erros: {} });
  const [competencia, setCompetencia] = useState(inicial.competencia);
  const [detalhes, setDetalhes] = useState(false);
  // Tomador escolhido (já salvo) ou digitado (novo).
  const [clienteId, setClienteId] = useState(inicial.tomador?.clienteId ?? "");
  const [documento, setDocumento] = useState(inicial.tomador?.documento ? formatarDocumento(inicial.tomador.documento) : "");
  const [nome, setNome] = useState(inicial.tomador?.nome ?? "");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState<CnpjLookupCustomer | null>(null);
  const [aviso, setAviso] = useState("");
  const [consultando, iniciarConsulta] = useTransition();
  const [historico, setHistorico] = useState(false);
  const [semTomador, setSemTomador] = useState(inicial.semTomador);
  const erros = estado.erros;
  // Razão social que veio do cartão CNPJ fica travada (só muda trocando o CNPJ).
  const nomeDaReceita = !clienteId && Boolean(endereco?.legalName);

  function usarSalvo(item: TomadorSalvo) {
    setClienteId(item.id); setDocumento(formatarDocumento(item.documento)); setNome(item.nome);
    setEmail(item.email ?? ""); setTelefone(item.telefone ?? ""); setEndereco(null); setAviso(""); setHistorico(false);
  }
  function limpar() {
    setClienteId(""); setDocumento(""); setNome(""); setEmail(""); setTelefone(""); setEndereco(null); setAviso("");
  }
  function pesquisar(valor = documento) {
    if (!valor.trim()) return;
    iniciarConsulta(async () => {
      const resposta = await consultarTomador(valor);
      if (resposta.salvo) { usarSalvo(resposta.salvo); setAviso("Tomador já cadastrado para esta empresa."); return; }
      setClienteId("");
      if (resposta.receita) {
        setNome(resposta.receita.legalName); setEmail(resposta.receita.email); setTelefone(resposta.receita.phone); setEndereco(resposta.receita);
        setAviso(resposta.receita.situacaoCadastral && resposta.receita.situacaoCadastral !== "ATIVA" ? `Atenção: situação cadastral na Receita = ${resposta.receita.situacaoCadastral}.` : "Dados preenchidos com a base pública da Receita.");
        return;
      }
      setEndereco(null);
      setAviso(resposta.erro ?? "CPF não cadastrado: informe o nome.");
    });
  }

  return <form action={enviar} className="pc-form" noValidate>
    <FaixaValidacao erros={erros} mensagem={estado.mensagem} />
    <Cartao titulo="Informações gerais">
      <div className="pc-grade">
        <Campo rotulo="Data de Competência" obrigatorio erro={erros.competencia} id="competencia" largura="terco">
          <input id="competencia" name="competencia" type="date" max={hoje} value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </Campo>
        <Leitura rotulo="Preencher as informações IBS/CBS?" valor="Não" largura="terco" />
      </div>
      {competencia ? <div className="pc-aviso">O IBS/CBS (reforma tributária) é <strong>opcional</strong> para competências a partir de 01/12/2025 e será <strong>obrigatório</strong> a partir de 01/01/2027. O nosso emissor ainda não envia IBS/CBS; isso entra antes de 2027.</div> : null}
    </Cartao>

    <Cartao titulo="Emitente da NFS-e">
      <div className="pc-grade">
        <Leitura rotulo="Você irá emitir esta NFS-e como?" valor="Prestador/Fornecedor" largura="terco" />
        <Leitura rotulo="Município" valor={emitente.municipio} largura="terco" />
        <Leitura rotulo="Indicador Municipal" valor={emitente.inscricaoMunicipal} largura="terco" />
        <Leitura rotulo="CNPJ" valor={formatarDocumento(emitente.cnpj)} largura="terco" />
        <Leitura rotulo="Razão Social" valor={emitente.razaoSocial} largura="inteira" />
        <Leitura rotulo="Opção no Simples Nacional" valor={emitente.opcaoSimples} largura="meia" />
        {emitente.apuracaoSimples ? <Leitura rotulo="Regime de Apuração dos Tributos no SN" valor={emitente.apuracaoSimples} largura="meia" /> : null}
      </div>
      <button type="button" className="pc-link botao" onClick={() => setDetalhes((v) => !v)}>{detalhes ? "Ocultar detalhes do emitente" : "Exibir detalhes do emitente"}</button>
      {detalhes ? <div className="pc-grade">
        <Leitura rotulo="Telefone" valor={emitente.telefone} largura="terco" />
        <Leitura rotulo="E-mail" valor={emitente.email} largura="terco" />
        <Leitura rotulo="Endereço" valor={emitente.endereco} largura="inteira" />
      </div> : null}
    </Cartao>

    <Cartao titulo="Tomador/Adquirente do serviço">
      <fieldset className="pc-opcoes">
        <legend>Onde está localizado o estabelecimento/domicílio?<span className="pc-obrigatorio"> *</span></legend>
        <label><input type="radio" name="onde" value="BRASIL" checked={!semTomador} onChange={() => setSemTomador(false)} /> Brasil</label>
        <label className="desativado" title="Ainda não disponível no nosso emissor"><input type="radio" disabled /> Exterior <small>em breve</small></label>
        <label><input type="radio" name="onde" value="NAO_INFORMADO" checked={semTomador} onChange={() => setSemTomador(true)} /> Tomador/Adquirente não informado</label>
      </fieldset>
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="endereco" value={endereco ? JSON.stringify(endereco) : ""} />
      {semTomador ? <p className="pc-nota">A NFS-e sai sem tomador. Use só quando não houver tomador identificado.</p> : <>
      <div className="pc-grade">
        <Campo rotulo="CPF/CNPJ" obrigatorio erro={erros.documento ?? erros.tomador} id="documento" largura="meia">
          <div className="pc-com-botoes">
            <input id="documento" name="documento" inputMode="numeric" autoComplete="off" value={documento} readOnly={Boolean(clienteId)}
              onChange={(e) => {
                const valor = mascaraDocumento(e.target.value);
                setDocumento(valor); setAviso("");
                if (endereco) { setEndereco(null); setNome(""); setEmail(""); setTelefone(""); }
                // CNPJ completo: puxa o cartão CNPJ (razão social, contato e endereço) na hora, sem precisar da lupa.
                if (valor.replace(/\D/g, "").length === 14) pesquisar(valor);
              }}
              onBlur={() => { if (!clienteId && !nome && documento.replace(/\D/g, "").length === 11) pesquisar(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pesquisar(); } }} />
            {clienteId ? <button type="button" className="pc-icone-botao" title="Trocar tomador" aria-label="Trocar tomador" onClick={limpar}><X size={17} aria-hidden /></button>
              : <button type="button" className="pc-icone-botao" title="Pesquisar" aria-label="Pesquisar CPF/CNPJ" onClick={() => pesquisar()} disabled={consultando}>{consultando ? <LoaderCircle className="spin" size={17} aria-hidden /> : <Search size={17} aria-hidden />}</button>}
            <button type="button" className="pc-icone-botao" title="Últimos Tomadores" aria-label="Últimos Tomadores" onClick={() => setHistorico(true)}><History size={17} aria-hidden /></button>
          </div>
        </Campo>
        <Campo rotulo="Nome/Razão Social" obrigatorio erro={erros.nome} id="nome" largura="meia">
          <input id="nome" name="nome" value={nome} readOnly={Boolean(clienteId) || nomeDaReceita} title={nomeDaReceita ? "Razão social do cartão CNPJ (Receita): não pode ser alterada" : undefined} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        {!clienteId ? <>
          <Campo rotulo="Telefone" id="telefone" largura="terco"><input id="telefone" name="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Campo>
          <Campo rotulo="E-mail" erro={erros.email} id="email" largura="meia"><input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        </> : null}
      </div>
      {aviso ? <p className="pc-nota">{aviso}</p> : null}
      {endereco && !clienteId ? <p className="pc-nota">Endereço: {[endereco.street, endereco.addressNumber, endereco.addressComplement, endereco.neighborhood].filter(Boolean).join(", ")} · CEP {endereco.postalCode} · {endereco.state}</p> : null}
      {!clienteId && nome && documento ? <p className="pc-nota">Ao avançar, este tomador fica salvo para as próximas notas da empresa.</p> : null}
      </>}
    </Cartao>

    <Cartao titulo="Intermediário do serviço">
      <p className="pc-texto">Intermediário não informado. <span className="pc-mudo">(O nosso emissor ainda não envia intermediário.)</span></p>
    </Cartao>

    <Rodape><button className="pc-botao" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Avançar"}</button></Rodape>

    {historico ? <UltimosTomadores tomadores={tomadores} onEscolher={usarSalvo} onFechar={() => setHistorico(false)} /> : null}
  </form>;
}

function UltimosTomadores({ tomadores, onEscolher, onFechar }: { tomadores: TomadorSalvo[]; onEscolher: (t: TomadorSalvo) => void; onFechar: () => void }) {
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const digitos = termo.replace(/\D/g, "");
    return termo ? tomadores.filter((t) => t.nome.toLocaleLowerCase("pt-BR").includes(termo) || (digitos.length >= 3 && (t.documento ?? "").includes(digitos))) : tomadores;
  }, [busca, tomadores]);
  return <div className="pc-janela-fundo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
    <div className="pc-janela" role="dialog" aria-modal aria-labelledby="historico-titulo">
      <header><h2 id="historico-titulo">Histórico</h2><button type="button" className="pc-icone-botao" onClick={onFechar} aria-label="Fechar"><X size={18} aria-hidden /></button></header>
      <input className="pc-input" autoFocus placeholder="Pesquisar por nome, CPF ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="pc-janela-lista">
        {lista.length ? <table className="pc-tabela"><thead><tr><th>CPF/CNPJ</th><th>Nome/Razão Social</th></tr></thead><tbody>
          {lista.slice(0, 100).map((t) => <tr key={t.id} className="clicavel" onClick={() => onEscolher(t)}><td className="nowrap">{formatarDocumento(t.documento)}</td><td>{t.nome}</td></tr>)}
        </tbody></table> : <p className="pc-vazio">{tomadores.length ? "Nenhum tomador encontrado." : "Nenhum tomador salvo ainda para esta empresa."}</p>}
      </div>
    </div>
  </div>;
}
