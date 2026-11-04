"use client";

import { useRef,useState } from "react";
import { CheckCircle2,ShieldAlert,Upload,XCircle } from "@/components/icons";
import { getCertificateReadiness,type StoredCertificateStatus } from "@/lib/nfse/certificate/status";
import { certificateHolderName } from "@/lib/nfse/certificate/presentation";
import { apiUrl } from "@/lib/base-path";

type Certificate={id:string;subject:string;issuer:string;serial:string;owner_tax_id:string|null;valid_from:string;valid_until:string;status:StoredCertificateStatus;created_at?:string};
function formatTaxId(value:string){return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,"$1.$2.$3/$4-$5");}
function formatDate(value:string){return new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium"}).format(new Date(value));}

export function CertificateManager({organizationId,organizationTaxId,initialCertificate,canWrite}:{organizationId:string;organizationTaxId:string;initialCertificate:Certificate|null;canWrite:boolean}){
  const[certificate,setCertificate]=useState(initialCertificate),[file,setFile]=useState<File|null>(null),[password,setPassword]=useState(""),[error,setError]=useState(""),[saving,setSaving]=useState(false),[validatingCertificate,setValidatingCertificate]=useState(false),[validationResult,setValidationResult]=useState<"PASS"|"FAIL"|null>(null),[validationError,setValidationError]=useState(""),[validationHttp,setValidationHttp]=useState("");
  const fileInput=useRef<HTMLInputElement>(null);
  const readiness=getCertificateReadiness({certificate,organizationTaxId});
  async function upload(){
    if(!file||!password){setError("Selecione o arquivo e informe a senha.");return;}
    setSaving(true);setError("");
    const form=new FormData();form.set("file",file);form.set("password",password);
    try{
      const response=await fetch(apiUrl(`/api/admin/organizations/${organizationId}/certificate`),{method:"POST",body:form});
      const result=await response.json();
      if(!response.ok){setError(result.error??"Não foi possível cadastrar o certificado.");return;}
      setCertificate(result.certificate);setFile(null);setPassword("");if(fileInput.current)fileInput.current.value="";
    }catch{setError("Não foi possível cadastrar o certificado.");}
    finally{setSaving(false);}
  }
  async function validateCertificate(){setValidatingCertificate(true);setValidationResult(null);setValidationError("");setValidationHttp("");try{const response=await fetch(apiUrl(`/api/admin/organizations/${organizationId}/certificate/preflight`));const type=response.headers.get("content-type")??"";const raw=await response.text();const diagnostic=`HTTP: ${response.status} ${response.statusText||"—"} · Tipo: ${type.includes("application/json")?"JSON":"NON_JSON"} · Redirect: ${response.redirected?"SIM":"NÃO"}`;setValidationHttp(diagnostic);let result:unknown=null;if(type.includes("application/json")){try{result=JSON.parse(raw);}catch{setValidationResult("FAIL");setValidationError("PREFLIGHT_JSON_ERROR");return;}}else{setValidationResult("FAIL");setValidationError(response.redirected?"PREFLIGHT_REDIRECTED":"PREFLIGHT_NON_JSON_RESPONSE");return;}if(!response.ok){setValidationResult("FAIL");setValidationError(typeof result==="object"&&result&&"code" in result&&typeof result.code==="string"?result.code:"PREFLIGHT_JSON_ERROR");return;}setValidationResult("PASS");}catch{setValidationResult("FAIL");setValidationError("PREFLIGHT_NETWORK_ERROR");}finally{setValidatingCertificate(false);}}
  return <section className="certificate-manager">
    <div className="certificate-header"><div><p className="eyebrow">Certificado digital A1</p><h2>{certificate?readiness.message:"Nenhum certificado cadastrado."}</h2><p>O arquivo e a senha são tratados exclusivamente no servidor.</p></div>{certificate?(readiness.ready?<CheckCircle2 className="certificate-icon valid"/>:<XCircle className="certificate-icon invalid"/>):<ShieldAlert className="certificate-icon"/>}</div>
    {certificate&&<dl className="certificate-details"><div><dt>Titular</dt><dd>{certificateHolderName(certificate.subject)}</dd></div><div><dt>CNPJ</dt><dd>{certificate.owner_tax_id?formatTaxId(certificate.owner_tax_id):"Não identificado"}</dd></div><div><dt>Validade</dt><dd>{formatDate(certificate.valid_until)}</dd></div><div><dt>Status</dt><dd><span className={`status ${readiness.warning||!readiness.ready?"warning":""}`}>{readiness.status==="EXPIRING"?"Vence em breve":readiness.status==="VALID"?"Válido":readiness.status}</span></dd></div></dl>}
    {canWrite&&<div className="certificate-upload">
      {certificate&&<><button className="button secondary" type="button" onClick={validateCertificate} disabled={validatingCertificate||!certificate}>{validatingCertificate?"Validando…":"Validar certificado"}</button>{validationResult&&<div className={`alert ${validationResult==="PASS"?"success":"error"}`}><strong>Validação técnica do A1</strong><div>{validationResult==="PASS"?"✓":"✕"} Certificado armazenado</div><div>{validationResult==="PASS"?"✓":"—"} Cofre acessível</div><div>{validationResult==="PASS"?"✓":"—"} PKCS#12 válido</div><div>{validationResult==="PASS"?"✓":"—"} Chave privada encontrada</div><div>{validationResult==="PASS"?"✓":"—"} CNPJ compatível</div><div>{validationResult==="PASS"?"✓":"—"} Fingerprint compatível</div><div>{validationResult==="PASS"?"✓":"—"} Validade</div><div>{validationResult==="PASS"?"✓":"—"} Provider</div><div>{validationResult==="PASS"?"✓":"—"} Assinatura digital</div><p>{validationResult==="PASS"?"Certificado pronto para emissão.":"Não foi possível validar o certificado."}</p>{validationHttp&&<p>{validationHttp}</p>}{validationError&&<p>Código: {validationError}</p>}</div>}</>}
      <label>Arquivo A1 (.pfx ou .p12)<input ref={fileInput} type="file" accept=".pfx,.p12,application/x-pkcs12,application/octet-stream" onChange={event=>setFile(event.target.files?.[0]??null)}/></label><label>Senha do certificado<input type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Informe somente para validar e cadastrar"/></label>{error&&<p className="alert error">{error}</p>}<button className="button primary" type="button" onClick={upload} disabled={saving}><Upload size={18}/>{saving?"Validando…":certificate?"Substituir certificado":"Validar e cadastrar"}</button>
    </div>}
    {!canWrite&&<p className="muted">Somente superadministradores podem cadastrar ou substituir o certificado.</p>}
  </section>;
}
