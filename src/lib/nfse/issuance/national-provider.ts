import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { IssueRequest, IssueResult, NFSeProvider } from "../types";
import { SafeFiscalError } from "../errors";
import { buildSefinDpsRequest, type SefinDpsRequest } from "../dps/sefin-request";
import { MtlsHttpClient,MtlsRequestError } from "../client/mtls-http-client";
import { OrganizationCertificateProvider } from "../certificate/organization-provider";
import { endpoints,getNFSeEnvironment } from "../environments";

const successSchema=z.object({chaveAcesso:z.string().regex(/^\d{50}$/),nfseXmlGZipB64:z.string().min(1)}).passthrough();
const rejectionSchema=z.object({erros:z.array(z.object({Codigo:z.string().optional(),Descricao:z.string().optional()}).passthrough()).min(1)}).passthrough();
function findScalar(value:unknown,key:string):string|undefined{if(!value||typeof value!=="object")return undefined;for(const[k,v]of Object.entries(value)){if(k===key&&(typeof v==="string"||typeof v==="number"))return String(v);const nested=findScalar(v,key);if(nested)return nested;}return undefined;}

function assertTransportAuthorized(){
  const environment=getNFSeEnvironment();
  if(process.env.NFSE_PROVIDER!=="national")throw new SafeFiscalError("NATIONAL_TRANSMISSION_NOT_AUTHORIZED","A transmissão nacional ainda não foi autorizada.");
  if(environment==="PRODUCTION"){
    if(process.env.ENABLE_NFSE_PRODUCTION!=="true")throw new SafeFiscalError("PRODUCTION_TRANSMISSION_NOT_AUTHORIZED","A transmissão em Produção ainda não foi autorizada.");
    return environment;
  }
  if(process.env.ENABLE_NFSE_PRODUCTION==="true"||process.env.ENABLE_NFSE_RESTRICTED_TRANSMISSION!=="true")throw new SafeFiscalError("RESTRICTED_TRANSMISSION_NOT_AUTHORIZED","A primeira transmissão em Produção Restrita ainda não foi autorizada.");
  return environment;
}

/**
 * Adaptador deliberadamente bloqueado até a homologação com A1 real, XSD vigente e
 * contrato atual do Swagger. Não transforma exemplos ou schemas antigos em produção.
 */
export class NationalNFSeProvider implements NFSeProvider {
  constructor(private readonly http=new MtlsHttpClient(new OrganizationCertificateProvider())){}
  buildRequest(signedDpsXml:string):SefinDpsRequest{return buildSefinDpsRequest(signedDpsXml);}
  async issue(input: IssueRequest): Promise<IssueResult> {
    const environment=assertTransportAuthorized();
    if(!input.organizationId||!input.preparedPayload)throw new SafeFiscalError("FISCAL_CONFIGURATION_INCOMPLETE","A DPS ainda não está pronta para transmissão.");
    const response=await this.http.postJsonTracked(`${endpoints[environment]}/nfse`,input.preparedPayload,input.organizationId);
    if(response.status===201){
      const parsed=successSchema.safeParse(response.body);
      if(!parsed.success)throw new MtlsRequestError("Resposta de emissão inválida.","POSSIBLY_SENT","INVALID_API_RESPONSE");
      let officialXml:string;try{officialXml=gunzipSync(Buffer.from(parsed.data.nfseXmlGZipB64,"base64")).toString("utf8");}catch{throw new MtlsRequestError("Documento oficial inválido.","POSSIBLY_SENT","INVALID_API_RESPONSE");}
      const nfseNumber=findScalar(new XMLParser({ignoreAttributes:false}).parse(officialXml),"nNFSe");
      if(!nfseNumber)throw new MtlsRequestError("Número da NFS-e ausente.","POSSIBLY_SENT","INVALID_API_RESPONSE");
      return{status:"ISSUED",accessKey:parsed.data.chaveAcesso,nfseNumber,officialXml};
    }
    if(response.status===400){
      const parsed=rejectionSchema.safeParse(response.body);const first=parsed.success?parsed.data.erros[0]:undefined;
      const descricao=first?.Descricao?.replace(/\s+/g," ").trim().slice(0,400);
      // O motivo da Receita é o que diz o que corrigir; antes ficava só no código técnico.
      return{status:"REJECTED",code:first?.Codigo??"SEFIN_REJECTED",safeMessage:descricao?`${first?.Codigo?`${first.Codigo} - `:""}${descricao}`:"A Receita rejeitou a nota sem informar o motivo.",technicalMessage:first?.Descricao??"Rejeição confirmada pela SEFIN."};
    }
    if(response.status===401||response.status===403)throw new SafeFiscalError("SEFIN_CONFIRMED_NO_EMISSION","A SEFIN recusou a autenticação da transmissão.");
    return{status:"UNKNOWN",dpsIdentifier:input.document.dps.identifier,safeMessage:"Estamos confirmando a situação desta nota."};
  }
  async getByAccessKey(accessKey: string): Promise<null> { void accessKey; return null; }
  async getByDpsIdentifier(identifier: string): Promise<null> { void identifier; return null; }
  async getMunicipalParameters(municipalityCode: string, serviceCode: string): Promise<Record<string, unknown>> { void municipalityCode; void serviceCode; throw new SafeFiscalError("NFSE_NATIONAL_NOT_HOMOLOGATED", "A consulta nacional ainda não foi homologada."); }
}
