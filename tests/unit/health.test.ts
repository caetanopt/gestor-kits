import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

type HealthBody = {
  data: {
    supabase: {
      projectRef: string | null;
      urlTemFormatoValido: boolean;
      anonKeyConfigurada: boolean;
      anonKeyComprimento: number;
    };
    autenticacaoDesativada: boolean;
  };
};

async function body(): Promise<HealthBody> {
  return (await GET().json()) as HealthBody;
}

describe("/api/health", () => {
  it("extrai o identificador do projeto Supabase", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklm.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave-de-teste";

    const { data } = await body();
    expect(data.supabase.projectRef).toBe("abcdefghijklm");
    expect(data.supabase.urlTemFormatoValido).toBe(true);
    expect(data.supabase.anonKeyConfigurada).toBe(true);
  });

  it("assinala um URL com formato inválido", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "abcdefghijklm.supabase.co";
    const { data } = await body();
    expect(data.supabase.projectRef).toBeNull();
    expect(data.supabase.urlTemFormatoValido).toBe(false);
  });

  it("assinala configuração em falta", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { data } = await body();
    expect(data.supabase.projectRef).toBeNull();
    expect(data.supabase.anonKeyConfigurada).toBe(false);
    expect(data.supabase.anonKeyComprimento).toBe(0);
  });

  it("nunca devolve a chave anon", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklm.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave-secreta-nao-mostrar";

    const raw = await GET().text();
    expect(raw).not.toContain("chave-secreta-nao-mostrar");
    expect(raw).toContain('"anonKeyComprimento":25');
  });

  it("revela quando a autenticação está desativada", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklm.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave";
    process.env.AUTH_BYPASS_EMAIL = "a@b.pt";
    process.env.AUTH_BYPASS_PASSWORD = "x";

    expect((await body()).data.autenticacaoDesativada).toBe(true);
  });
});
