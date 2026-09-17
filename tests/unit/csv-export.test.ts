import { describe, expect, it } from "vitest";
import { entregasParaCsv, toCsv } from "@/lib/format/csv-export";

/** Sem o BOM, o Excel troca os acentos; sem `;`, junta tudo numa coluna. */
const semBom = (texto: string) => texto.replace(/^﻿/, "");

describe("CSV para o Excel", () => {
  it("começa com BOM e separa por ponto e vírgula", () => {
    const csv = toCsv([
      ["Nome", "Empresa"],
      ["João Silva", "Caetano"],
    ]);

    expect(csv.startsWith("﻿")).toBe(true);
    expect(semBom(csv)).toBe("Nome;Empresa\r\nJoão Silva;Caetano\r\n");
  });

  it("põe entre aspas um valor que contenha o delimitador", () => {
    expect(semBom(toCsv([["Silva; João"]]))).toBe('"Silva; João"\r\n');
  });

  it("duplica as aspas interiores", () => {
    expect(semBom(toCsv([['O "Chefe"']]))).toBe('"O ""Chefe"""\r\n');
  });

  it("mantém uma quebra de linha dentro do valor, entre aspas", () => {
    expect(semBom(toCsv([["Linha 1\nLinha 2"]]))).toBe('"Linha 1\nLinha 2"\r\n');
  });

  it("neutraliza valores que o Excel leria como fórmula", () => {
    // Um nome começado por = seria executado ao abrir o ficheiro.
    expect(semBom(toCsv([["=SOMA(A1:A9)"]]))).toBe("'=SOMA(A1:A9)\r\n");
    expect(semBom(toCsv([["+351 912 345 678"]]))).toBe("'+351 912 345 678\r\n");
    expect(semBom(toCsv([["-8"]]))).toBe("'-8\r\n");
    expect(semBom(toCsv([["@casa"]]))).toBe("'@casa\r\n");
  });

  it("um valor vazio ocupa a sua coluna à mesma", () => {
    expect(semBom(toCsv([["a", "", "c"]]))).toBe("a;;c\r\n");
  });

  it("uma tabela sem linhas não rebenta", () => {
    expect(semBom(toCsv([]))).toBe("\r\n");
  });
});

describe("documento das entregas", () => {
  const data = (iso: string) =>
    iso === "2026-09-17T10:30:00.000Z" ? "17/09/2026, 11:30" : "—";

  const pessoa = {
    companyName: "Caetano Automotive",
    employeeNumber: "12345",
    name: "João Silva",
    email: "joao.silva@caetano.pt",
    deliveredAt: "2026-09-17T10:30:00.000Z",
    deliveredByName: "Bruno Operador",
  };

  it("tem as seis colunas, nesta ordem", () => {
    const linhas = semBom(entregasParaCsv([], data)).trim().split("\r\n");
    expect(linhas[0]).toBe(
      "Empresa;N.º colaborador;Nome;Email;Data de entrega;Entregue por",
    );
  });

  it("escreve uma pessoa por linha", () => {
    const csv = semBom(entregasParaCsv([pessoa], data));
    expect(csv.split("\r\n")[1]).toBe(
      "Caetano Automotive;12345;João Silva;joao.silva@caetano.pt;17/09/2026, 11:30;Bruno Operador",
    );
  });

  it("um colaborador sem email deixa a célula vazia, não um 'null'", () => {
    const csv = semBom(entregasParaCsv([{ ...pessoa, email: null }], data));
    expect(csv).toContain("João Silva;;17/09/2026");
    expect(csv).not.toContain("null");
  });

  it("uma entrega sem data nem operador não parte as colunas", () => {
    const csv = semBom(
      entregasParaCsv([{ ...pessoa, deliveredAt: null, deliveredByName: null }], data),
    );
    const colunas = csv.split("\r\n")[1]!.split(";");
    expect(colunas).toHaveLength(6);
    expect(colunas.slice(4)).toEqual(["", ""]);
  });

  it("sem ninguém, o ficheiro tem só o cabeçalho", () => {
    expect(semBom(entregasParaCsv([], data)).trim().split("\r\n")).toHaveLength(1);
  });

  it("um nome com ponto e vírgula não desalinha o ficheiro", () => {
    const csv = semBom(entregasParaCsv([{ ...pessoa, name: "Silva; João" }], data));
    expect(csv).toContain('"Silva; João"');
  });
});
