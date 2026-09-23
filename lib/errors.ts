/**
 * Erros de aplicacao. Todo route handler converte estes erros em respostas HTTP
 * via `withApi` (lib/api/handler.ts). Mensagens sempre em pt-BR.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status = 400, code = "APP_ERROR", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Registro não encontrado.") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Sessão inválida ou expirada.") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Dados inválidos.", details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, "CONFLICT", details);
    this.name = "ConflictError";
  }
}

export class TransitionError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, "INVALID_TRANSITION", details);
    this.name = "TransitionError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Muitas tentativas. Aguarde alguns instantes e tente novamente.") {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}
