import { createHash } from 'node:crypto';

function canonicalizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonicalizar);
  if (valor !== null && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, canonicalizar(obj[k])])
    );
  }
  return valor;
}

// Remove geradoEm (timestamp de geração) antes de calcular o hash para garantir
// que o mesmo conteúdo lógico sempre produza o mesmo hash, independentemente
// de quando foi gerado — evitando uploads duplicados ao Pinata.
export function calcularHashConteudo(conteudo: Record<string, unknown>): string {
  const { geradoEm: _, ...semTimestamp } = conteudo;
  const json = JSON.stringify(canonicalizar(semTimestamp));
  return createHash('sha256').update(json).digest('hex');
}
