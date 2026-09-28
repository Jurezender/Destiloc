export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function fetchApi(url: string, opcoes?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, opcoes);
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
    );
  }
}
