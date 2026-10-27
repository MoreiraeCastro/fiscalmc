import Link from "next/link";
import { Building2, FilePen, FilePlus2, FileText, Play, Settings, Star } from "lucide-react";
import { usarFavoritoAction } from "@/app/contribuinte/favoritos/actions";
import { listarFavoritos } from "@/lib/contribuinte/favoritos";
import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { TabelaUltimas } from "@/components/contribuinte/tabela-notas";
import { exigirEmpresa } from "@/lib/contribuinte/contexto";
import { formatarDocumento, hojeBrasilia } from "@/lib/contribuinte/formato";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";
import { ultimasEmitidas } from "@/lib/contribuinte/notas";
import { listarRascunhos } from "@/lib/contribuinte/rascunhos";
import { TabelaRascunhos } from "@/components/contribuinte/tabela-rascunhos";

export const metadata = { title: "Página Principal" };

export default async function PaginaPrincipal() {
  const { empresa, escritorio, empresas } = await exigirEmpresa();
  const [ultimas, rascunhos, favoritos] = await Promise.all([ultimasEmitidas(empresa.id, hojeBrasilia()), listarRascunhos(empresa.id, 5), listarFavoritos(empresa.id)]);
  return <>
    <Trilha itens={[]} />
    {empresa.emissaoBloqueada ? <Aviso tipo="alerta">A emissão desta empresa está <strong>bloqueada</strong> até o escritório concluir o cadastro (certificado, dados fiscais e serviços).</Aviso> : null}
    {!empresa.podeEmitir && !empresa.emissaoBloqueada ? <Aviso tipo="alerta">Seu usuário consulta esta empresa, mas ainda não tem permissão para emitir por ela.</Aviso> : null}
    {favoritos.length && empresa.podeEmitir ? <Cartao titulo="Emitir com um favorito" acoes={<Link className="pc-link" href="/contribuinte/favoritos">Gerenciar</Link>}>
      <div className="pc-favoritos-rapidos">
        {favoritos.map((fav) => <form action={usarFavoritoAction} key={fav.id}>
          <input type="hidden" name="id" value={fav.id} />
          <button type="submit" title={`Emitir: ${fav.nome}`}><Play size={15} aria-hidden /><span>{fav.nome}</span></button>
        </form>)}
      </div>
    </Cartao> : null}
    <div className="pc-grade-inicio">
      <Cartao titulo="Rascunhos" className="rascunhos" acoes={rascunhos.length ? <Link className="pc-link" href="/contribuinte/notas/rascunhos">Ver todos</Link> : null}>
        {rascunhos.length ? <TabelaRascunhos linhas={rascunhos} completa={false} /> : <p className="pc-texto">Notas começadas e não emitidas aparecem aqui para você continuar depois. Para repetir uma nota já emitida, use "Emitir de novo" na lista de notas.</p>}
      </Cartao>
      <Cartao titulo="Meus dados" className="dados">
        <dl className="pc-dados">
          <div><dt>CNPJ</dt><dd>{formatarDocumento(empresa.cnpj)}</dd></div>
          <div><dt>Nome</dt><dd>{empresa.razaoSocial}</dd></div>
          <div><dt>Município</dt><dd>{nomeMunicipio(empresa.municipio)}</dd></div>
          <div><dt>E-mail</dt><dd>{empresa.email || "—"}</dd></div>
          <div><dt>Telefone</dt><dd>{empresa.telefone || "—"}</dd></div>
        </dl>
      </Cartao>
      <Cartao titulo="Últimas NFS-e emitidas nos últimos 30 dias" className="ultimas" acoes={<Link className="pc-link" href="/contribuinte/notas/emitidas">Ver todas</Link>}>
        {ultimas.length ? <TabelaUltimas linhas={ultimas} escritorio={escritorio} /> : <p className="pc-vazio">Nenhuma NFS-e emitida nos últimos 30 dias.</p>}
      </Cartao>
      <Cartao titulo="Acesso Rápido" className="rapido">
        <div className="pc-atalhos">
          <Link href="/contribuinte/nova"><FilePlus2 size={22} aria-hidden />Nova NFS-e</Link>
          <Link href="/contribuinte/notas/emitidas"><FileText size={22} aria-hidden />NFS-e Emitidas</Link>
          <Link href="/contribuinte/notas/rascunhos"><FilePen size={22} aria-hidden />Rascunhos</Link>
          <Link href="/contribuinte/favoritos"><Star size={22} aria-hidden />Meus Favoritos</Link>
          <Link href="/contribuinte/configuracoes"><Settings size={22} aria-hidden />Configurações</Link>
          {escritorio || empresas.length > 1 ? <Link href="/contribuinte/empresa"><Building2 size={22} aria-hidden />Trocar empresa</Link> : null}
        </div>
      </Cartao>
    </div>
  </>;
}
