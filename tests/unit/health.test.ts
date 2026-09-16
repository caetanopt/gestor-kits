import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

type HealthBody = {
  data: {
    status: string;
    supabase: {
      projectRef: string | null;
      origem: string | null;
      temBarraFinal: boolean;
      temCaminho: boolean;
      anonKeyConfigurada: boolean;
      anonKeyComprimento: number;
    };
    problemas: string[];
    avisos: string[];
    autenticacaoDesativada: boolean;
    diagnosticoDeLoginAtivo: boolean;
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
    expect(data.supabase.anonKeyConfigurada).toBe(true);
    expect(data.status).toBe("ok");
    expect(data.problemas).toEqual([]);
  });

  it("assinala um URL com formato inválido", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "abcdefghijklm.supabase.co";
    const { data } = await body();
    expect(data.supabase.projectRef).toBeNull();
    expect(data.status).toBe("configuracao_invalida");
  });

  it("deteta a barra final, que provoca 404 no gateway do Supabase", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklm.supabase.co/";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave";
    const { data } = await body();
    expect(data.supabase.temBarraFinal).toBe(true);
    expect(data.supabase.projectRef).toBe("abcdefghijklm");
  });

  it("deteta um caminho a mais no URL e diz qual é", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklm.supabase.co/rest/v1";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave";
    const { data } = await body();
    expect(data.supabase.temCaminho).toBe(true);
    // A aplicação corrige-o, por isso é aviso e não problema.
    expect(data.status).toBe("ok");
    expect(data.problemas).toEqual([]);
    expect(data.avisos.join(" ")).toContain("/rest/v1");
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

  it("revela quando o diagnóstico de login está ligado", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklm.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave";

    expect((await body()).data.diagnosticoDeLoginAtivo).toBe(false);

    process.env.LOGIN_DIAGNOSTICS = "1";
    expect((await body()).data.diagnosticoDeLoginAtivo).toBe(true);
  });
});
