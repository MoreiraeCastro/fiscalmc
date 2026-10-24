"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { History, LoaderCircle, Search, X } from "lucide-react";
import { consultarTomador, salvarPessoas, type EstadoPasso } from "@/app/contribuinte/dps/actions";
import { formatarDocumento } from "@/lib/contribuinte/formato";
import type { TomadorSalvo } from "@/lib/contribuinte/emissao";
import type { IntermediarioRascunho } from "@/lib/contribuinte/dps";
import paises from "@/lib/contribuinte/paises.json";
import type { CnpjLookupCustomer } from "@/lib/nfse/cnpj-lookup";
import { Cartao } from "./portal-shell";
import { Campo, FaixaValidacao, Leitura, Rodape } from "./campos";

export type EmitenteResumo = { razaoSocial: string; cnpj: string; municipio: string; inscricaoMunicipal: string | null; opcaoSimples: string; apuracaoSimples: string | null; email: string | null; telefone: string | null; endereco: string };

type Inicial = { competencia: string; tomador: { clienteId: string; documento: string | null; nome: string; exterior?: boolean } | null; semTomador: boolean; informarIbsCbs: boolean; intermediario: IntermediarioRascunho | null };
type Onde = "BRASIL" | "EXTERIOR" | "NAO_INFORMADO";
const NOME_PAIS = new Map(paises.map((item) => [item.codigo, item.nome]));

/** Máscara de CPF (até 11 dígitos) ou CNPJ enquanto digita. */
export function mascaraDocumento(texto: string) {
  const d = texto.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})$/, "$1.$2.$3/$4-$5");
}

