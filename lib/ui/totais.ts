/**
 * Números do topo do dashboard.
 *
 * Vivem aqui, e não na página, porque a página é um Server Component que
 * importa `server-only` — e então nem o cálculo se consegue testar. São
 * funções puras: recebem os totais por empresa que a página já carregou e
 * não consultam nada.
 */

/** Percentagem de colaboradores que já levantaram o kit. */
export function percent(delivered: number, employees: number): number {
  return employees === 0 ? 0 : Math.round((delivered / employees) * 100);
}

export type TotaisDashboard = {
  delivered: number;
  employees: number;
  porEntregar: number;
};

/**
 * Soma os totais de todas as empresas.
 *
 * Os colaboradores sem kit saem daqui em vez de uma consulta própria: são
 * exatamente o complemento dos entregues, e a página já tem os dois números
 * por empresa.
 */
export function somarTotais(
  companies: { delivered: number; employeeCount: number }[],
): TotaisDashboard {
  const somas = companies.reduce(
    (acc, company) => ({
      delivered: acc.delivered + company.delivered,
      employees: acc.employees + company.employeeCount,
    }),
    { delivered: 0, employees: 0 },
  );

  return {
    ...somas,
    // Nunca negativo: "-1 sem kit" seria pior do que 0 se alguma vez houver
    // uma entrega sem colaborador correspondente.
    porEntregar: Math.max(somas.employees - somas.delivered, 0),
  };
}
