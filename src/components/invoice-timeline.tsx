import { History } from "@/components/icons";
import { buildInvoiceTimeline, type InvoiceTimelineAttempt } from "@/lib/invoices/presentation";
import { formatDateTime } from "./ui-kit";

export function InvoiceTimeline({ createdAt, status, issuedAt, updatedAt, lastReconciledAt, attempts, office = false }: { createdAt: string; status: string; issuedAt?: string | null; updatedAt?: string | null; lastReconciledAt?: string | null; attempts: InvoiceTimelineAttempt[]; office?: boolean }) {
  const events = buildInvoiceTimeline({ createdAt, status, issuedAt, updatedAt, lastReconciledAt, attempts, office });
  return <section className="v2-panel v2-timeline"><h2><History size={19} aria-hidden />Histórico</h2><ol>{events.map((event) => <li className={`is-${event.tone}`} key={event.id}><span aria-hidden /><div><strong>{event.title}</strong><small>{formatDateTime(event.at)}{event.description ? ` · ${event.description}` : ""}</small></div></li>)}</ol></section>;
}
