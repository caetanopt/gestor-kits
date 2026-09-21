import { describe, expect, it } from "vitest";
import { analyseRows, mapHeaders, normaliseKey } from "@/lib/import/rows";
import { parseCsv } from "@/lib/import/csv";

const COMPANIES = [
  { id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", name: "Empresa A", code: "EMPA" },
  { id: "3f2504e0-4f89-41d3-9a0c-0305e82c3302", name: "Sonae MC", code: "SMC" },
  { id: "3f2504e0-4f89-41d3-9a0c-0305e82c3303", name: "Águas de Portugal", code: "ADP" },
];

const analyse = (csv: string) => analyseRows(parseCsv(csv), COMPANIES);

describe("normaliseKey", () => {
  it("remove acentos, maiúsculas e pontuação", () => {
    expect(normaliseKey("N.º Colaborador")).toBe("ncolaborador");
    expect(normaliseKey("Águas de Portugal")).toBe("aguasdeportugal");
    expect(normaliseKey("  EMPRESA A  ")).toBe("empresaa");
  });
});

describe("mapHeaders", () => {
  it("reconhece os cabeçalhos da especificação", () => {
    expect(mapHeaders(["employee_number", "name", "company"])).toEqual({
      employeeNumber: 0,
      name: 1,
      company: 2,
    });
  });

  it("reconhece cabeçalhos em português com acentos", () => {
    expect(mapHeaders(["N.º Colaborador", "Nome", "Empresa"])).toEqual({
      employeeNumber: 0,
      name: 1,
      company: 2,
    });
  });

  it("aceita as colunas por qualquer ordem", () => {
    expect(mapHeaders(["Empresa", "Nome", "numero"])).toEqual({
      company: 0,
      name: 1,
      employeeNumber: 2,
    });
  });

  it("ignora colunas que não conhece", () => {
    const map = mapHeaders(["numero", "nome", "empresa", "departamento", "notas"]);
    expect(map.employeeNumber).toBe(0);
    expect(Object.keys(map)).toHaveLength(3);
  });
});

describe("analyseRows", () => {
  it("aceita o formato exato da especificação", () => {
    const result = analyse(
      "employee_number,name,company,email\n" +
        "12345,João Silva,Empresa A,joao@a.pt\n" +
        "12346,Ana Costa,Empresa A,ana@a.pt",
    );
    expect(result.issues).toHaveLength(0);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      line: 2,
      employeeNumber: "12345",
      name: "João Silva",
      companyId: COMPANIES[0]!.id,
    });
  });

  it("resolve a empresa ignorando acentos e maiúsculas", () => {
    const result = analyse("numero,nome,empresa,email\n1,Teste,AGUAS DE PORTUGAL,t@a.pt");
    expect(result.issues).toHaveLength(0);
    expect(result.candidates[0]?.companyId).toBe(COMPANIES[2]!.id);
  });

  it("resolve a empresa pelo código quando o nome não bate certo", () => {
    const result = analyse("numero,nome,empresa,email\n1,Teste,SMC,t@a.pt");
    expect(result.candidates[0]?.companyId).toBe(COMPANIES[1]!.id);
  });

  it("dá prioridade ao código quando existem as duas colunas", () => {
    const result = analyse(
      "numero,nome,empresa,codigo,email\n1,Teste,Empresa A,SMC,t@a.pt",
    );
    expect(result.candidates[0]?.companyId).toBe(COMPANIES[1]!.id);
  });

  it("rejeita empresa desconhecida em vez de a criar", () => {
    const result = analyse("numero,nome,empresa,email\n1,Teste,Empresa Fantasma,t@a.pt");
    expect(result.candidates).toHaveLength(0);
    expect(result.issues[0]?.message).toContain("Empresa Fantasma");
    expect(result.issues[0]?.line).toBe(2);
  });

  it("deteta números repetidos dentro do ficheiro", () => {
    const result = analyse(
      "numero,nome,empresa,email\n" +
        "12345,João,Empresa A,j@a.pt\n" +
        "12345,Outro João,Empresa A,o@a.pt",
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.duplicatesInFile).toHaveLength(1);
    expect(result.duplicatesInFile[0]?.message).toContain("linha 2");
  });

  it("assinala a linha em falta sem parar o resto do ficheiro", () => {
    const result = analyse(
      "numero,nome,empresa,email\n" +
        "1,Ana,Empresa A,a@a.pt\n" +
        "2,,Empresa A,x@a.pt\n" +
        "3,Rui,Empresa A,r@a.pt",
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.line).toBe(3);
  });

  it("ignora linhas totalmente vazias", () => {
    const result = analyseRows(
      [
        ["numero", "nome", "empresa", "email"],
        ["1", "Ana", "Empresa A", "a@a.pt"],
        ["", "", "", ""],
        ["2", "Rui", "Empresa A", "r@a.pt"],
      ],
      COMPANIES,
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.issues).toHaveLength(0);
  });

  it("indica que faltam cabeçalhos em vez de processar lixo", () => {
    const result = analyse("coluna1,coluna2\n1,Ana");
    expect(result.candidates).toHaveLength(0);
    // Três cabeçalhos em falta: número, nome e empresa. A análise pára aí e nem
    // chega a olhar para as linhas. Eram 4 quando o email também era exigido.
    expect(result.issues).toHaveLength(3);
    expect(result.issues.every((i) => i.line === 1)).toBe(true);
  });

  it("aceita um ficheiro do Excel português de ponta a ponta", () => {
    const file =
      "﻿N.º Colaborador;Nome;Empresa;E-mail\r\n" +
      '12345;"Silva, João";Empresa A;joao@a.pt\r\n' +
      "12346;Ana Costa;ÁGUAS DE PORTUGAL;ana@adp.pt\r\n";
    const result = analyse(file);
    expect(result.issues).toHaveLength(0);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.name).toBe("Silva, João");
    expect(result.candidates[0]?.email).toBe("joao@a.pt");
    expect(result.candidates[1]?.companyId).toBe(COMPANIES[2]!.id);
  });

  it("lê a coluna de email e normaliza-a", () => {
    const result = analyse(
      "numero,nome,empresa,email\n1,Ana,Empresa A,  Ana@Exemplo.PT  ",
    );
    expect(result.issues).toHaveLength(0);
    expect(result.candidates[0]?.email).toBe("ana@exemplo.pt");
  });

  it("aceita cabeçalhos de email em português", () => {
    for (const cabecalho of ["e-mail", "correio", "Mail"]) {
      const result = analyse(`numero,nome,empresa,${cabecalho}\n1,Ana,Empresa A,a@b.pt`);
      expect(result.candidates[0]?.email, cabecalho).toBe("a@b.pt");
    }
  });

  it("aceita um ficheiro sem coluna de email", () => {
    // Há empresas que só entregam número e nome.
    const result = analyse("numero,nome,empresa\n1,Ana,Empresa A");
    expect(result.issues).toHaveLength(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.email).toBeNull();
  });

  it("aceita a linha com a célula de email vazia", () => {
    const result = analyse("numero,nome,empresa,email\n1,Ana,Empresa A,");
    expect(result.issues).toHaveLength(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.email).toBeNull();
  });

  it("uma linha sem email não contamina as outras", () => {
    const result = analyse(
      "numero,nome,empresa,email\n1,Ana,Empresa A,\n2,Rui,Empresa A,rui@a.pt",
    );
    expect(result.issues).toHaveLength(0);
    expect(result.candidates.map((c) => c.email)).toEqual([null, "rui@a.pt"]);
  });

  it("rejeita a linha com email malformado", () => {
    const result = analyse("numero,nome,empresa,email\n1,Ana,Empresa A,não-é-email");
    expect(result.candidates).toHaveLength(0);
    expect(result.issues[0]?.message).toContain("Email inválido");
  });

  it("uma linha só com email é ignorada como as outras vazias", () => {
    const result = analyse("numero,nome,empresa,email\n1,Ana,Empresa A,a@a.pt\n,,,");
    expect(result.candidates).toHaveLength(1);
  });

  it("rejeita um número de colaborador com caracteres perigosos", () => {
    const result = analyse(
      'numero,nome,empresa,email\n"\'; drop table x; --",Ana,Empresa A,a@a.pt',
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.issues[0]?.message).toContain("inválido");
  });
});

