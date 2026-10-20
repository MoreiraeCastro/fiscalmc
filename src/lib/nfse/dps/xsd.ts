import { readdir,readFile } from "node:fs/promises";
import { join } from "node:path";
import { ParseOption,XmlBufferInputProvider,XmlDocument,XmlValidateError,XsdValidator,xmlRegisterInputProvider } from "libxml2-wasm";
import type { NFSeEnvironment } from "../types";

const mainSchema="DPS_v1.01.xsd";
const schemaProvider=new XmlBufferInputProvider({});
let schemaProviderRegistered=false;

export type DpsXsdValidation={valid:boolean;errors:string[]};
type SafeRuntimeDiagnostic={name:string;message:string;code?:string|number};
type DpsXsdRuntimeCode="SCHEMA_DIRECTORY_READ_FAILED"|"SCHEMA_MAIN_NOT_FOUND"|"SCHEMA_PRELOAD_FAILED"|"WASM_VALIDATE_FAILED"|"WASM_MINIMAL_VALIDATE_FAILED";

export class DpsXsdRuntimeError extends Error{
  constructor(public readonly code:DpsXsdRuntimeCode,public readonly diagnostic?:SafeRuntimeDiagnostic){super(code);this.name="DpsXsdRuntimeError";}
}

/** Validates against the official, environment-specific DPS_v1.01 bundle entirely offline. */
export async function validateDpsXml(xml:string,environment:NFSeEnvironment="PRODUCTION_RESTRICTED"):Promise<DpsXsdValidation>{
  return validateAgainstOfficialSchema(mainSchema,xml,environment);
}

/** Same offline validation for the event request (pedRegEvento_v1.01: cancelamento etc.). */
export async function validateEventRequestXml(xml:string,environment:NFSeEnvironment="PRODUCTION_RESTRICTED"):Promise<DpsXsdValidation>{
  return validateAgainstOfficialSchema("pedRegEvento_v1.01.xsd",xml,environment);
}

async function validateAgainstOfficialSchema(mainSchemaFile:string,xml:string,environment:NFSeEnvironment):Promise<DpsXsdValidation>{
  const schemas=await loadDpsSchemas(environment);
  const schema=schemas.find(file=>file.fileName===mainSchemaFile);
  if(!schema)throw new DpsXsdRuntimeError("SCHEMA_MAIN_NOT_FOUND");
  registerOfficialSchemaProvider(schemas,environment);
  let schemaDocument:XmlDocument|undefined;
  let dpsDocument:XmlDocument|undefined;
  let validator:XsdValidator|undefined;
  try{
    schemaDocument=XmlDocument.fromBuffer(Buffer.from(schema.contents),parseOptions(virtualSchemaUrl(environment,schema.fileName)));
    validator=XsdValidator.fromDoc(schemaDocument);
    dpsDocument=XmlDocument.fromString(xml,parseOptions("file:///fiscalmc-dps-input/dps.xml"));
    validator.validate(dpsDocument);
    return {valid:true,errors:[]};
  }catch(error){
    if(error instanceof XmlValidateError)return {valid:false,errors:error.details.map(detail=>safeValidationError(detail.message,detail.line))};
    throw new DpsXsdRuntimeError("WASM_VALIDATE_FAILED",safeRuntimeDiagnostic(error));
  }finally{
    dpsDocument?.dispose();
    validator?.dispose();
    schemaDocument?.dispose();
  }
}

/** Minimal, isolated engine probe used by the authenticated certificate preflight. */
export async function validateXsdRuntimeProbe(){
  const result=validateMinimalXsd("<probe/>");
  if(!result.valid)throw new DpsXsdRuntimeError("WASM_MINIMAL_VALIDATE_FAILED");
}

/** Exported for tests to prove that the WebAssembly XSD engine rejects invalid input. */
export function validateMinimalXsd(xml:string):DpsXsdValidation{
  const schemaContents='<?xml version="1.0" encoding="UTF-8"?><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="probe" type="xs:string"/></xs:schema>';
  let schemaDocument:XmlDocument|undefined;
  let xmlDocument:XmlDocument|undefined;
  let validator:XsdValidator|undefined;
  try{
    schemaDocument=XmlDocument.fromString(schemaContents,parseOptions("file:///fiscalmc-xsd-probe/probe.xsd"));
    validator=XsdValidator.fromDoc(schemaDocument);
    xmlDocument=XmlDocument.fromString(xml,parseOptions("file:///fiscalmc-xsd-probe/probe.xml"));
    validator.validate(xmlDocument);
    return {valid:true,errors:[]};
  }catch(error){
    if(error instanceof XmlValidateError)return {valid:false,errors:error.details.map(detail=>safeValidationError(detail.message,detail.line))};
    throw new DpsXsdRuntimeError("WASM_MINIMAL_VALIDATE_FAILED",safeRuntimeDiagnostic(error));
  }finally{
    xmlDocument?.dispose();
    validator?.dispose();
    schemaDocument?.dispose();
  }
}

