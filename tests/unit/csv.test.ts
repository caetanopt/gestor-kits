import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, stripBom } from "@/lib/import/csv";

describe("stripBom", () => {
  it("remove o BOM que o Excel escreve", () => {
    expect(stripBom("﻿employee_number")).toBe("employee_number");
  });

  it("não mexe em texto sem BOM", () => {
    expect(stripBom("employee_number")).toBe("employee_number");
  });
});

describe("detectDelimiter", () => {
  it("deteta a vírgula", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
  });

  it("deteta o ponto e vírgula do Excel português", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
  });

  it("deteta a tabulação", () => {
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
  });

  it("ignora separadores dentro de aspas", () => {
    // Uma vírgula real, três dentro de aspas: o ponto e vírgula ganha.
    expect(detectDelimiter('"Silva, João";12345;"Empresa A, Lda"')).toBe(";");
  });

  it("lida com BOM antes do cabeçalho", () => {
    expect(detectDelimiter("﻿a;b;c")).toBe(";");
  });
});

describe("parseCsv", () => {
  it("lê o formato da especificação", () => {
    const rows = parseCsv("employee_number,name,company\n12345,João Silva,Empresa A");
    expect(rows).toEqual([
      ["employee_number", "name", "company"],
      ["12345", "João Silva", "Empresa A"],
    ]);
  });

  it("lê campos entre aspas com o separador lá dentro", () => {
    const rows = parseCsv('12345,"Silva, João",Empresa A');
    expect(rows[0]).toEqual(["12345", "Silva, João", "Empresa A"]);
  });

  it("interpreta aspas duplicadas como uma aspa literal", () => {
    const rows = parseCsv('12345,"Alcunha ""Zé""",Empresa A');
    expect(rows[0]?.[1]).toBe('Alcunha "Zé"');
  });

  it("aceita quebras de linha dentro de um campo entre aspas", () => {
    const rows = parseCsv('12345,"Linha 1\nLinha 2",Empresa A');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[1]).toBe("Linha 1\nLinha 2");
  });

  it("aceita CRLF", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("aceita CR isolado (Excel antigo do Mac)", () => {
    expect(parseCsv("a,b\r1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("descarta linhas em branco, incluindo a última", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserva campos vazios no meio da linha", () => {
    expect(parseCsv("12345,,Empresa A")[0]).toEqual(["12345", "", "Empresa A"]);
  });

  it("lê a última linha sem quebra final", () => {
    expect(parseCsv("a,b\n1,2")).toHaveLength(2);
  });

  it("lê um ficheiro real do Excel português", () => {
    const file = '﻿employee_number;name;company\r\n12345;"Silva, João";Empresa A\r\n';
    expect(parseCsv(file)).toEqual([
      ["employee_number", "name", "company"],
      ["12345", "Silva, João", "Empresa A"],
    ]);
  });
});