describe("duplicados dentro do ficheiro", () => {
  const EMPRESAS = [
    { id: "3f2504e0-4f89-41d3-9a0c-0305e82c3302", name: "Empresa A", code: "EA" },
  ];

  it("usa a mesma chave que a base de dados, e não uma mais agressiva", () => {
    // `upper(btrim())` é o que a coluna gerada `employee_number_key` calcula.
    // Com uma normalização que retire pontuação, "0012-3" e "00123" colidem e
    // a segunda pessoa é descartada — para a base de dados são duas pessoas.
    const resultado = analyseRows(
      [
        ["numero", "nome", "empresa"],
        ["0012-3", "Pessoa Um", "EA"],
        ["00123", "Pessoa Dois", "EA"],
      ],
      EMPRESAS,
    );

    expect(resultado.candidates.map((c) => c.employeeNumber)).toEqual([
      "0012-3",
      "00123",
    ]);
    expect(resultado.duplicatesInFile).toHaveLength(0);
  });

  it("mas continua a apanhar o repetido a sério, com maiúsculas e espaços", () => {
    const resultado = analyseRows(
      [
        ["numero", "nome", "empresa"],
        ["abc1", "Primeiro", "EA"],
        ["  ABC1  ", "Segundo", "EA"],
      ],
      EMPRESAS,
    );

    expect(resultado.candidates).toHaveLength(1);
    expect(resultado.duplicatesInFile).toHaveLength(1);
  });
});
