import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { DismissPendencyButton } from "@/components/dismiss-pendency-button";
import { ReconcileInvoiceButton } from "@/components/reconcile-invoice-button";
import { EmptyState, MetricTile, PageHeader, StatusBadge, formatCurrency, formatDateTime } from "@/components/ui-kit";
import { requireOfficeDataClient } from "@/lib/auth/session";
import type { ProblemOrigin } from "@/lib/operations/emission-problems";
import { loadEmissionProblems, type Problem } from "@/lib/operations/emission-problems-data";


const ORIGIN_LABEL: Record<ProblemOrigin, string> = { RECEITA: "Recusada pela Receita", ANTES_DO_ENVIO: "Barrada antes do envio", CONFIRMACAO: "Em confirmação" };
const ORIGIN_TONE: Record<ProblemOrigin, "danger" | "warning" | "info"> = { RECEITA: "danger", ANTES_DO_ENVIO: "warning", CONFIRMACAO: "info" };
const PERIODS = [7, 30, 90] as const;

function fixHref(p: Problem) {
  const company = `/admin/empresas/${p.organizationId}`;
  switch (p.guide.onde) {
    case "configuracao": return { href: `${company}?tab=fiscal`, label: "Dados fiscais" };
    case "certificado": return { href: `${company}?tab=certificate`, label: "Certificado" };
    case "servico": return { href: `${company}?tab=services`, label: "Serviços" };
    case "empresa": return { href: company, label: "Abrir empresa" };
    default: return p.invoiceId ? { href: `/admin/notas/${p.invoiceId}`, label: "Abrir nota" } : { href: company, label: "Abrir empresa" };
  }
}