export async function listDpsSchemaFiles(environment:NFSeEnvironment="PRODUCTION_RESTRICTED"){
  try{return (await readdir(schemaDirectory(environment))).filter(file=>file.endsWith(".xsd")).sort();}
  catch{throw new DpsXsdRuntimeError("SCHEMA_DIRECTORY_READ_FAILED");}
}

async function loadDpsSchemas(environment:NFSeEnvironment){
  const files=await listDpsSchemaFiles(environment);
  try{return await Promise.all(files.map(async file=>({fileName:file,contents:runtimeSchemaContents(file,await readFile(join(schemaDirectory(environment),file),"utf8"),environment)})));}
  catch{throw new DpsXsdRuntimeError("SCHEMA_PRELOAD_FAILED");}
}

/**
 * The official Production v1.01 bundle uses Java-style anchors in TSSerieDPS.
 * XML Schema regular expressions do not define ^/$ as anchors, and libxml2
 * consequently treats the literal official expression as unsatisfiable. The
 * source bundle remains untouched; only the equivalent runtime expression is
 * supplied to this standards-compliant validator.
 */
function runtimeSchemaContents(fileName:string,contents:string,environment:NFSeEnvironment){
  if(environment!=="PRODUCTION"||fileName!=="tiposSimples_v1.01.xsd")return contents;
  return contents.replace('value="^0{0,4}\\d{1,5}$"','value="0{0,4}\\d{1,5}"');
}

function registerOfficialSchemaProvider(schemas:Awaited<ReturnType<typeof loadDpsSchemas>>,environment:NFSeEnvironment){
  for(const schema of schemas)schemaProvider.addBuffer(virtualSchemaUrl(environment,schema.fileName),Buffer.from(schema.contents));
  if(!schemaProviderRegistered){
    if(!xmlRegisterInputProvider(schemaProvider))throw new DpsXsdRuntimeError("SCHEMA_PRELOAD_FAILED");
    schemaProviderRegistered=true;
  }
}

function schemaDirectory(environment:NFSeEnvironment){return join(process.cwd(),"schemas","nfse",environment==="PRODUCTION"?"production":"production-restricted");}
function virtualSchemaUrl(environment:NFSeEnvironment,fileName:string){return `file:///fiscalmc-dps-schemas/${environment.toLowerCase()}/${fileName}`;}
function parseOptions(url:string){return {url,option:ParseOption.XML_PARSE_NONET|ParseOption.XML_PARSE_NO_XXE};}

function safeValidationError(message:string,lineNumber:number|undefined){
  const element=localXsdName(message.match(/Element '([^']+)'/)?.[1]);
  const facet=message.match(/\[facet '([^']+)'\]/)?.[1];
  const pattern=message.match(/pattern '([^']+)'/)?.[1];
  const value=message.match(/The value '([^']*)'/)?.[1];
  if(element&&facet&&isSafeXsdToken(element)&&isSafeXsdToken(facet)){
    const parts=[`Elemento: ${element}`,`Facet: ${facet}`];
    if(pattern)parts.push(`Pattern esperado: ${safeXsdPattern(pattern)}`);
    if(value!==undefined)parts.push(`Valor: [redacted]`,`Comprimento: ${Array.from(value).length}`,`Características: ${valueShape(value)}`);
    const summary=parts.join("; ");
    return lineNumber?`Linha ${lineNumber}: ${summary}`:summary;
  }
  const redacted=message.replace(/(?:[A-Za-z]:)?[\\/][^\s'\"]+/g,"[path]").replace(/https?:\/\/[^\s'\"]+/g,"[url]").replace(/'[^']*'/g,"'[redacted]'").replace(/\"[^\"]*\"/g,'"[redacted]"').trim();
  return lineNumber?`Linha ${lineNumber}: ${redacted}`:redacted;
}

function isSafeXsdToken(value:string){return /^[A-Za-z_][A-Za-z0-9_.:-]{0,80}$/.test(value);}
function localXsdName(value:string|undefined){
  if(!value)return undefined;
  const local=value.split("}").at(-1)?.split(":").at(-1);
  return local&&isSafeXsdToken(local)?local:undefined;
}
function safeXsdPattern(value:string){return value.replace(/[^A-Za-z0-9\[\]{}()|+*?^$\\,.:\-]/g,"").slice(0,250);}
function valueShape(value:string){
  if(/^\d+$/.test(value))return "somente dígitos";
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return "datetime UTC com milissegundos e sufixo Z";
  if(/^[A-Za-z0-9]+$/.test(value))return "alfanumérico";
  if(/[\p{P}\p{S}]/u.test(value))return "contém pontuação";
  return "texto";
}

function safeRuntimeDiagnostic(error:unknown):SafeRuntimeDiagnostic{
  const candidate=error instanceof Error?error:new Error("Erro não identificado do runtime XSD.");
  const code="code" in candidate&&(typeof candidate.code==="string"||typeof candidate.code==="number")?candidate.code:undefined;
  const message=candidate.message.replace(/(?:[A-Za-z]:)?[\\/][^\s'\"]+/g,"[path]").replace(/https?:\/\/[^\s'\"]+/g,"[url]").slice(0,300);
  return {name:candidate.name||"Error",message,code};
}
