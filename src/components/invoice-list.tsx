"use client";

import Link from "next/link";
import { ArrowUpRight, FilePlus2, Search } from "@/components/icons";
import { useDeferredValue, useMemo, useState } from "react";
import { getInvoicePresentation } from "@/lib/invoices/presentation";
import { EmptyState, StatusBadge, formatCurrency, formatDate, formatDateTime } from "./ui-kit";

export type InvoiceRow = { id: string; number: string; customer: string; service: string; amountCents: number; status: string; date: string; company?: string; createdAt?: string; updatedAt?: string };

const filters = ["ALL", "ISSUED", "UNKNOWN", "REJECTED", "CANCELLED"] as const;
type Filter = (typeof filters)[number];

export function InvoiceList({ rows, all = false, admin = false }: { rows: InvoiceRow[]; all?: boolean; admin?: boolean }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));
  const visible = useMemo(() => {
    const publicRows = admin ? rows : rows.filter((invoice) => !["READY", "DRAFT"].includes(invoice.status));
    const matched = publicRows.filter((invoice) => (filter === "ALL" || invoice.status === filter || filter === "UNKNOWN" && invoice.status === "SUBMITTING") && (!deferredSearch || `${invoice.number} ${invoice.customer}`.toLocaleLowerCase("pt-BR").includes(deferredSearch)));
    return all ? matched : matched.slice(0, 5);
  }, [admin, all, deferredSearch, filter, rows]);
  const href = (id: string) => admin ? `/admin/notas/${id}` : `/app/notas/${id}`;

  return <section className="v2-panel v2-table-panel invoice-table-panel">
    <div className="v2-panel-heading"><div><h2>{all ? "Notas fiscais" : "Últimas notas"}</h2><p>{all ? "Histórico de emissões e confirmações." : "Movimentações mais recentes da empresa."}</p></div>{!all ? <Link className="v2-text-action" href={admin ? "/admin/notas" : "/app/notas"}>Ver todas</Link> : null}</div>
    {all ? <div className="v2-table-controls"><label className="v2-search-field"><Search size={16} aria-hidden /><span className="sr-only">Buscar por número ou tomador</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por número ou tomador" /></label><div className="v2-status-filters" aria-label="Filtrar notas">{filters.map((item) => <button className={filter === item ? "active" : ""} key={item} type="button" onClick={() => setFilter(item)}>{item === "ALL" ? "Todas" : getInvoicePresentation(item).label}</button>)}</div></div> : null}
    {visible.length ? <div className="v2-table-scroll"><table className="v2-table"><thead><tr><th>Número</th>{admin ? <th>Empresa</th> : null}<th>Tomador</th>{admin ? <th>Serviço</th> : null}<th>Data</th><th>Valor</th><th>Status</th>{admin ? <th>Atualização</th> : null}<th><span className="sr-only">Ação</span></th></tr></thead><tbody>{visible.map((invoice) => { const presentation = getInvoicePresentation(invoice.status); return <tr key={invoice.id}><td className="v2-table-primary">{invoice.number}</td>{admin ? <td>{invoice.company ?? "—"}</td> : null}<td>{invoice.customer}</td>{admin ? <td>{invoice.service}</td> : null}<td>{formatDate(invoice.date)}</td><td>{formatCurrency(invoice.amountCents)}</td><td><StatusBadge tone={presentation.tone}>{admin && invoice.status === "UNKNOWN" ? "Verificação necessária" : presentation.label}</StatusBadge></td>{admin ? <td>{invoice.updatedAt ? formatDateTime(invoice.updatedAt) : "—"}</td> : null}<td><Link className="v2-icon-action" href={href(invoice.id)} title="Abrir nota"><ArrowUpRight size={17} /></Link></td></tr>; })}</tbody></table></div> : <EmptyState title="Nenhuma nota encontrada" description={search || filter !== "ALL" ? "Ajuste a busca ou os filtros para ver outras notas." : "As emissões reais aparecerão aqui."} action={!admin ? <Link className="button primary" href="/app/emitir"><FilePlus2 size={17} />Emitir NFS-e</Link> : undefined} />}
  </section>;
}
