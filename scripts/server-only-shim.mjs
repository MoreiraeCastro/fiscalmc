// Faz o pacote server-only (que só existe no build do Next) virar módulo vazio nos scripts rodados com tsx.
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent("export async function resolve(s,c,n){if(s===\"server-only\")return{url:\"data:text/javascript,\",shortCircuit:true};return n(s,c)}"));
