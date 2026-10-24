import { describe, expect, it } from "vitest";
import { generateClientPassword } from "@/lib/auth/generated-password";
import { passwordSchema } from "@/lib/auth/client-access-model";

describe("senha gerada do acesso do cliente", () => {
  it("4 grupos de 4, sem caracteres que se confundem, aceita pela regra de senha", () => {
    for (let i = 0; i < 200; i++) {
      const senha = generateClientPassword();
      expect(senha).toMatch(/^[a-zA-Z2-9]{4}(-[a-zA-Z2-9]{4}){3}$/);
      expect(senha).not.toMatch(/[01oOlI]/);
      expect(passwordSchema.safeParse(senha).success).toBe(true);
    }
  });

  it("não repete", () => {
    const senhas = new Set(Array.from({ length: 500 }, () => generateClientPassword()));
    expect(senhas.size).toBe(500);
  });
});
