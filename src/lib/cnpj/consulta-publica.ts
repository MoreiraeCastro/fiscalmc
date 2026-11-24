import "server-only";

/**
 * Consulta pública de CNPJ: BrasilAPI e, quando ela não responde (fora do ar, 5xx, limite), a CNPJá aberta
 * (open.cnpja.com, grátis, 5 consultas por minuto por IP). As duas leem a mesma base aberta da Receita (mensal), então
 * a CNPJá é só reserva, não traz dado mais novo. A resposta sai sempre no formato da BrasilAPI, para o resto do código
 * não mudar.
 */
export type CnpjPublico = Record<string, unknown>;
export type ConsultaCnpj =
  | { status: "ok"; dados: CnpjPublico; fonte: "brasilapi" | "cnpja" }
  | { status: "nao_encontrado" }
  | { status: "falhou" };

const UA = "Mozilla/5.0 (compatible; FiscalMC/1.0)";
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** CNPJá aberta: 5 por minuto. Uma consulta por vez, com 12,5 s entre elas, para nunca passar do limite. */
let filaCnpja: Promise<unknown> = Promise.resolve();
let ultimaCnpja = 0;

type CnpjaOffice = {
  alias?: string | null; founded?: string | null; head?: boolean; statusDate?: string | null;
  status?: { text?: string } | null; reason?: { text?: string } | null;
  company?: {
    name?: string; equity?: number | null; nature?: { id?: number; text?: string } | null; size?: { text?: string } | null;
    simples?: { optant?: boolean; since?: string | null } | null; simei?: { optant?: boolean; since?: string | null } | null;
    members?: { since?: string | null; person?: { name?: string; taxId?: string | null; age?: string | null } | null; role?: { id?: number; text?: string } | null }[];
  } | null;
  address?: { municipality?: number; street?: string; number?: string; district?: string; city?: string; state?: string; details?: string | null; zip?: string } | null;
  phones?: { area?: string; number?: string }[]; emails?: { address?: string }[];
  mainActivity?: { id?: number; text?: string } | null; sideActivities?: { id?: number; text?: string }[];
};

/** A CNPJá junta o tipo ao logradouro ("Rua X"); a BrasilAPI separa ("RUA" + "X"). */
const TIPOS_LOGRADOURO = new Set(["RUA", "AVENIDA", "TRAVESSA", "ESTRADA", "PRACA", "ALAMEDA", "RODOVIA", "LARGO", "BECO", "VIA", "LADEIRA",
  "PRAIA", "QUADRA", "VILA", "PARQUE", "CAMPO", "SERVIDAO", "CAMINHO", "ACESSO", "CONDOMINIO", "LOTEAMENTO", "VIELA", "VIADUTO", "ESTRADA", "PASSAGEM", "BOULEVARD", "AREA", "SETOR", "TRECHO", "CONJUNTO"]);
function separarLogradouro(rua: string | null): [string | null, string | null] {
  if (!rua) return [null, null];
  const [primeira, ...resto] = rua.split(" ");
  const sem = primeira.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return resto.length && TIPOS_LOGRADOURO.has(sem) ? [primeira, resto.join(" ")] : [null, rua];
}

/** CNPJá → formato da BrasilAPI (os campos que o sistema usa). Texto em maiúsculas como a BrasilAPI devolve. */
export function cnpjaParaBrasilApi(cnpj: string, o: CnpjaOffice): CnpjPublico {
  const up = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);
  const tel = (p?: { area?: string; number?: string }) => (p ? `${p.area ?? ""}${p.number ?? ""}` : null);
  const c = o.company ?? {};
  const a = o.address ?? {};
  const [tipo, logradouro] = separarLogradouro(up(a.street));
  return {
    cnpj,
    razao_social: up(c.name),
    nome_fantasia: up(o.alias),
    descricao_identificador_matriz_filial: o.head === undefined ? null : o.head ? "MATRIZ" : "FILIAL",
    descricao_situacao_cadastral: up(o.status?.text),
    data_situacao_cadastral: o.statusDate ?? null,
    descricao_motivo_situacao_cadastral: up(o.reason?.text),
    data_inicio_atividade: o.founded ?? null,
    natureza_juridica: c.nature?.text ?? null,
    porte: up(c.size?.text),
    capital_social: c.equity ?? null,
    opcao_pelo_simples: c.simples?.optant ?? null,
    data_opcao_pelo_simples: c.simples?.since ?? null,
    opcao_pelo_mei: c.simei?.optant ?? null,
    data_opcao_pelo_mei: c.simei?.since ?? null,
    cnae_fiscal: o.mainActivity?.id ?? null,
    cnae_fiscal_descricao: o.mainActivity?.text ?? null,
    cnaes_secundarios: (o.sideActivities ?? []).map((s) => ({ codigo: s.id ?? 0, descricao: s.text ?? "" })),
    descricao_tipo_de_logradouro: tipo,
    logradouro,
    numero: a.number ?? null,
    complemento: up(a.details),
    bairro: up(a.district),
    municipio: up(a.city),
    uf: a.state ?? null,
    cep: a.zip ?? null,
    codigo_municipio_ibge: a.municipality ?? null,
    ddd_telefone_1: tel(o.phones?.[0]),
    ddd_telefone_2: tel(o.phones?.[1]),
    email: o.emails?.[0]?.address?.toLowerCase() ?? null,
    qsa: (c.members ?? []).map((m) => ({
      nome_socio: up(m.person?.name),
      cnpj_cpf_do_socio: m.person?.taxId ?? null,
      qualificacao_socio: m.role?.text ?? null,
      codigo_qualificacao_socio: m.role?.id ?? null,
      data_entrada_sociedade: m.since ?? null,
      faixa_etaria: m.person?.age ?? null,
    })),
  };
}

async function cnpja(cnpj: string, timeoutMs: number): Promise<ConsultaCnpj> {
  const vez = filaCnpja.then(async (): Promise<ConsultaCnpj> => {
    const espera = ultimaCnpja + 12_500 - Date.now();
    if (espera > 0) await dormir(espera);
    ultimaCnpja = Date.now();
    const r = await fetch(`https://open.cnpja.com/office/${cnpj}`, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    if (r?.status === 404) return { status: "nao_encontrado" };
    if (!r?.ok) return { status: "falhou" };
    try {
      return { status: "ok", dados: cnpjaParaBrasilApi(cnpj, (await r.json()) as CnpjaOffice), fonte: "cnpja" };
    } catch {
      return { status: "falhou" };
    }
  });
  filaCnpja = vez.catch(() => undefined);
  return vez;
}

/**
 * BrasilAPI (com `tentativas`, esperando 5 s, 10 s...) e, se ela não responder, a CNPJá. 404 da BrasilAPI é CNPJ
 * inexistente: não vai para a reserva.
 */
export async function consultarCnpjPublico(cnpj: string, { tentativas = 1, timeoutMs = 10_000 } = {}): Promise<ConsultaCnpj> {
  if (!/^\d{14}$/.test(cnpj)) return { status: "nao_encontrado" };
  for (let t = 0; t < tentativas; t++) {
    if (t) await dormir(5_000 * t);
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    if (r?.status === 404) return { status: "nao_encontrado" };
    if (r?.ok) {
      try {
        return { status: "ok", dados: (await r.json()) as CnpjPublico, fonte: "brasilapi" };
      } catch { /* resposta quebrada: tenta de novo / reserva */ }
    }
  }
  return cnpja(cnpj, timeoutMs);
}
