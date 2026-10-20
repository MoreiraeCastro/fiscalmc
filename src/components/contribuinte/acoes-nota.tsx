"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, LoaderCircle, Printer, RefreshCw, Repeat2, X } from "lucide-react";
import { cancelarNfseAction, consultarCancelamentoAction, substituirNfseAction, type EstadoCancelamento } from "@/app/contribuinte/nfse/actions";
import { apiUrl } from "@/lib/base-path";
import { MOTIVOS_CANCELAMENTO } from "@/lib/contribuinte/dps";
import { Campo } from "./campos";

export function BotaoImprimir() {
  return <button type="button" className="pc-botao secundario" onClick={() => window.print()}><Printer size={16} aria-hidden />Imprimir</button>;
}

/** Botão "Substituir": abre os 4 passos preenchidos com esta nota. */
export function BotaoSubstituir({ notaId, liberado }: { notaId: string; liberado: boolean }) {
  if (!liberado) return <button type="button" className="pc-botao secundario" disabled title="Liberado depois do teste na Produção Restrita"><Repeat2 size={16} aria-hidden />Substituir</button>;
  return <form action={substituirNfseAction}><input type="hidden" name="notaId" value={notaId} />
    <button type="submit" className="pc-botao secundario"><Repeat2 size={16} aria-hidden />Substituir</button>
  </form>;
}

/** "Cancelar NFS-e" (escritório): janela com o motivo, como no Emissor Nacional. */
export function CancelarNfse({ notaId, liberado, producao, motivoSugerido, abrir = false }: { notaId: string; liberado: boolean; producao: boolean; motivoSugerido?: string; abrir?: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(abrir);
  const [codigo, setCodigo] = useState("");
  const [motivo, setMotivo] = useState(motivoSugerido ?? "");
  const [ciente, setCiente] = useState(false);
  const [estado, enviar, enviando] = useActionState<EstadoCancelamento, FormData>(async (anterior, dados) => {
    const resultado = await cancelarNfseAction(notaId, anterior, dados);
    if (resultado.tom === "sucesso") { setAberto(false); router.refresh(); }
    return resultado;
  }, { erros: {} });
  if (!liberado) return <button type="button" className="pc-botao perigo" disabled title="Liberado depois do teste na Produção Restrita"><Ban size={16} aria-hidden />Cancelar NFS-e</button>;
  return <>
    <button type="button" className="pc-botao perigo" onClick={() => setAberto(true)}><Ban size={16} aria-hidden />Cancelar NFS-e</button>
    {estado.mensagem && !aberto ? <div className={`pc-aviso ${estado.tom ?? "info"} pc-largo`} role="status">{estado.mensagem}</div> : null}
    {aberto ? <div className="pc-janela-fundo" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !enviando) setAberto(false); }}>
      <form className="pc-janela pc-janela-form" role="dialog" aria-modal aria-labelledby="cancelar-titulo" action={enviar} noValidate>
        <header><h2 id="cancelar-titulo">Cancelar NFS-e</h2><button type="button" className="pc-icone-botao" onClick={() => setAberto(false)} aria-label="Fechar" disabled={enviando}><X size={18} aria-hidden /></button></header>
        <div className="pc-form">
          {estado.mensagem ? <div className={`pc-aviso ${estado.tom ?? "alerta"}`} role="alert">{estado.mensagem}</div> : null}
          <Campo rotulo="Motivo" obrigatorio erro={estado.erros.codigo} id="codigo">
            <select id="codigo" name="codigo" className="pc-input" value={codigo} onChange={(e) => setCodigo(e.target.value)}>
              <option value="">Selecione</option>
              {Object.entries(MOTIVOS_CANCELAMENTO).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Descrição do motivo" obrigatorio erro={estado.erros.motivo} dica="De 15 a 255 caracteres." id="motivo">
            <textarea id="motivo" name="motivo" rows={4} maxLength={255} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <small className="pc-contador">{motivo.length} / 255</small>
          </Campo>
          <label className="pc-confirmacao">
            <input type="checkbox" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
            O cancelamento é definitivo{producao ? <> e vale para a nota em <strong>Produção</strong> (com valor fiscal)</> : null}. Quero cancelar esta NFS-e.
          </label>
          <footer className="pc-rodape-passo">
            <button type="button" className="pc-botao secundario" onClick={() => setAberto(false)} disabled={enviando}>Voltar</button>
            <button type="submit" className="pc-botao perigo cheio" disabled={!ciente || enviando}>{enviando ? <><LoaderCircle className="spin" size={16} aria-hidden />Cancelando…</> : "Confirmar cancelamento"}</button>
          </footer>
        </div>
      </form>
    </div> : null}
  </>;
}

