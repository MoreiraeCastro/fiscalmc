"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "@/components/icons";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const partes = (valor: string) => ({ ano: Number(valor.slice(0, 4)), mes: Number(valor.slice(5, 7)) });
const montar = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;
function somar(valor: string, meses: number) {
  const { ano, mes } = partes(valor);
  const total = ano * 12 + (mes - 1) + meses;
  return montar(Math.floor(total / 12), (total % 12) + 1);
}

/**
 * Competência "AAAA-MM" no lugar do <input type="month"> do navegador: setas para andar um mês e, no nome,
 * a grade dos 12 meses do ano. Não passa do mês atual (`limite`). O valor vai no form pelo campo escondido.
 * `opcional`: começa vazio ("Todas") e ganha o × para voltar a todas (filtro das listas de notas).
 */
export function SeletorCompetencia({ name, inicial, limite, opcional }: { name: string; inicial: string; limite: string; opcional?: boolean }) {
  const [valor, setValor] = useState(inicial);
  const [aberto, setAberto] = useState(false);
  const [anoGrade, setAnoGrade] = useState(partes(inicial || limite).ano);
  const raiz = useRef<HTMLDivElement>(null);
  const { ano, mes } = partes(valor || limite);
  const anoLimite = partes(limite).ano;

  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: MouseEvent) => { if (!raiz.current?.contains(evento.target as Node)) setAberto(false); };
    const esc = (evento: KeyboardEvent) => { if (evento.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const escolher = (novo: string) => { setValor(novo > limite ? limite : novo); setAberto(false); };

  return <div className="pc-competencia" ref={raiz}>
    <input type="hidden" name={name} value={valor} />
    <button type="button" className="pc-competencia-seta" aria-label="Mês anterior" onClick={() => escolher(somar(valor || somar(limite, 1), -1))}><ChevronLeft size={16} aria-hidden /></button>
    <button type="button" className="pc-competencia-nome" aria-haspopup="dialog" aria-expanded={aberto}
      onClick={() => { setAnoGrade(ano); setAberto((v) => !v); }}>
      {valor ? `${MESES[mes - 1]} de ${ano}` : "Todas"}
    </button>
    <button type="button" className="pc-competencia-seta" aria-label="Próximo mês" disabled={!valor || valor >= limite} onClick={() => escolher(somar(valor, 1))}><ChevronRight size={16} aria-hidden /></button>
    {opcional && valor ? <button type="button" className="pc-competencia-seta" aria-label="Todas as competências" title="Todas" onClick={() => { setValor(""); setAberto(false); }}><X size={15} aria-hidden /></button> : null}

    {aberto ? <div className="pc-competencia-grade" role="dialog" aria-label="Escolher competência">
      <div className="pc-competencia-ano">
        <button type="button" aria-label="Ano anterior" onClick={() => setAnoGrade((a) => a - 1)}><ChevronLeft size={15} aria-hidden /></button>
        <strong>{anoGrade}</strong>
        <button type="button" aria-label="Próximo ano" disabled={anoGrade >= anoLimite} onClick={() => setAnoGrade((a) => a + 1)}><ChevronRight size={15} aria-hidden /></button>
      </div>
      <div className="pc-competencia-meses">
        {CURTOS.map((curto, i) => {
          const opcao = montar(anoGrade, i + 1);
          return <button type="button" key={curto} className={opcao === valor ? "ativo" : ""} disabled={opcao > limite} onClick={() => escolher(opcao)}>{curto}</button>;
        })}
      </div>
    </div> : null}
  </div>;
}
