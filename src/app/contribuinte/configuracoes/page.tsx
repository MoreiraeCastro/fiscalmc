import Link from "next/link";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { FormContato } from "@/components/contribuinte/form-contato";
import { FormTotalTributos, type InicialTotalTributos } from "@/components/contribuinte/form-total-tributos";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { dadosEmitente } from "@/lib/contribuinte/emissao";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Configurações" };

type TotalTributos = { indicator?: string; simplesRateBasisPoints?: number; percentages?: { federalBasisPoints: number; stateBasisPoints: number; municipalBasisPoints: number } };

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
  const config = (perfil?.dps_configuration ?? {}) as { totalTaxes?: TotalTributos; regime?: { simpleNational?: string }; technical?: { totalTaxes?: TotalTributos; regime?: { simpleNational?: string } } };
  const total = config.technical?.totalTaxes ?? config.totalTaxes;
  const simplesMeEpp = (config.technical?.regime?.simpleNational ?? config.regime?.simpleNational) === "3";
  const campo = (bp: number | undefined) => (bp ? (bp / 100).toFixed(2).replace(".", ",") : "");
  const inicialTotal: InicialTotalTributos = {
    modo: total?.simplesRateBasisPoints ? "simples" : total?.percentages ? "percentuais" : "nenhum",
    aliquotaSimples: campo(total?.simplesRateBasisPoints),
    federal: campo(total?.percentages?.federalBasisPoints), estadual: campo(total?.percentages?.stateBasisPoints), municipal: campo(total?.percentages?.municipalBasisPoints),
  };
  return <>
    <Trilha itens={["Configurações"]} />
    <h1 className="pc-titulo">Configurações</h1>
    <Cartao titulo="Informações de contato">
      <p className="pc-texto">E-mail e telefone da empresa, enviados na DPS como contato do prestador.</p>
      <FormContato inicial={{ email: empresa.email ?? "", telefone: empresa.telefone ?? "" }} podeEditar={empresa.podeEmitir} />
    </Cartao>
    <Cartao titulo="Valor aproximado dos tributos">
      <p className="pc-texto">Pré-configure aqui e a emissão não pergunta mais. Opção no Simples Nacional: {emitente.opcaoSimples}.</p>
      <FormTotalTributos inicial={inicialTotal} simplesMeEpp={simplesMeEpp} podeEditar={empresa.podeEmitir} />
    </Cartao>
    <Cartao titulo="Serviços Favoritos">
      <p className="pc-texto">Até 10 serviços com informações pré-preenchidas para emitir mais rápido. <Link className="pc-link" href="/contribuinte/favoritos">Abrir Serviços Favoritos</Link></p>
    </Cartao>
  </>;
}
