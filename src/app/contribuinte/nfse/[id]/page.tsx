import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileCode2, FilePlus2, FileText } from "lucide-react";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { SituacaoNota } from "@/components/contribuinte/tabela-notas";
import { BotaoImprimir, BotaoSubstituir, CancelarNfse, ConsultarCancelamento, SolicitarCancelamento } from "@/components/contribuinte/acoes-nota";
import { apiUrl } from "@/lib/base-path";
import { exigirEmpresa, rotasLegadas } from "@/lib/contribuinte/contexto";
import { MOTIVOS_CANCELAMENTO, MOTIVOS_SUBSTITUICAO } from "@/lib/contribuinte/dps";
import { RETENCAO_ISSQN, TRIBUTACAO_ISSQN } from "@/lib/contribuinte/emissao";
import { formatarCompetencia, formatarData, formatarDataHora, formatarDocumento, formatarValor } from "@/lib/contribuinte/formato";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";
import { AMBIENTE_GERADOR, lerNfseOficial, SITUACAO_NFSE, type EnderecoOficial } from "@/lib/contribuinte/nfse-oficial";
import { relationOne } from "@/lib/presentation/relations";
import { downloadAuthorizedFiscalArtifact } from "@/lib/nfse/artifacts/download";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Visualizar NFS-e" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ABAS = [["nfse", "NFS-e"], ["pessoas", "Pessoas"], ["servico", "Serviço"], ["eventos", "Eventos"]] as const;
const OPCAO_SIMPLES: Record<string, string> = { "1": "Não Optante", "2": "Optante - MEI", "3": "Optante - ME/EPP" };

