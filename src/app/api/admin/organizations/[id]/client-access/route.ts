import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOfficeSession } from "@/lib/auth/session";
import { can } from "@/lib/security/authorization";
import { ClientAccessError, createClientAccessService } from "@/lib/auth/client-access-service";
import { passwordConfirmationSchema } from "@/lib/auth/client-access-model";
import { generateClientPassword } from "@/lib/auth/generated-password";

export const runtime = "nodejs";

const organizationIdSchema = z.string().uuid();
const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("BLOCK") }),
  z.object({ action: z.literal("REACTIVATE") }),
  z.object({ action: z.literal("REPAIR"), password: z.string(), confirmPassword: z.string() }),
  z.object({ action: z.literal("RESET_PASSWORD"), password: z.string(), confirmPassword: z.string() }),
  // "Gerar acesso": a senha é gerada aqui e devolvida uma única vez (generatedPassword).
  z.object({ action: z.literal("REPAIR_GENERATED") }),
  z.object({ action: z.literal("RESET_PASSWORD_GENERATED") }),
]);
const createGeneratedSchema = z.object({ generate: z.literal(true) });

function responseFor(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Revise os dados informados." }, { status: 400 });
  if (error instanceof ClientAccessError) {
    if (error.code === "ORGANIZATION_NOT_FOUND" || error.code === "CLIENT_ACCESS_NOT_FOUND") return NextResponse.json({ error: "Acesso do cliente não encontrado." }, { status: 404 });
    if (error.code === "CLIENT_ACCESS_ALREADY_EXISTS") return NextResponse.json({ error: "Esta empresa já possui um acesso principal." }, { status: 409 });
    if (error.code === "PASSWORD_INVALID") return NextResponse.json({ error: "A senha deve ter pelo menos 8 caracteres." }, { status: 422 });
    if (error.code === "INVALID_ORGANIZATION_CNPJ") return NextResponse.json({ error: "O CNPJ da empresa precisa ser revisado antes de criar o acesso." }, { status: 422 });
  }
  return NextResponse.json({ error: "Não foi possível atualizar o acesso do cliente." }, { status: 422 });
}

async function authorize(permission: "client-access:read" | "client-access:write") {
  const session = await requireOfficeSession();
  if (!can(session.role, permission)) throw new Error("FORBIDDEN_CLIENT_ACCESS");
  return session;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorize("client-access:read");
    const { id } = await params;
    organizationIdSchema.parse(id);
    return NextResponse.json(await createClientAccessService().getSummary(id));
  } catch (error) {
    if (error instanceof Error && ["FORBIDDEN_CLIENT_ACCESS", "FORBIDDEN_OFFICE", "UNAUTHENTICATED"].includes(error.message)) return NextResponse.json({ error: "Acesso do escritório necessário." }, { status: 403 });
    return responseFor(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authorize("client-access:write");
    const { id } = await params;
    organizationIdSchema.parse(id);
    const body = await request.json();
    const generated = createGeneratedSchema.safeParse(body).success ? generateClientPassword() : null;
    const password = generated ?? passwordConfirmationSchema.parse(body).password;
    const result = await createClientAccessService().create({ organizationId: id, password, actorUserId: session.userId });
    return NextResponse.json({ ...result, ...(generated ? { generatedPassword: generated } : {}) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && ["FORBIDDEN_CLIENT_ACCESS", "FORBIDDEN_OFFICE", "UNAUTHENTICATED"].includes(error.message)) return NextResponse.json({ error: "Seu perfil não pode criar acessos." }, { status: 403 });
    return responseFor(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await authorize("client-access:write");
    const { id } = await params;
    organizationIdSchema.parse(id);
    const input = patchSchema.parse(await request.json());
    const service = createClientAccessService();
    if (input.action === "REPAIR_GENERATED" || input.action === "RESET_PASSWORD_GENERATED") {
      const generatedPassword = generateClientPassword();
      const generatedResult = input.action === "REPAIR_GENERATED"
        ? await service.repairInvalid({ organizationId: id, actorUserId: session.userId, password: generatedPassword })
        : await service.resetPassword({ organizationId: id, actorUserId: session.userId, password: generatedPassword });
      return NextResponse.json({ ...generatedResult, generatedPassword }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = input.action === "BLOCK"
      ? await service.block({ organizationId: id, actorUserId: session.userId })
      : input.action === "REACTIVATE"
        ? await service.reactivate({ organizationId: id, actorUserId: session.userId })
        : input.action === "REPAIR"
          ? await service.repairInvalid({ organizationId: id, actorUserId: session.userId, password: passwordConfirmationSchema.parse(input).password })
        : await service.resetPassword({ organizationId: id, actorUserId: session.userId, password: passwordConfirmationSchema.parse(input).password });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && ["FORBIDDEN_CLIENT_ACCESS", "FORBIDDEN_OFFICE", "UNAUTHENTICATED"].includes(error.message)) return NextResponse.json({ error: "Seu perfil não pode alterar acessos." }, { status: 403 });
    return responseFor(error);
  }
}
