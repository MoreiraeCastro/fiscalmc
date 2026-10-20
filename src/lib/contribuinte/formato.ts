// Formatação no padrão do Emissor Nacional. Funções puras (servem no servidor e no navegador).

const FUSO = "America/Sao_Paulo";

/** CPF 000.000.000-00 ou CNPJ 00.000.000/0000-00; outro valor volta como veio. */
export function formatarDocumento(valor: string | null | undefined) {
  if (!valor) return "";
  const limpo = valor.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (/^\d{11}$/.test(limpo)) return limpo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (/^[0-9A-Z]{12}\d{2}$/.test(limpo)) return limpo.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
  return valor;
}

/** "CPF/CNPJ - Nome", como a coluna "Emitida para" do portal. */
export function pessoa(documento: string | null | undefined, nome: string | null | undefined) {
  const doc = formatarDocumento(documento);
  if (!doc && !nome) return "Não informado";
  return doc && nome ? `${doc} - ${nome}` : doc || nome || "";
}

export function formatarValor(centavos: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(centavos / 100);
}

export function formatarData(valor: string | null | undefined) {
  if (!valor) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor.split("-").reverse().join("/");
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO }).format(new Date(valor));
}

export function formatarDataHora(valor: string | null | undefined) {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(new Date(valor));
}

/** Competência no formato MM/AAAA a partir da data (AAAA-MM-DD). */
export function formatarCompetencia(data: string | null | undefined) {
  if (!data) return "—";
  const [ano, mes] = data.split("-");
  return `${mes}/${ano}`;
}

/** Data de hoje (AAAA-MM-DD) no fuso de Brasília. */
export function hojeBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Início do dia (00:00 de Brasília) em ISO, para filtrar timestamps por data local. */
export function inicioDoDiaBrasilia(data: string) {
  return new Date(`${data}T00:00:00-03:00`).toISOString();
}

export type Situacao = { rotulo: string; tom: "ok" | "alerta" | "erro" | "neutro" };

/** Situação da nota em linguagem do portal ("NFS-e Gerada", "Cancelada" etc.). */
export function situacaoNota(status: string): Situacao {
  switch (status) {
    case "ISSUED": return { rotulo: "NFS-e Gerada", tom: "ok" };
    case "CANCELLED": return { rotulo: "Cancelada", tom: "erro" };
    case "REJECTED": return { rotulo: "Não emitida (rejeitada)", tom: "erro" };
    case "UNKNOWN":
    case "SUBMITTING": return { rotulo: "Em confirmação", tom: "alerta" };
    default: return { rotulo: "Em preparação", tom: "neutro" };
  }
}
