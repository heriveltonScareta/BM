/** Remove tudo que nao e digito. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Valida CNPJ pelos dois digitos verificadores.
 * Rejeita sequencias repetidas (00000000000000, 11111111111111, ...).
 */
export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value ?? "");
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]): number => {
    const sum = base.split("").reduce((acc, ch, i) => acc + Number(ch) * (weights[i] ?? 0), 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(cnpj.slice(0, 12), w1);
  const d2 = calcDigit(cnpj.slice(0, 12) + String(d1), w2);
  return cnpj[12] === String(d1) && cnpj[13] === String(d2);
}

/** 12345678000195 -> 12.345.678/0001-95 */
export function formatCnpj(value: string): string {
  const d = onlyDigits(value ?? "");
  if (d.length !== 14) return value;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Aplica a mascara progressivamente enquanto o usuario digita. */
export function maskCnpj(value: string): string {
  const d = onlyDigits(value ?? "").slice(0, 14);
  let out = d;
  if (d.length > 2) out = `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length > 5) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 8) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 12)
    out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return out;
}
