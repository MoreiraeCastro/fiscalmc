"use client";
import { useState } from "react";
import { RefreshCw } from "@/components/icons";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/base-path";

export function ReconcileInvoiceButton({invoiceId, scope = "office"}:{invoiceId:string;scope?:"office"|"client"}){
  const router=useRouter();const[loading,setLoading]=useState(false);const[message,setMessage]=useState("");
  async function reconcile(){setLoading(true);setMessage("");try{const base=scope==="office"?"/api/admin/invoices":"/api/invoices";const response=await fetch(apiUrl(`${base}/${invoiceId}/reconcile`),{method:"POST"});const body=await response.json()as{error?:string;message?:string};setMessage(response.ok?(body.message??"Situação verificada."):(body.error??"Não foi possível verificar a situação agora."));if(response.ok)router.refresh();}catch{setMessage("Não foi possível verificar a situação agora.");}finally{setLoading(false);}}
  return <div className="reconciliation-action"><button className="button secondary" type="button" disabled={loading} onClick={reconcile} aria-describedby={message?`reconciliation-${invoiceId}`:undefined}><RefreshCw className={loading?"spin":undefined} size={17}/>{loading?"Verificando…":scope==="office"?"Verificar agora":"Atualizar situação"}</button>{message&&<p id={`reconciliation-${invoiceId}`} aria-live="polite">{message}</p>}</div>;
}
