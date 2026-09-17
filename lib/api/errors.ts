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
  INVALID_COMPANY: "Erro de configuração: colaborador sem empresa válida.",

  SEARCH_TOO_SHORT: "Escreva pelo menos 3 caracteres para pesquisar por nome ou email.",

  // Anulação
  DELIVERY_NOT_FOUND: "Entrega não encontrada.",
  ALREADY_REVERSED: "Esta entrega já tinha sido anulada.",

  // Empresas
  COMPANY_NOT_FOUND: "Empresa não encontrada.",
  DUPLICATE_COMPANY_CODE: "Já existe uma empresa com este código.",

  // Colaboradores
  DUPLICATE_EMPLOYEE_NUMBER: "Já existe um colaborador com este número.",
  EMPLOYEE_EMAIL_REQUIRED: "O email do colaborador é obrigatório.",

  // Utilizadores
  USER_NOT_FOUND: "Utilizador não encontrado.",
  LAST_ADMIN:
    "Tem de existir sempre pelo menos um administrador ativo. Promova outra pessoa antes de fazer esta alteração.",
  DUPLICATE_USER_EMAIL: "Já existe uma conta com este email.",
  USER_CREATION_UNAVAILABLE:
    "A criação de contas pela aplicação não está configurada. Crie a conta no painel do Supabase.",

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
    case "USER_NOT_FOUND":
      return 404;
    case "ALREADY_DELIVERED":
    case "ALREADY_REVERSED":
    case "DUPLICATE_COMPANY_CODE":
    case "DUPLICATE_EMPLOYEE_NUMBER":
    case "LAST_ADMIN":
    case "DUPLICATE_USER_EMAIL":
      return 409;
    case "VALIDATION_ERROR":
    case "SEARCH_TOO_SHORT":
    case "INVALID_FILE":
    case "INVALID_COMPANY":
    case "EMPLOYEE_EMAIL_REQUIRED":
      return 422;
    case "USER_CREATION_UNAVAILABLE":
      return 501;
    case "INTERNAL_ERROR":
      return 500;
  }
}
