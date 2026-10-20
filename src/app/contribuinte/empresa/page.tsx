import { Aviso, Cartao, Trilha } from "@/components/contribuinte/portal-shell";
import { contextoContribuinte } from "@/lib/contribuinte/contexto";
import { formatarDocumento } from "@/lib/contribuinte/formato";
import { nomeMunicipio } from "@/lib/contribuinte/municipios";
import { escolherEmpresa } from "./actions";

export const metadata = { title: "Escolher empresa" };

export default async function EscolherEmpresaPage({ searchParams }: { searchParams: Promise<{ q?: string; voltar?: string }> }) {
  const [{ empresas, empresa }, { q, voltar }] = await Promise.all([contextoContribuinte(), searchParams]);
  const busca = (q ?? "").trim().toLocaleLowerCase("pt-BR");
  const digitos = busca.replace(/\D/g, "");
  const lista = busca
    ? empresas.filter((item) => item.razaoSocial.toLocaleLowerCase("pt-BR").includes(busca) || (digitos.length >= 3 && item.cnpj.includes(digitos)))
    : empresas;
  return <>
    <Trilha itens={["Escolher empresa"]} />
    <h1 className="pc-titulo">Para qual empresa você vai trabalhar?</h1>
    <Cartao titulo="Empresas" acoes={<form className="pc-busca" method="get">{voltar ? <input type="hidden" name="voltar" value={voltar} /> : null}<input name="q" defaultValue={q} placeholder="Pesquisar por razão social ou CNPJ" aria-label="Pesquisar empresa" /><button className="pc-botao secundario" type="submit">Pesquisar</button></form>}>
      {!empresas.length ? <Aviso>Nenhuma empresa disponível para o seu usuário.</Aviso> : null}
      {empresas.length && !lista.length ? <p className="pc-vazio">Nenhuma empresa encontrada para “{q}”.</p> : null}
      <ul className="pc-empresas">
        {lista.map((item) => (
          <li key={item.id} className={empresa?.id === item.id ? "atual" : undefined}>
            <form action={escolherEmpresa}>
              <input type="hidden" name="empresa" value={item.id} />
              {voltar ? <input type="hidden" name="voltar" value={voltar} /> : null}
              <button type="submit">
                <span><strong>{item.razaoSocial}</strong><small>{formatarDocumento(item.cnpj)} · {nomeMunicipio(item.municipio)}</small></span>
                {empresa?.id === item.id ? <em className="pc-selo ok">Atual</em> : item.emissaoBloqueada ? <em className="pc-selo alerta">Emissão bloqueada</em> : !item.podeEmitir ? <em className="pc-selo neutro">Só consulta</em> : null}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </Cartao>
  </>;
}
