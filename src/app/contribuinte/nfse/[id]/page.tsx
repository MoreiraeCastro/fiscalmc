import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Eye, FileCode2, FilePlus2, FileText } from "lucide-react";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { SituacaoNota } from "@/components/contribuinte/tabela-notas";
import { apiUrl } from "@/lib/base-path";
import { exigirEmpresa, rotasLegadas } from "@/lib/contribuinte/contexto";
import { formatarCompetencia, formatarDataHora, formatarDocumento, formatarValor } from "@/lib/contribuinte/formato";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";
import { relationOne } from "@/lib/presentation/relations";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "NFS-e" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tela depois do Emitir (como /DPS/NFSe do portal): faixa verde + resumo + Baixar XML/DANFSe. */
export default async function NfsePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { empresa, escritorio }] = await Promise.all([params, exigirEmpresa()]);
  if (!UUID.test(id)) notFound();
  const { data: nota } = await createAdminClient().from("invoices")
    .select("id,status,access_key,nfse_number,dps_number,dps_series,amount_cents,service_date,description,issued_at,created_at,environment,safe_status_message,customers(legal_name,tax_id),service_templates(name,national_tax_code,national_service_codes(display_code,description))")
    .eq("organization_id", empresa.id).eq("id", id).maybeSingle();
  if (!nota) notFound();
  const tomador = relationOne(nota.customers);
  const modelo = relationOne(nota.service_templates);
  const codigo = relationOne(modelo?.national_service_codes);
  const rotas = rotasLegadas(escritorio);
  const gerada = nota.status === "ISSUED" || nota.status === "CANCELLED";
  return <>
    <Trilha itens={[["NFS-e", "/contribuinte/notas/emitidas"], nota.nfse_number ? `Nº ${nota.nfse_number}` : "Emissão"]} />
    {nota.status === "ISSUED" ? <Aviso tipo="sucesso"><strong>A NFS-e foi gerada com sucesso.</strong></Aviso>
      : nota.status === "UNKNOWN" || nota.status === "SUBMITTING" ? <Aviso tipo="alerta"><strong>Estamos confirmando a situação desta NFS-e com a Receita.</strong> Não emita de novo: a confirmação é automática e aparece em NFS-e Emitidas.</Aviso>
      : nota.status === "REJECTED" ? <Aviso tipo="erro"><strong>A NFS-e não foi autorizada.</strong> {nota.safe_status_message ?? ""}</Aviso>
      : nota.status === "CANCELLED" ? <Aviso tipo="erro"><strong>Esta NFS-e foi cancelada.</strong></Aviso> : null}
    {nota.environment !== "PRODUCTION" ? <Aviso>Nota de <strong>Produção Restrita</strong> (teste, sem valor fiscal).</Aviso> : null}
    <Cartao titulo="Resumo da NFS-e" acoes={<SituacaoNota status={nota.status} />}>
      <dl className="pc-resumo">
        <div><dt>Chave de Acesso</dt><dd className="mono">{nota.access_key ?? "—"}</dd></div>
        <div><dt>Número da NFS-e</dt><dd>{nota.nfse_number ?? "—"}</dd></div>
        <div><dt>DPS</dt><dd>Série {nota.dps_series ?? "—"} · Nº {nota.dps_number ?? "—"}</dd></div>
        <div><dt>Data de geração</dt><dd>{formatarDataHora(nota.issued_at ?? nota.created_at)}</dd></div>
        <div><dt>Município Gerador</dt><dd>{nomeMunicipio(empresa.municipio)}</dd></div>
        <div><dt>Competência</dt><dd>{formatarCompetencia(nota.service_date)}</dd></div>
        <div><dt>Emitente</dt><dd>{formatarDocumento(empresa.cnpj)} - {empresa.razaoSocial}</dd></div>
        <div><dt>Tomador</dt><dd>{tomador ? `${formatarDocumento(tomador.tax_id)} - ${tomador.legal_name}` : "—"}</dd></div>
        <div><dt>Intermediário</dt><dd>Não informado</dd></div>
        <div><dt>Serviço</dt><dd>{codigo ? `${codigo.display_code} - ${codigo.description}` : modelo?.name ?? "—"}</dd></div>
        <div><dt>Descrição</dt><dd className="pre">{nota.description}</dd></div>
        <div><dt>Valor do serviço</dt><dd>R$ {formatarValor(nota.amount_cents)}</dd></div>
      </dl>
    </Cartao>
    <div className="pc-acoes">
      {gerada ? <a className="pc-botao secundario" href={apiUrl(rotas.documento(nota.id, "NFSE_XML"))}><FileCode2 size={16} aria-hidden />Baixar XML</a> : null}
      {gerada ? <a className="pc-botao secundario" href={apiUrl(rotas.documento(nota.id, "PDF"))}><Download size={16} aria-hidden />Baixar DANFSe</a> : null}
      <Link className="pc-botao secundario" href={rotas.visualizar(nota.id)}><Eye size={16} aria-hidden />Visualizar NFS-e</Link>
      <Link className="pc-botao secundario" href="/contribuinte/notas/emitidas"><FileText size={16} aria-hidden />NFS-e emitidas</Link>
      <Link className="pc-botao" href="/contribuinte/nova"><FilePlus2 size={16} aria-hidden />Nova NFS-e</Link>
    </div>
  </>;
}
