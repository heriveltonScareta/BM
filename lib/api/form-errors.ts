import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiClientError } from "./client";

/**
 * Aplica erros da API ao formulario:
 * - 422 com `details: [{ path, message }]` -> erro no campo correspondente
 * - 409 (conflito) -> campo cuja regex casar com a mensagem
 */
export function applyApiErrors<T extends FieldValues>(
  error: ApiClientError,
  setError: UseFormSetError<T>,
  conflictFields?: Partial<Record<Path<T>, RegExp>>,
): boolean {
  let applied = false;
  if (error.status === 422 && Array.isArray(error.details)) {
    for (const issue of error.details as Array<{ path: string; message: string }>) {
      if (issue.path) {
        setError(issue.path as Path<T>, { type: "server", message: issue.message });
        applied = true;
      }
    }
  }
  if (error.status === 409 && conflictFields) {
    for (const [field, regex] of Object.entries(conflictFields) as Array<[Path<T>, RegExp]>) {
      if (regex.test(error.message)) {
        setError(field, { type: "server", message: error.message });
        applied = true;
      }
    }
  }
  return applied;
}
