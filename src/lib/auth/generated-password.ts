import "server-only";
import { randomInt } from "node:crypto";

// Sem caracteres que se confundem ao ditar ou ler (0/O, 1/l/I): 54 símbolos.
const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Senha do acesso do cliente gerada pelo servidor ("Gerar acesso"): 4 grupos de 4, ex. "Kp7m-Qx3r-Vd9a-Hs2e" (~92 bits).
 * Volta uma única vez para a tela do escritório; não é guardada nem registrada em log.
 */
export function generateClientPassword() {
  const grupos = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join(""));
  return grupos.join("-");
}
