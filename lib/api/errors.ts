/**
 * Códigos de erro da API.
 *
 * O código é estável e destina-se a ser interpretado por código; a mensagem
 * é texto pt-PT destinado a ser mostrado diretamente ao utilizador.
 */
export const ERROR_CODES = {
  // Autenticação e autorização
  UNAUTHENTICATED: "Sessão inválida ou expirada. Inicie sessão novamente.",
  FORBIDDEN: "Não tem permissões para executar esta operação.",
  INACTIVE_ACCOUNT: "A sua conta está desativada. Contacte um administrador.",

  // Validação genérica
  VALIDATION_ERROR: "Os dados enviados são inválidos.",
  INVALID_FILE: "O ficheiro enviado é inválido ou está corrompido.",

  // Fluxo de entrega
  EMPLOYEE_NOT_FOUND: "Colaborador não encontrado.",
  ALREADY_DELIVERED: "Este colaborador já recebeu um kit.",
  NO_STOCK: "A empresa já atingiu o limite de kits.",
  INVALID_COMPANY: "Erro de configuração: colaborador sem empresa válida.",

  // Anulação
  DELIVERY_NOT_FOUND: "Entrega não encontrada.",
  ALREADY_REVERSED: "Esta entrega já tinha sido anulada.",

  // Empresas
  COMPANY_NOT_FOUND: "Empresa não encontrada.",
  DUPLICATE_COMPANY_CODE: "Já existe uma empresa com este código.",
  LIMIT_BELOW_DELIVERED: "O limite não pode ser inferior ao número de kits já entregues.",

  // Colaboradores
  DUPLICATE_EMPLOYEE_NUMBER: "Já existe um colaborador com este número.",

  // Inesperado
  INTERNAL_ERROR: "Ocorreu um erro inesperado. Tente novamente.",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Mapeia um código para a respetiva mensagem pt-PT. */
export function messageFor(code: ErrorCode): string {
  return ERROR_CODES[code];
}

/**
 * Erro aplicacional com código estável. Lançado pelos casos de uso e
 * convertido em resposta HTTP pelos Route Handlers.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, options?: { status?: number; details?: unknown }) {
    super(ERROR_CODES[code]);
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? defaultStatusFor(code);
    this.details = options?.details ?? null;
  }
}

function defaultStatusFor(code: ErrorCode): number {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
    case "INACTIVE_ACCOUNT":
      return 403;
    case "EMPLOYEE_NOT_FOUND":
    case "COMPANY_NOT_FOUND":
    case "DELIVERY_NOT_FOUND":
      return 404;
    case "ALREADY_DELIVERED":
    case "ALREADY_REVERSED":
    case "NO_STOCK":
    case "DUPLICATE_COMPANY_CODE":
    case "DUPLICATE_EMPLOYEE_NUMBER":
    case "LIMIT_BELOW_DELIVERED":
      return 409;
    case "VALIDATION_ERROR":
    case "INVALID_FILE":
    case "INVALID_COMPANY":
      return 422;
    case "INTERNAL_ERROR":
      return 500;
  }
}