/** Cancelamento enviado sem resposta: pergunta à SEFIN. */
export function ConsultarCancelamento({ notaId }: { notaId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<EstadoCancelamento | null>(null);
  return <div className="pc-acoes">
    <button type="button" className="pc-botao secundario" disabled={pendente} onClick={() => iniciar(async () => { const r = await consultarCancelamentoAction(notaId); setMensagem(r); router.refresh(); })}>
      {pendente ? <LoaderCircle className="spin" size={16} aria-hidden /> : <RefreshCw size={16} aria-hidden />}Consultar situação
    </button>
    {mensagem?.mensagem ? <span className={`pc-nota ${mensagem.tom ?? ""}`}>{mensagem.mensagem}</span> : null}
  </div>;
}

/** Cliente: pede o cancelamento ao escritório (o escritório transmite). */
export function SolicitarCancelamento({ notaId }: { notaId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [chave] = useState(() => crypto.randomUUID());
  async function enviar() {
    setEnviando(true); setMensagem("");
    try {
      const resposta = await fetch(apiUrl(`/api/invoices/${notaId}/cancellation-requests`), { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": chave }, body: JSON.stringify({ reason: motivo.trim() }) });
      const corpo = await resposta.json().catch(() => ({})) as { error?: string; message?: string };
      setMensagem(resposta.ok ? corpo.message ?? "Solicitação registrada." : corpo.error ?? "Não foi possível solicitar.");
      if (resposta.ok) { setAberto(false); router.refresh(); }
    } catch { setMensagem("Não foi possível solicitar agora."); } finally { setEnviando(false); }
  }
  return <>
    <button type="button" className="pc-botao perigo" onClick={() => setAberto(true)}><Ban size={16} aria-hidden />Solicitar cancelamento</button>
    {mensagem && !aberto ? <span className="pc-nota">{mensagem}</span> : null}
    {aberto ? <div className="pc-janela-fundo" role="presentation">
      <div className="pc-janela pc-janela-form" role="dialog" aria-modal aria-label="Solicitar cancelamento">
        <header><h2>Solicitar cancelamento</h2><button type="button" className="pc-icone-botao" onClick={() => setAberto(false)} aria-label="Fechar"><X size={18} aria-hidden /></button></header>
        <div className="pc-form">
          <p className="pc-texto">O pedido vai para o escritório, que confere e cancela a nota na Receita.</p>
          {mensagem ? <div className="pc-aviso erro">{mensagem}</div> : null}
          <Campo rotulo="Motivo do cancelamento" obrigatorio dica="De 15 a 255 caracteres." id="motivo-cliente">
            <textarea id="motivo-cliente" rows={4} maxLength={255} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
          <footer className="pc-rodape-passo">
            <button type="button" className="pc-botao secundario" onClick={() => setAberto(false)}>Voltar</button>
            <button type="button" className="pc-botao perigo cheio" disabled={enviando || motivo.trim().length < 15} onClick={enviar}>{enviando ? "Enviando…" : "Enviar pedido"}</button>
          </footer>
        </div>
      </div>
    </div> : null}
  </>;
}