function enderecoTexto(endereco: EnderecoOficial | null | undefined) {
  if (!endereco) return "—";
  return [[endereco.logradouro, endereco.numero, endereco.complemento].filter(Boolean).join(", "), endereco.bairro, endereco.municipio ? nomeMunicipio(endereco.municipio) : null, endereco.cep ? `CEP ${endereco.cep}` : null].filter(Boolean).join(" · ") || "—";
}
function pct(valor: string | null | undefined) {
  return valor ? `${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—";
}
function rs(centavos: number | null | undefined) {
  return centavos === null || centavos === undefined ? "—" : `R$ ${formatarValor(centavos)}`;
}

/** Visualizar NFS-e, como /Notas/Visualizar do portal: barra de ações, identificação, abas e eventos. */
export default async function VisualizarNfse({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; emitida?: string; acao?: string; erro?: string }> }) {
  const [{ id }, filtros, { empresa, escritorio }] = await Promise.all([params, searchParams, exigirEmpresa()]);
  if (!UUID.test(id)) notFound();
  const db = createAdminClient();
  const [{ data: nota }, { data: pedidos }, { data: substituta }] = await Promise.all([
    db.from("invoices").select("id,status,access_key,nfse_number,dps_number,dps_series,amount_cents,service_date,description,issued_at,created_at,cancelled_at,environment,safe_status_message,substitutes_invoice_id,substitution_reason_code,substitution_reason,customers(legal_name,tax_id,email,phone,street,address_number,address_complement,neighborhood,municipality_code,postal_code),service_templates(name,nbs_code,service_location_municipality_code,national_service_codes(display_code,description))")
      .eq("organization_id", empresa.id).eq("id", id).maybeSingle(),
    db.from("cancellation_requests").select("id,status,reason,technical_reason_code,review_note,created_at,attempted_at,completed_at").eq("organization_id", empresa.id).eq("invoice_id", id).order("created_at", { ascending: false }).limit(5),
    db.from("invoices").select("id,status,nfse_number,access_key,created_at").eq("organization_id", empresa.id).eq("substitutes_invoice_id", id).in("status", ["ISSUED", "UNKNOWN", "SUBMITTING"]).maybeSingle(),
  ]);
  if (!nota) notFound();
  const original = nota.substitutes_invoice_id
    ? (await db.from("invoices").select("id,nfse_number,access_key").eq("organization_id", empresa.id).eq("id", nota.substitutes_invoice_id).maybeSingle()).data
    : null;

  const gerada = nota.status === "ISSUED" || nota.status === "CANCELLED";
  let oficial = null;
  if (gerada) {
    try {
      const arquivo = await downloadAuthorizedFiscalArtifact({ invoiceId: nota.id, organizationId: empresa.id, artifactType: "NFSE_XML", nfseNumber: nota.nfse_number });
      if (arquivo) oficial = lerNfseOficial(new TextDecoder().decode(await arquivo.body.arrayBuffer()));
    } catch { oficial = null; }
  }
  const tomadorCadastro = relationOne(nota.customers);
  const modelo = relationOne(nota.service_templates);
  const codigo = relationOne(modelo?.national_service_codes);
  const rotas = rotasLegadas(escritorio);
  const aba = ABAS.some(([chave]) => chave === filtros.aba) ? filtros.aba! : "nfse";
  const pedidoAberto = (pedidos ?? []).find((p) => ["REQUESTED", "UNDER_REVIEW", "APPROVED"].includes(p.status));
  const pedidoIncerto = (pedidos ?? []).find((p) => p.status === "UNKNOWN" || p.status === "PROCESSING");
  const substituida = nota.status === "CANCELLED" && substituta?.status === "ISSUED";
  const eventosLiberados = process.env.ENABLE_NFSE_EVENTS === "true";
  const producao = nota.environment === "PRODUCTION";
  const podeAgir = nota.status === "ISSUED" && !substituta && empresa.podeEmitir;

  return <>
    <Trilha itens={[["NFS-e", "/contribuinte/notas/emitidas"], nota.nfse_number ? `Nº ${nota.nfse_number}` : "Visualizar"]} />
    <div className="pc-barra-acoes pc-nao-imprime">
      <Link className="pc-botao" href="/contribuinte/nova"><FilePlus2 size={16} aria-hidden />Nova NFS-e</Link>
      <Link className="pc-botao secundario" href="/contribuinte/notas/emitidas"><ArrowLeft size={16} aria-hidden />Voltar</Link>
      {gerada ? <a className="pc-botao secundario" href={apiUrl(rotas.documento(nota.id, "NFSE_XML"))} title="Download XML"><FileCode2 size={16} aria-hidden />XML</a> : null}
      {gerada ? <a className="pc-botao secundario" href={apiUrl(rotas.documento(nota.id, "PDF"))} title="Download DANFS-e"><Download size={16} aria-hidden />PDF</a> : null}
      <BotaoImprimir />
      <Link className="pc-botao secundario" href="/contribuinte/notas/emitidas"><FileText size={16} aria-hidden />NFS-e Emitidas</Link>
      <span className="pc-espaco" />
      {podeAgir ? <BotaoSubstituir notaId={nota.id} liberado={eventosLiberados} /> : null}
      {podeAgir && escritorio && !pedidoIncerto ? <CancelarNfse notaId={nota.id} liberado={eventosLiberados} producao={producao} motivoSugerido={pedidoAberto?.reason} abrir={filtros.acao === "cancelar"} /> : null}
      {podeAgir && !escritorio && !pedidoAberto && !pedidoIncerto ? <SolicitarCancelamento notaId={nota.id} /> : null}
    </div>

    {filtros.emitida && nota.status === "ISSUED" ? <Aviso tipo="sucesso"><strong>A NFS-e foi gerada com sucesso.</strong></Aviso> : null}
    {filtros.erro === "substituicao" ? <Aviso tipo="erro">Não foi possível abrir a substituição desta nota.</Aviso> : null}
    {nota.status === "UNKNOWN" || nota.status === "SUBMITTING" ? <Aviso tipo="alerta"><strong>Estamos confirmando a situação desta NFS-e com a Receita.</strong> Não emita de novo: a confirmação é automática.</Aviso> : null}
    {nota.status === "REJECTED" ? <Aviso tipo="erro"><strong>A NFS-e não foi autorizada.</strong> {nota.safe_status_message ?? ""}</Aviso> : null}
    {substituida ? <Aviso tipo="erro"><strong>NFS-e cancelada por substituição.</strong> Substituta: <Link className="pc-link" href={`/contribuinte/nfse/${substituta!.id}`}>NFS-e nº {substituta!.nfse_number ?? "—"}</Link>.</Aviso>
      : nota.status === "CANCELLED" ? <Aviso tipo="erro"><strong>Esta NFS-e foi cancelada</strong>{nota.cancelled_at ? ` em ${formatarDataHora(nota.cancelled_at)}` : ""}.</Aviso> : null}
    {substituta && substituta.status !== "ISSUED" ? <Aviso tipo="alerta">Há uma substituta em confirmação: <Link className="pc-link" href={`/contribuinte/nfse/${substituta.id}`}>ver</Link>.</Aviso> : null}
    {original ? <Aviso>Esta NFS-e substitui a <Link className="pc-link" href={`/contribuinte/nfse/${original.id}`}>NFS-e nº {original.nfse_number ?? "—"}</Link>.</Aviso> : null}
    {pedidoIncerto ? <Aviso tipo="alerta"><strong>Cancelamento enviado sem resposta da SEFIN.</strong> Confirme antes de tentar de novo.{escritorio ? <ConsultarCancelamento notaId={nota.id} /> : null}</Aviso> : null}
    {pedidoAberto ? <Aviso tipo="alerta"><strong>Cancelamento solicitado pelo cliente</strong> em {formatarDataHora(pedidoAberto.created_at)}: “{pedidoAberto.reason}”.{escritorio ? " Use Cancelar NFS-e para transmitir." : " O escritório vai conferir."}</Aviso> : null}
    {nota.environment !== "PRODUCTION" ? <Aviso>Nota de <strong>Produção Restrita</strong> (teste, sem valor fiscal).</Aviso> : null}

    <div className="pc-grade-2">
      <Cartao titulo="Identificação da NFS-e" acoes={<SituacaoNota status={nota.status} />}>
        <dl className="pc-resumo">
          <div><dt>Chave de acesso</dt><dd className="mono">{nota.access_key ?? "—"}</dd></div>
          <div><dt>Número</dt><dd>{nota.nfse_number ?? "—"}</dd></div>
          <div><dt>Data de geração</dt><dd>{formatarDataHora(oficial?.dataProcessamento ?? nota.issued_at ?? nota.created_at)}</dd></div>
        </dl>
      </Cartao>
      <Cartao titulo="Identificação da DPS">
        <dl className="pc-resumo">
          <div><dt>Número / Série</dt><dd>{oficial?.dps.numero ?? nota.dps_number ?? "—"} / {oficial?.dps.serie ?? nota.dps_series ?? "—"}</dd></div>
          <div><dt>Data de emissão</dt><dd>{formatarDataHora(oficial?.dps.emitidaEm ?? nota.created_at)}</dd></div>
          <div><dt>Competência</dt><dd>{formatarData(oficial?.dps.competencia ?? nota.service_date)}</dd></div>
        </dl>
      </Cartao>
    </div>

    <nav className="pc-abas pc-nao-imprime" aria-label="Seções da NFS-e">
      {ABAS.map(([chave, rotulo]) => <Link key={chave} href={`/contribuinte/nfse/${nota.id}?aba=${chave}`} className={aba === chave ? "ativa" : undefined}>{rotulo}</Link>)}
    </nav>

    {aba === "nfse" ? <>
      <Cartao titulo="Emitente">
        <dl className="pc-resumo">
          <div><dt>Razão social</dt><dd>{oficial?.emitente.nome ?? empresa.razaoSocial}</dd></div>
          <div><dt>CNPJ</dt><dd>{formatarDocumento(oficial?.emitente.documento ?? empresa.cnpj)}</dd></div>
          <div><dt>Inscrição municipal</dt><dd>{oficial?.emitente.inscricaoMunicipal ?? "—"}</dd></div>
          <div><dt>Situação no Simples Nacional</dt><dd>{oficial?.regime.opcaoSimples ? OPCAO_SIMPLES[oficial.regime.opcaoSimples] ?? oficial.regime.opcaoSimples : "—"}</dd></div>
          <div><dt>Endereço</dt><dd>{enderecoTexto(oficial?.emitente.endereco)}</dd></div>
        </dl>
      </Cartao>
      <Cartao titulo="Tributação municipal">
        <dl className="pc-resumo">
          <div><dt>Tributação do ISSQN</dt><dd>{oficial?.tributacao.tributacaoIssqn ? TRIBUTACAO_ISSQN[oficial.tributacao.tributacaoIssqn] : "—"}</dd></div>
          <div><dt>Município de incidência</dt><dd>{oficial?.localIncidencia ?? "—"}</dd></div>
          <div><dt>Retenção do ISSQN</dt><dd>{oficial?.tributacao.retencao ? RETENCAO_ISSQN[oficial.tributacao.retencao] : "—"}</dd></div>
          <div><dt>Valor do serviço</dt><dd>{rs(oficial?.valores.servico ?? nota.amount_cents)}</dd></div>
          <div><dt>Base de cálculo</dt><dd>{rs(oficial?.valores.baseCalculo)}</dd></div>
          <div><dt>Alíquota aplicada</dt><dd>{pct(oficial?.valores.aliquotaAplicada)}</dd></div>
          <div><dt>ISSQN</dt><dd>{rs(oficial?.valores.issqn)}</dd></div>
          <div><dt>Total retido</dt><dd>{rs(oficial?.valores.totalRetido)}</dd></div>
          <div><dt>Valor líquido</dt><dd><strong>{rs(oficial?.valores.liquido)}</strong></dd></div>
        </dl>
      </Cartao>
      <Cartao titulo="Outras informações">
        <dl className="pc-resumo">
          <div><dt>Situação da NFS-e</dt><dd>{oficial?.situacao ? SITUACAO_NFSE[oficial.situacao] ?? oficial.situacao : "—"}</dd></div>
          <div><dt>Ambiente gerador</dt><dd>{oficial?.ambienteGerador ? AMBIENTE_GERADOR[oficial.ambienteGerador] ?? oficial.ambienteGerador : "—"}</dd></div>
          <div><dt>Versão da aplicação</dt><dd>{oficial?.versaoAplicacao ?? "—"}</dd></div>
          <div><dt>Município emissor</dt><dd>{oficial?.localEmissao ?? nomeMunicipio(empresa.municipio)}</dd></div>
        </dl>
        {gerada && !oficial ? <p className="pc-nota">O XML oficial ainda não está guardado aqui; alguns campos aparecem quando a Receita devolver o documento.</p> : null}
      </Cartao>
    </> : null}

    {aba === "pessoas" ? <>
      <Cartao titulo="Prestador / Emitente">
        <dl className="pc-resumo">
          <div><dt>CNPJ</dt><dd>{formatarDocumento(empresa.cnpj)}</dd></div>
          <div><dt>Razão social</dt><dd>{empresa.razaoSocial}</dd></div>
          <div><dt>Endereço</dt><dd>{enderecoTexto(oficial?.emitente.endereco)}</dd></div>
        </dl>
      </Cartao>
      <Cartao titulo="Tomador">
        <dl className="pc-resumo">
          <div><dt>CPF/CNPJ</dt><dd>{formatarDocumento(oficial?.tomador?.documento ?? tomadorCadastro?.tax_id) || "—"}</dd></div>
          <div><dt>Nome/Razão social</dt><dd>{oficial?.tomador?.nome ?? tomadorCadastro?.legal_name ?? "—"}</dd></div>
          <div><dt>E-mail</dt><dd>{oficial?.tomador?.email ?? tomadorCadastro?.email ?? "—"}</dd></div>
          <div><dt>Telefone</dt><dd>{oficial?.tomador?.telefone ?? tomadorCadastro?.phone ?? "—"}</dd></div>
          <div><dt>Endereço</dt><dd>{oficial?.tomador ? enderecoTexto(oficial.tomador.endereco) : tomadorCadastro ? enderecoTexto({ logradouro: tomadorCadastro.street, numero: tomadorCadastro.address_number, complemento: tomadorCadastro.address_complement, bairro: tomadorCadastro.neighborhood, municipio: tomadorCadastro.municipality_code, uf: null, cep: tomadorCadastro.postal_code }) : "—"}</dd></div>
        </dl>
      </Cartao>
      <Cartao titulo="Intermediário"><p className="pc-texto">Não informado.</p></Cartao>
    </> : null}

    {aba === "servico" ? <Cartao titulo="Serviço prestado">
      <dl className="pc-resumo">
        <div><dt>Código de tributação nacional</dt><dd>{codigo ? `${codigo.display_code} - ${oficial?.descricaoTributacaoNacional ?? codigo.description}` : oficial?.descricaoTributacaoNacional ?? modelo?.name ?? "—"}</dd></div>
        <div><dt>Código municipal</dt><dd>{oficial?.servico.codigoMunicipal ?? "—"}{oficial?.descricaoTributacaoMunicipal ? ` - ${oficial.descricaoTributacaoMunicipal}` : ""}</dd></div>
        <div><dt>Item da NBS</dt><dd>{oficial?.servico.nbs ?? modelo?.nbs_code ?? "—"}{oficial?.descricaoNbs ? ` - ${oficial.descricaoNbs}` : ""}</dd></div>
        <div><dt>Local da prestação</dt><dd>{oficial?.localPrestacao ?? nomeMunicipio(modelo?.service_location_municipality_code ?? empresa.municipio)}</dd></div>
        <div><dt>Competência</dt><dd>{formatarCompetencia(nota.service_date)}</dd></div>
        <div><dt>Descrição</dt><dd className="pre">{oficial?.servico.descricao ?? nota.description}</dd></div>
      </dl>
    </Cartao> : null}

    {aba === "eventos" ? <Cartao titulo="Eventos">
      {!(pedidos ?? []).length && !substituta && !original ? <p className="pc-vazio">Nenhum evento registrado para esta NFS-e.</p> : null}
      <ul className="pc-eventos">
        {original ? <li><strong>Substitui a NFS-e nº {original.nfse_number ?? "—"}</strong><span>Motivo: {nota.substitution_reason_code ? `${nota.substitution_reason_code} - ${MOTIVOS_SUBSTITUICAO[nota.substitution_reason_code as keyof typeof MOTIVOS_SUBSTITUICAO] ?? ""}` : "—"}{nota.substitution_reason ? ` · ${nota.substitution_reason}` : ""}</span><span className="mono">Chave substituída: {original.access_key}</span></li> : null}
        {substituta ? <li><strong>Cancelamento por substituição</strong><span>Substituta: <Link className="pc-link" href={`/contribuinte/nfse/${substituta.id}`}>NFS-e nº {substituta.nfse_number ?? "em confirmação"}</Link> · {formatarDataHora(substituta.created_at)}</span></li> : null}
        {(pedidos ?? []).map((p) => <li key={p.id}>
          <strong>{p.status === "CANCELLED" ? "Cancelamento de NFS-e (evento 101101)" : p.status === "REJECTED" ? "Cancelamento não registrado" : p.status === "UNKNOWN" || p.status === "PROCESSING" ? "Cancelamento em confirmação" : p.status === "DENIED" ? "Pedido de cancelamento negado" : "Pedido de cancelamento"}</strong>
          <span>{formatarDataHora(p.completed_at ?? p.attempted_at ?? p.created_at)}{p.technical_reason_code ? ` · ${MOTIVOS_CANCELAMENTO[p.technical_reason_code as keyof typeof MOTIVOS_CANCELAMENTO] ?? p.technical_reason_code}` : ""}</span>
          <span>{p.reason}</span>
          {p.review_note ? <span className="pc-mudo">{p.review_note}</span> : null}
          {p.status === "CANCELLED" ? <a className="pc-link" href={apiUrl(rotas.documento(nota.id, "CANCELLATION_EVENT_XML"))}>Baixar XML do evento</a> : null}
        </li>)}
      </ul>
    </Cartao> : null}
  </>;
}