export default async function NotEmittedPage({ searchParams }: { searchParams: Promise<{ dias?: string; empresa?: string; ver?: string }> }) {
  const db = await requireOfficeDataClient().catch(() => null);
  if (!db) redirect("/app?notice=office");
  const filters = await searchParams;
  const days = PERIODS.find((value) => String(value) === filters.dias) ?? 30;
  const showAll = filters.ver === "todas";
  const since = new Date(Date.now() - days * 864e5).toISOString();

  const [{ data: organizations }, problems] = await Promise.all([
    db.from("organizations").select("id,legal_name").order("legal_name").limit(300),
    loadEmissionProblems(db, { since, organizationId: filters.empresa }),
  ]);

  const pending = problems.filter((p) => p.state === "pendente");
  const visible = showAll ? problems : pending;
  const count = (origin: ProblemOrigin) => problems.filter((p) => p.origin === origin).length;
  // Motivos que mais se repetem no período: é onde vale corrigir o cadastro de vez.
  const causes = [...problems.reduce((map, p) => map.set(p.guide.titulo, (map.get(p.guide.titulo) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  const query = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ ...(filters.dias ? { dias: filters.dias } : {}), ...(filters.empresa ? { empresa: filters.empresa } : {}), ...(filters.ver ? { ver: filters.ver } : {}) });
    for (const [key, value] of Object.entries(patch)) { if (value) params.set(key, value); else params.delete(key); }
    const text = params.toString();
    return `/admin/nao-emitidas${text ? `?${text}` : ""}`;
  };

  return <div className="page v2-page">
    <PageHeader title="Não emitidas" description="Toda nota que não saiu, de todas as empresas: o motivo em português e onde corrigir." />

    <div className="v2-metrics">
      <MetricTile label="Pendentes agora" value={String(pending.length)} hint="Sem nota emitida depois" tone={pending.length ? "warning" : "default"} />
      <MetricTile label="Recusadas pela Receita" value={String(count("RECEITA"))} hint={`Últimos ${days} dias`} />
      <MetricTile label="Barradas antes do envio" value={String(count("ANTES_DO_ENVIO"))} hint="Cadastro, serviço ou certificado" />
      <MetricTile label="Em confirmação" value={String(count("CONFIRMACAO"))} hint="Aguardando a Receita" />
    </div>

    <form className="v2-filterbar compact ne-filter" method="get">
      <select name="empresa" aria-label="Empresa" defaultValue={filters.empresa ?? ""}><option value="">Todas as empresas</option>{(organizations ?? []).map((o) => <option key={o.id} value={o.id}>{o.legal_name}</option>)}</select>
      <select name="dias" aria-label="Período" defaultValue={String(days)}>{PERIODS.map((value) => <option key={value} value={value}>Últimos {value} dias</option>)}</select>
      {showAll ? <input type="hidden" name="ver" value="todas" /> : null}
      <button className="button secondary" type="submit">Filtrar</button>
    </form>

    {causes.length ? <section className="v2-panel ne-causes"><h2>Motivos mais comuns</h2><ul>{causes.map(([title, total]) => <li key={title}><strong>{total}×</strong>{title}</li>)}</ul></section> : null}

    <section className="v2-panel v2-table-panel">
      <div className="v2-panel-heading">
        <div><h2>{showAll ? "Todas no período" : "Pendentes"}</h2><p>{showAll ? `${problems.length} ocorrência(s); resolvidas aparecem apagadas.` : "Some daqui quando a empresa emite depois para o mesmo tomador, ou quando alguém marca como resolvida."}</p></div>
        <Link className="v2-text-action" href={query({ ver: showAll ? undefined : "todas" })}>{showAll ? "Ver só pendentes" : "Ver resolvidas também"}</Link>
      </div>
      {visible.length ? <div className="v2-table-scroll"><table className="v2-table ne-table">
        <thead><tr><th>Quando</th><th>Empresa e tomador</th><th>O que aconteceu</th><th>O que fazer</th><th>Ação</th></tr></thead>
        <tbody>{visible.map((p) => {
          const fix = fixHref(p);
          return <tr key={p.itemId} className={p.state !== "pendente" ? "ne-done" : undefined}>
            <td><span className="ne-when">{formatDateTime(p.at)}</span>
              <StatusBadge tone={p.state === "pendente" ? ORIGIN_TONE[p.origin] : "success"}>{p.state === "resolvida" ? "Emitiu depois" : p.state === "marcada" ? "Resolvida" : ORIGIN_LABEL[p.origin]}</StatusBadge></td>
            <td><span className="v2-table-primary">{p.company}</span><small className="ne-sub">{p.customer}{p.amountCents ? ` · ${formatCurrency(p.amountCents)}` : ""}{p.service ? ` · ${p.service}` : ""}{p.testEnvironment ? " · teste" : ""}</small></td>
            <td><strong className="ne-title">{p.guide.titulo}</strong>{p.message ? <small className="ne-sub">{p.message}</small> : null}{p.code ? <code className="ne-code">{p.code}</code> : null}</td>
            <td className="ne-todo">{p.guide.oQueFazer}</td>
            <td><div className="v2-table-actions ne-actions">
              {p.origin === "CONFIRMACAO" && p.invoiceId ? <ReconcileInvoiceButton invoiceId={p.invoiceId} /> : null}
              {p.guide.onde !== "programador" || p.invoiceId ? <Link className="button ghost compact" href={fix.href}>{fix.label}<ArrowRight size={15} /></Link> : null}
              {p.state === "pendente" && p.origin !== "CONFIRMACAO" ? <DismissPendencyButton itemId={p.itemId} itemType={p.origin === "RECEITA" ? "INVOICE_REJECTED" : "INVOICE_BLOCKED"} organizationId={p.organizationId} /> : null}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div> : <EmptyState title={showAll ? "Nenhuma ocorrência no período" : "Nenhuma nota parada"} description={showAll ? undefined : "Tudo o que foi tentado nesse período saiu ou já foi resolvido."} action={<span className="ne-ok"><CircleCheck size={17} aria-hidden />Operação em dia</span>} />}
    </section>
  </div>;
}
