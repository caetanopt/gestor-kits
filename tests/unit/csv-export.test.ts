import { describe, expect, it } from "vitest";
import { colaboradoresParaCsv, toCsv } from "@/lib/format/csv-export";

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

describe("documento dos colaboradores", () => {
  const data = (iso: string) =>
    iso === "2026-09-17T10:30:00.000Z" ? "17/09/2026, 11:30" : "—";

  const comKit = {
    companyName: "Caetano Automotive",
    employeeNumber: "12345",
    name: "João Silva",
    email: "joao.silva@caetano.pt",
    kitDelivered: true,
    deliveredAt: "2026-09-17T10:30:00.000Z",
    deliveredByName: "Bruno Operador",
  };

  const semKit = {
    companyName: "Caetano Automotive",
    employeeNumber: "12346",
    name: "Ana Costa",
    email: "ana.costa@caetano.pt",
    kitDelivered: false,
    deliveredAt: null,
    deliveredByName: null,
  };

  const linhas = (csv: string) => semBom(csv).split("\r\n");

  it("tem as sete colunas, nesta ordem", () => {
    expect(linhas(colaboradoresParaCsv([], data))[0]).toBe(
      "Empresa;N.º colaborador;Nome;Email;Kit entregue;Data de entrega;Entregue por",
    );
  });

  it("leva quem recebeu e quem não recebeu", () => {
    const l = linhas(colaboradoresParaCsv([comKit, semKit], data));
    expect(l[1]).toContain("João Silva;joao.silva@caetano.pt;Sim;17/09/2026, 11:30");
    expect(l[2]).toContain("Ana Costa;ana.costa@caetano.pt;Não;;");
  });

  it("quem não recebeu não parte as colunas", () => {
    const colunas = linhas(colaboradoresParaCsv([semKit], data))[1]!.split(";");
    expect(colunas).toHaveLength(7);
    expect(colunas.slice(5)).toEqual(["", ""]);
  });

  it("o resumo conta por empresa e no total", () => {
    const outra = { ...semKit, companyName: "Caetano Formula", employeeNumber: "70001" };
    const l = linhas(colaboradoresParaCsv([comKit, semKit, outra], data));
    const resumo = l.slice(l.indexOf("Resumo"));

    expect(resumo[1]).toBe("Empresa;Colaboradores;Entregues;Sem entrega");
    expect(resumo[2]).toBe("Caetano Automotive;2;1;1");
    expect(resumo[3]).toBe("Caetano Formula;1;0;1");
    expect(resumo[4]).toBe("Total;3;1;2");
  });

  it("uma linha em branco separa a lista do resumo", () => {
    const l = linhas(colaboradoresParaCsv([comKit], data));
    expect(l[l.indexOf("Resumo") - 1]).toBe("");
  });

  it("o resumo bate certo com as linhas listadas", () => {
    // Um resumo que contradiga o detalhe logo acima é pior do que não existir.
    const pessoas = [comKit, semKit, { ...comKit, employeeNumber: "12399" }];
    const l = linhas(colaboradoresParaCsv(pessoas, data));
    const listadas = l.slice(1, l.indexOf("")).length;
    const totais = l[l.length - 2]!.split(";");

    expect(listadas).toBe(pessoas.length);
    expect(totais[1]).toBe(String(pessoas.length));
    expect(Number(totais[2]) + Number(totais[3])).toBe(pessoas.length);
  });

  it("as empresas aparecem por ordem alfabética no resumo", () => {
    const l = linhas(
      colaboradoresParaCsv(
        [
          { ...semKit, companyName: "Zeta" },
          { ...semKit, companyName: "Alfa" },
        ],
        data,
      ),
    );
    const resumo = l.slice(l.indexOf("Resumo"));
    expect(resumo[2]!.startsWith("Alfa")).toBe(true);
    expect(resumo[3]!.startsWith("Zeta")).toBe(true);
  });

  it("sem ninguém, o resumo dá zeros e não rebenta", () => {
    const l = linhas(colaboradoresParaCsv([], data));
    expect(l[l.length - 2]).toBe("Total;0;0;0");
  });
});
