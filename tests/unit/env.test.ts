import { describe, expect, it } from "vitest";
import { clientEnv } from "@/lib/env";

/**
 * `clientEnv` memoiza o resultado, por isso cada caso corre num módulo
 * fresco com o ambiente já preparado.
 */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  const previous = { ...process.env };
  Object.assign(process.env, env);
  try {
    const mod = (await import("@/lib/env")) as { clientEnv: typeof clientEnv };
    return mod.clientEnv();
  } finally {
    process.env = previous;
  }
}

import { vi } from "vitest";

describe("NEXT_PUBLIC_SUPABASE_URL", () => {
  const anon = { NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave" };

  it("aceita o formato correto", async () => {
    const env = await load({
      ...anon,
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefg.supabase.co",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcdefg.supabase.co");
  });

  it("remove a barra final, que causa 404 no gateway do Supabase", async () => {
    const env = await load({
      ...anon,
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefg.supabase.co/",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcdefg.supabase.co");
  });

  it("remove várias barras finais", async () => {
    const env = await load({
      ...anon,
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefg.supabase.co///",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcdefg.supabase.co");
  });

  it("remove espaços acidentais da cópia", async () => {
    const env = await load({
      ...anon,
      NEXT_PUBLIC_SUPABASE_URL: "  https://abcdefg.supabase.co  ",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcdefg.supabase.co");
  });

  it("descarta um caminho a mais em vez de rebentar a aplicação", async () => {
    const env = await load({
      ...anon,
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefg.supabase.co/rest/v1",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcdefg.supabase.co");
  });

  it("descarta query e fragmento", async () => {
    const env = await load({
      ...anon,
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefg.supabase.co/?ref=painel#topo",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcdefg.supabase.co");
  });

  it("rejeita http", async () => {
    await expect(
      load({ ...anon, NEXT_PUBLIC_SUPABASE_URL: "http://abcdefg.supabase.co" }),
    ).rejects.toThrow(/https/);
  });

  it("rejeita um valor que não é URL", async () => {
    await expect(
      load({ ...anon, NEXT_PUBLIC_SUPABASE_URL: "abcdefg.supabase.co" }),
    ).rejects.toThrow(/URL completo/);
  });

  it("rejeita configuração em falta", async () => {
    await expect(
      load({
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      }),
    ).rejects.toThrow(/obrigatória/);
  });

  it("remove espaços da chave", async () => {
    const env = await load({
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefg.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "  chave  ",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("chave");
  });
});
