import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileCode2 } from "lucide-react";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { BotaoImprimir } from "@/components/contribuinte/acoes-nota";
import { apiUrl } from "@/lib/base-path";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { recebidaPorId } from "@/lib/contribuinte/recebidas";
import { RETENCAO_ISSQN, TRIBUTACAO_ISSQN } from "@/lib/contribuinte/emissao";
import { formatarData, formatarDataHora, formatarDocumento, formatarValor } from "@/lib/contribuinte/formato";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";
import { lerNfseOficial, type EnderecoOficial, type PessoaOficial } from "@/lib/contribuinte/nfse-oficial";

export const metadata = { title: "Visualizar NFS-e recebida" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPCAO_SIMPLES: Record<string, string> = { "1": "Não Optante", "2": "Optante - MEI", "3": "Optante - ME/EPP" };

function enderecoTexto(endereco: EnderecoOficial | null | undefined) {
  if (!endereco) return "—";
  return [[endereco.logradouro, endereco.numero, endereco.complemento].filter(Boolean).join(", "), endereco.bairro, endereco.municipio ? nomeMunicipio(endereco.municipio) : null, endereco.cep ? `CEP ${endereco.cep}` : null].filter(Boolean).join(" · ") || "—";
}
function rs(centavos: number | null | undefined) {
  return centavos === null || centavos === undefined ? "—" : `R$ ${formatarValor(centavos)}`;
}
function pct(valor: string | null | undefined) {
  return valor ? `${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—";
}

function Pessoa({ titulo, pessoa }: { titulo: string; pessoa: PessoaOficial | null }) {
  return <Cartao titulo={titulo}>
    {pessoa ? <dl className="pc-resumo">
      <div><dt>Nome / Razão social</dt><dd>{pessoa.nome ?? "—"}</dd></div>
      <div><dt>CPF / CNPJ / NIF</dt><dd>{pessoa.documento ? formatarDocumento(pessoa.documento) : "—"}</dd></div>
      <div><dt>Inscrição municipal</dt><dd>{pessoa.inscricaoMunicipal ?? "—"}</dd></div>
      <div><dt>Endereço</dt><dd>{enderecoTexto(pessoa.endereco)}</dd></div>
    </dl> : <p className="pc-vazio">Não informado.</p>}
  </Cartao>;
}

/** Visualizar NFS-e recebida: o XML distribuído pelo ADN, só leitura (quem cancela ou substitui é o prestador). */
export default async function VisualizarRecebida({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { empresa }] = await Promise.all([params, exigirEmpresa()]);
  if (!UUID.test(id)) notFound();
  const nota = await recebidaPorId(empresa.id, id);
  if (!nota) notFound();
  const oficial = lerNfseOficial(nota.xml);

  return <>
    <Trilha itens={[["NFS-e Recebidas", "/contribuinte/notas/recebidas"], nota.nfse_number ? `Nº ${nota.nfse_number}` : "Visualizar"]} />
    <div className="pc-barra-acoes pc-nao-imprime">
      <Link className="pc-botao secundario" href="/contribuinte/notas/recebidas"><ArrowLeft size={16} aria-hidden />Voltar</Link>
      <a className="pc-botao secundario" href={apiUrl(`/api/contribuinte/recebidas/${nota.id}/xml`)} title="Download XML"><FileCode2 size={16} aria-hidden />XML</a>
      <a className="pc-botao secundario" href={apiUrl(`/api/contribuinte/recebidas/${nota.id}/pdf`)} title="Download DANFS-e"><Download size={16} aria-hidden />PDF</a>
      <BotaoImprimir />
    </div>

    {nota.cancelled_at ? <Aviso tipo="erro"><strong>Esta NFS-e foi cancelada pelo prestador</strong> em {formatarDataHora(nota.cancelled_at)}.</Aviso> : null}
    {nota.role === "INTERMEDIARIO" ? <Aviso>A empresa aparece nesta nota como <strong>intermediária</strong> do serviço.</Aviso> : null}
    {!oficial ? <Aviso tipo="alerta">Não foi possível ler o XML desta nota. Baixe o XML ou o PDF para conferir.</Aviso> : null}

    <div className="pc-grade-2">
      <Cartao titulo="Identificação da NFS-e" acoes={<span className={`pc-situacao ${nota.cancelled_at ? "erro" : "ok"}`}><i aria-hidden />{nota.cancelled_at ? "Cancelada" : "NFS-e Gerada"}</span>}>
        <dl className="pc-resumo">
          <div><dt>Chave de acesso</dt><dd className="mono">{nota.access_key}</dd></div>
          <div><dt>Número</dt><dd>{nota.nfse_number ?? "—"}</dd></div>
          <div><dt>Data de geração</dt><dd>{formatarDataHora(oficial?.dataProcessamento ?? nota.generated_at)}</dd></div>
          <div><dt>Local de emissão</dt><dd>{oficial?.localEmissao ?? "—"}</dd></div>
        </dl>
      </Cartao>
      <Cartao titulo="Identificação da DPS">
        <dl className="pc-resumo">
          <div><dt>Número / Série</dt><dd>{oficial?.dps.numero ?? "—"} / {oficial?.dps.serie ?? "—"}</dd></div>
          <div><dt>Data de emissão</dt><dd>{formatarDataHora(oficial?.dps.emitidaEm)}</dd></div>
          <div><dt>Competência</dt><dd>{formatarData(oficial?.dps.competencia)}</dd></div>
        </dl>
      </Cartao>
    </div>

    {oficial ? <>
      <Pessoa titulo="Prestador (emitente)" pessoa={oficial.emitente} />
      <Cartao titulo="Situação do prestador">
        <dl className="pc-resumo"><div><dt>Situação no Simples Nacional</dt><dd>{oficial.regime.opcaoSimples ? OPCAO_SIMPLES[oficial.regime.opcaoSimples] ?? oficial.regime.opcaoSimples : "—"}</dd></div></dl>
      </Cartao>
      <Pessoa titulo="Tomador" pessoa={oficial.tomador} />
      {oficial.intermediario ? <Pessoa titulo="Intermediário" pessoa={oficial.intermediario} /> : null}
      <Cartao titulo="Serviço">
        <dl className="pc-resumo">
          <div><dt>Código de tributação nacional</dt><dd>{oficial.servico.codigoNacional ?? "—"}{oficial.descricaoTributacaoNacional ? ` - ${oficial.descricaoTributacaoNacional}` : ""}</dd></div>
          <div><dt>Código municipal</dt><dd>{oficial.servico.codigoMunicipal ?? "—"}</dd></div>
          <div><dt>NBS</dt><dd>{oficial.servico.nbs ?? "—"}</dd></div>
          <div><dt>Local da prestação</dt><dd>{oficial.localPrestacao ?? "—"}</dd></div>
          <div><dt>Descrição</dt><dd style={{ whiteSpace: "pre-wrap" }}>{oficial.servico.descricao ?? "—"}</dd></div>
        </dl>
      </Cartao>
      <Cartao titulo="Valores e tributação municipal">
        <dl className="pc-resumo">
          <div><dt>Valor do serviço</dt><dd>{rs(oficial.valores.servico)}</dd></div>
          <div><dt>Tributação do ISSQN</dt><dd>{oficial.tributacao.tributacaoIssqn ? TRIBUTACAO_ISSQN[oficial.tributacao.tributacaoIssqn] ?? oficial.tributacao.tributacaoIssqn : "—"}</dd></div>
          <div><dt>Município de incidência</dt><dd>{oficial.localIncidencia ?? "—"}</dd></div>
          <div><dt>Retenção do ISSQN</dt><dd>{oficial.tributacao.retencao ? RETENCAO_ISSQN[oficial.tributacao.retencao] ?? oficial.tributacao.retencao : "—"}</dd></div>
          <div><dt>Base de cálculo</dt><dd>{rs(oficial.valores.baseCalculo)}</dd></div>
          <div><dt>Alíquota</dt><dd>{pct(oficial.valores.aliquotaAplicada)}</dd></div>
          <div><dt>ISSQN</dt><dd>{rs(oficial.valores.issqn)}</dd></div>
          <div><dt>Total retido</dt><dd>{rs(oficial.valores.totalRetido)}</dd></div>
          <div><dt>Valor líquido</dt><dd><strong>{rs(oficial.valores.liquido)}</strong></dd></div>
        </dl>
      </Cartao>
    </> : null}
  </>;
}
