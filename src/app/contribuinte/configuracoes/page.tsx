import Link from "next/link";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { FormContato } from "@/components/contribuinte/form-contato";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { dadosEmitente } from "@/lib/contribuinte/emissao";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Configurações" };

type TotalTributos = { indicator?: string; percentages?: { federalBasisPoints: number; stateBasisPoints: number; municipalBasisPoints: number } };

function pct(bp: number) {
  return `${(bp / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Configurações (como /Perfil/Configuracao do portal): contato usado na DPS e valor aproximado dos tributos. */
export default async function ConfiguracoesPage() {
  const { empresa, escritorio } = await exigirEmpresa();
  const [emitente, { data: perfil }] = await Promise.all([
    dadosEmitente(empresa.id),
    createAdminClient().from("tax_profiles").select("dps_configuration").eq("organization_id", empresa.id).maybeSingle(),
  ]);
  const config = (perfil?.dps_configuration ?? {}) as { totalTaxes?: TotalTributos; technical?: { totalTaxes?: TotalTributos } };
  const total = config.technical?.totalTaxes ?? config.totalTaxes;
  return <>
    <Trilha itens={["Configurações"]} />
    <h1 className="pc-titulo">Configurações</h1>
    <Cartao titulo="Informações de contato">
      <p className="pc-texto">E-mail e telefone da empresa, enviados na DPS como contato do prestador.</p>
      <FormContato inicial={{ email: empresa.email ?? "", telefone: empresa.telefone ?? "" }} podeEditar={empresa.podeEmitir} />
    </Cartao>
    <Cartao titulo="Valor aproximado dos tributos">
      <dl className="pc-resumo">
        <div><dt>Opção no Simples Nacional</dt><dd>{emitente.opcaoSimples}</dd></div>
        <div><dt>Como sai na NFS-e</dt><dd>{total?.percentages
          ? `Percentuais fixos: federal ${pct(total.percentages.federalBasisPoints)}, estadual ${pct(total.percentages.stateBasisPoints)}, municipal ${pct(total.percentages.municipalBasisPoints)}`
          : emitente.simples ? "Percentuais zerados (empresa do Simples Nacional: o valor aproximado é o da tabela do Simples)" : "Não informado (indicador 0 na DPS)"}</dd></div>
      </dl>
      <Aviso>Essa configuração faz parte dos dados fiscais da empresa, revisados pelo escritório.{escritorio ? <> Para mudar, use <Link className="pc-link" href={`/admin/empresas/${empresa.id}?tab=fiscal`}>Dados fiscais</Link> na aba Escritório.</> : " Para mudar, fale com o escritório."}</Aviso>
    </Cartao>
    <Cartao titulo="Serviços Favoritos">
      <p className="pc-texto">Até 10 serviços com informações pré-preenchidas para emitir mais rápido. <Link className="pc-link" href="/contribuinte/favoritos">Abrir Serviços Favoritos</Link></p>
    </Cartao>
  </>;
}