export function FormPessoas({ rascunhoId, inicial, emitente, tomadores, hoje, ibsCbsObrigatorioDesde }: { rascunhoId: string | null; inicial: Inicial; emitente: EmitenteResumo; tomadores: TomadorSalvo[]; hoje: string; ibsCbsObrigatorioDesde: string }) {
  const [estado, enviar, salvando] = useActionState<EstadoPasso, FormData>(salvarPessoas.bind(null, rascunhoId), { erros: {} });
  const [competencia, setCompetencia] = useState(inicial.competencia);
  const [informarIbsCbs, setInformarIbsCbs] = useState(inicial.informarIbsCbs);
  // Mesma regra do servidor (ibsCbsObrigatorio): a partir desta competência não dá para emitir sem IBS/CBS.
  const ibsCbsObrigatorio = Boolean(competencia) && competencia >= ibsCbsObrigatorioDesde;
  const ibsCbsPermitido = Boolean(competencia) && competencia >= "2025-12-01";
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
  const [onde, setOnde] = useState<Onde>(inicial.semTomador ? "NAO_INFORMADO" : inicial.tomador?.exterior ? "EXTERIOR" : "BRASIL");
  const semTomador = onde === "NAO_INFORMADO";
  const exterior = onde === "EXTERIOR";
  // Tomador no exterior já salvo (do histórico ou do rascunho): mostra só o resumo.
  const [exteriorSalvo, setExteriorSalvo] = useState<{ documento: string | null; nome: string; pais?: string } | null>(inicial.tomador?.exterior ? { documento: inicial.tomador.documento, nome: inicial.tomador.nome } : null);
  const erros = estado.erros;
  // Razão social que veio do cartão CNPJ fica travada (só muda trocando o CNPJ).
  const nomeDaReceita = !clienteId && Boolean(endereco?.legalName);

  function usarSalvo(item: TomadorSalvo) {
    if (item.exterior) {
      setOnde("EXTERIOR"); setClienteId(item.id); setExteriorSalvo({ documento: item.documento, nome: item.nome, pais: item.exterior.pais }); setHistorico(false);
      return;
    }
    setOnde("BRASIL"); setExteriorSalvo(null);
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
        <fieldset className="pc-opcoes pc-campo terco">
          <legend>Preencher as informações IBS/CBS?<span className="pc-obrigatorio"> *</span></legend>
          <label><input type="radio" name="ibsCbs" value="SIM" checked={informarIbsCbs || ibsCbsObrigatorio} disabled={!ibsCbsPermitido} onChange={() => setInformarIbsCbs(true)} /> Sim</label>
          <label className={ibsCbsObrigatorio ? "desativado" : undefined}><input type="radio" name="ibsCbs" value="NAO" checked={!informarIbsCbs && !ibsCbsObrigatorio} disabled={ibsCbsObrigatorio} onChange={() => setInformarIbsCbs(false)} /> Não</label>
        </fieldset>
      </div>
      {competencia ? <div className="pc-aviso">{ibsCbsObrigatorio
        ? <>Para esta competência as informações de <strong>IBS/CBS</strong> (reforma tributária) são <strong>obrigatórias</strong>: você vai informá-las no passo Serviço.</>
        : <>O IBS/CBS (reforma tributária) é <strong>permitido</strong> para competências a partir de 01/12/2025 e <strong>obrigatório</strong> a partir de {ibsCbsObrigatorioDesde.split("-").reverse().join("/")}.</>}</div> : null}
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
        <label><input type="radio" name="onde" value="BRASIL" checked={onde === "BRASIL"} onChange={() => { setOnde("BRASIL"); if (exteriorSalvo) { setClienteId(""); setExteriorSalvo(null); } }} /> Brasil</label>
        <label><input type="radio" name="onde" value="EXTERIOR" checked={exterior} onChange={() => { setOnde("EXTERIOR"); if (!exteriorSalvo) limpar(); }} /> Exterior</label>
        <label><input type="radio" name="onde" value="NAO_INFORMADO" checked={semTomador} onChange={() => setOnde("NAO_INFORMADO")} /> Tomador/Adquirente não informado</label>
      </fieldset>
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="endereco" value={endereco ? JSON.stringify(endereco) : ""} />
      {semTomador ? <p className="pc-nota">A NFS-e sai sem tomador. Use só quando não houver tomador identificado.</p> : exterior ? <>
        {exteriorSalvo && clienteId ? <div className="pc-grade">
          <Leitura rotulo="NIF" valor={exteriorSalvo.documento ?? "Não informado"} largura="terco" />
          <Leitura rotulo="Nome/Razão Social" valor={exteriorSalvo.nome} largura="meia" />
          {exteriorSalvo.pais ? <Leitura rotulo="País" valor={NOME_PAIS.get(exteriorSalvo.pais) ?? exteriorSalvo.pais} largura="terco" /> : null}
          <div className="pc-campo inteira"><button type="button" className="pc-link botao" onClick={() => { setClienteId(""); setExteriorSalvo(null); }}>Trocar tomador</button></div>
        </div> : <TomadorExterior erros={erros} />}
        <button type="button" className="pc-link botao" onClick={() => setHistorico(true)}><History size={15} aria-hidden /> Últimos Tomadores</button>
        <p className="pc-nota">Tomador no exterior: no passo Serviço você informa os dados de comércio exterior, exigidos pela Receita.</p>
      </> : <>
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

    <Intermediario inicial={inicial.intermediario} erros={erros} />

    <Rodape><button className="pc-botao" type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Avançar"}</button></Rodape>

    {historico ? <UltimosTomadores tomadores={tomadores} onEscolher={usarSalvo} onFechar={() => setHistorico(false)} /> : null}
  </form>;
}

export function UltimosTomadores({ tomadores, onEscolher, onFechar }: { tomadores: TomadorSalvo[]; onEscolher: (t: TomadorSalvo) => void; onFechar: () => void }) {
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
          {lista.slice(0, 100).map((t) => <tr key={t.id} className="clicavel" onClick={() => onEscolher(t)}><td className="nowrap">{t.exterior ? `${NOME_PAIS.get(t.exterior.pais) ?? t.exterior.pais}${t.documento ? ` · NIF ${t.documento}` : ""}` : formatarDocumento(t.documento)}</td><td>{t.nome}</td></tr>)}
        </tbody></table> : <p className="pc-vazio">{tomadores.length ? "Nenhum tomador encontrado." : "Nenhum tomador salvo ainda para esta empresa."}</p>}
      </div>
    </div>
  </div>;
}

const VAZIO_EXTERIOR = { nifInformado: "SIM", nif: "", motivo: "", nome: "", email: "", pais: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "", estado: "" };

/** Tomador no exterior: NIF (ou o motivo de não ter), nome e endereço no exterior, como no Emissor Nacional. */
function TomadorExterior({ erros }: { erros: Record<string, string> }) {
  const [dados, setDados] = useState(VAZIO_EXTERIOR);
  const campo = (nome: keyof typeof VAZIO_EXTERIOR) => ({ id: `ext_${nome}`, name: `ext_${nome}`, value: dados[nome], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDados((atual) => ({ ...atual, [nome]: e.target.value })) });
  return <div className="pc-grade">
    <fieldset className="pc-opcoes pc-campo terco">
      <legend>O NIF será informado?<span className="pc-obrigatorio"> *</span></legend>
      <label><input type="radio" name="ext_nifInformado" value="SIM" checked={dados.nifInformado === "SIM"} onChange={() => setDados((atual) => ({ ...atual, nifInformado: "SIM" }))} /> Sim</label>
      <label><input type="radio" name="ext_nifInformado" value="NAO" checked={dados.nifInformado === "NAO"} onChange={() => setDados((atual) => ({ ...atual, nifInformado: "NAO" }))} /> Não</label>
    </fieldset>
    {dados.nifInformado === "SIM"
      ? <Campo rotulo="NIF" obrigatorio erro={erros.nif} dica="Número de identificação fiscal no país do tomador." id="ext_nif" largura="terco"><input maxLength={40} autoComplete="off" {...campo("nif")} /></Campo>
      : <Campo rotulo="Motivo da não informação do NIF" obrigatorio erro={erros.motivo} id="ext_motivo" largura="terco">
        <select className="pc-input" {...campo("motivo")}><option value="">Selecione</option><option value="1">Dispensado do NIF</option><option value="2">Não exigência do NIF</option></select>
      </Campo>}
    <Campo rotulo="Nome/Razão Social" obrigatorio erro={erros.nome} id="ext_nome" largura="meia"><input maxLength={300} {...campo("nome")} /></Campo>
    <Campo rotulo="E-mail" erro={erros.email} id="ext_email" largura="meia"><input type="email" maxLength={80} {...campo("email")} /></Campo>
    <Campo rotulo="País" obrigatorio erro={erros.pais} id="ext_pais" largura="meia">
      <select className="pc-input" {...campo("pais")}><option value="">Selecione</option>{paises.map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}</select>
    </Campo>
    <Campo rotulo="Logradouro" obrigatorio erro={erros.logradouro} id="ext_logradouro" largura="meia"><input maxLength={255} {...campo("logradouro")} /></Campo>
    <Campo rotulo="Número" obrigatorio erro={erros.numero} id="ext_numero" largura="terco"><input maxLength={60} {...campo("numero")} /></Campo>
    <Campo rotulo="Complemento" erro={erros.complemento} id="ext_complemento" largura="terco"><input maxLength={156} {...campo("complemento")} /></Campo>
    <Campo rotulo="Bairro" obrigatorio erro={erros.bairro} id="ext_bairro" largura="terco"><input maxLength={60} {...campo("bairro")} /></Campo>
    <Campo rotulo="Cidade" obrigatorio erro={erros.cidade} id="ext_cidade" largura="terco"><input maxLength={60} {...campo("cidade")} /></Campo>
    <Campo rotulo="Código de Endereçamento Postal" obrigatorio erro={erros.cep} id="ext_cep" largura="terco"><input maxLength={11} {...campo("cep")} /></Campo>
    <Campo rotulo="Estado, província ou região" obrigatorio erro={erros.estado} id="ext_estado" largura="terco"><input maxLength={60} {...campo("estado")} /></Campo>
  </div>;
}

/** Intermediário do serviço no Brasil (CPF/CNPJ); o CNPJ puxa a razão social do cartão CNPJ e ela fica travada. */
export function Intermediario({ inicial, erros }: { inicial: IntermediarioRascunho | null; erros: Record<string, string> }) {
  const [informar, setInformar] = useState(Boolean(inicial));
  const [documento, setDocumento] = useState(inicial ? formatarDocumento(inicial.documento) : "");
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [email, setEmail] = useState(inicial?.email ?? "");
  const [travado, setTravado] = useState(Boolean(inicial && inicial.documento.length === 14));
  const [aviso, setAviso] = useState("");
  const [consultando, iniciarConsulta] = useTransition();
  function pesquisar(valor: string) {
    iniciarConsulta(async () => {
      const resposta = await consultarTomador(valor);
      const cnpj = valor.replace(/\D/g, "").length === 14;
      if (resposta.receita) { setNome(resposta.receita.legalName); setTravado(Boolean(resposta.receita.legalName)); setAviso("Razão social do cartão CNPJ (Receita)."); return; }
      if (resposta.salvo) { setNome(resposta.salvo.nome); setTravado(cnpj); setAviso(""); return; }
      setAviso(resposta.erro ?? "CPF: informe o nome.");
    });
  }
  return <Cartao titulo="Intermediário do serviço">
    <fieldset className="pc-opcoes">
      <legend>Onde está localizado o estabelecimento/domicílio?<span className="pc-obrigatorio"> *</span></legend>
      <label><input type="radio" name="intermOnde" value="BRASIL" checked={informar} onChange={() => setInformar(true)} /> Brasil</label>
      <label className="desativado" title="Ainda não disponível no nosso emissor"><input type="radio" disabled /> Exterior <small>em breve</small></label>
      <label><input type="radio" name="intermOnde" value="NAO_INFORMADO" checked={!informar} onChange={() => setInformar(false)} /> Intermediário não informado</label>
    </fieldset>
    {informar ? <div className="pc-grade">
      <Campo rotulo="CPF/CNPJ" obrigatorio erro={erros.intermDocumento} id="intermDocumento" largura="terco">
        <div className="pc-com-botoes">
          <input id="intermDocumento" name="intermDocumento" inputMode="numeric" autoComplete="off" value={documento}
            onChange={(e) => {
              const valor = mascaraDocumento(e.target.value);
              setDocumento(valor); setAviso("");
              if (travado) { setTravado(false); setNome(""); }
              if (valor.replace(/\D/g, "").length === 14) pesquisar(valor);
            }}
            onBlur={() => { if (!nome && documento.replace(/\D/g, "").length === 11) pesquisar(documento); }} />
          <button type="button" className="pc-icone-botao" title="Pesquisar" aria-label="Pesquisar CPF/CNPJ do intermediário" onClick={() => pesquisar(documento)} disabled={consultando || !documento}>{consultando ? <LoaderCircle className="spin" size={17} aria-hidden /> : <Search size={17} aria-hidden />}</button>
        </div>
      </Campo>
      <Campo rotulo="Nome/Razão Social" obrigatorio erro={erros.intermNome} id="intermNome" largura="meia">
        <input id="intermNome" name="intermNome" maxLength={300} value={nome} readOnly={travado} title={travado ? "Razão social do cartão CNPJ (Receita): não pode ser alterada" : undefined} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Campo rotulo="E-mail" erro={erros.intermEmail} id="intermEmail" largura="terco"><input id="intermEmail" name="intermEmail" type="email" maxLength={80} value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
      {aviso ? <p className="pc-nota pc-campo inteira">{aviso}</p> : null}
    </div> : null}
  </Cartao>;
}
