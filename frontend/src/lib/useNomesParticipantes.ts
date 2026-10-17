import { useEffect, useState } from "react";
import { useAuth } from "../contexto/AuthContexto";
import { API_URL, fetchApi } from "./api";

export interface DadosParticipante {
  empresa: string;
  responsavel: string;
}

/** Retorna a empresa (se houver), senão o responsável, senão o fallback. */
export function nomeResumido(dados: DadosParticipante | undefined, fallback: string): string {
  if (!dados) return fallback;
  return dados.empresa || dados.responsavel || fallback;
}

export function useNomesParticipantes(): Map<string, DadosParticipante> {
  const { token } = useAuth();
  const [nomes, setNomes] = useState<Map<string, DadosParticipante>>(new Map());

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await fetchApi(`${API_URL}/participantes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const { participantes } = (await res.json()) as {
          participantes: { address: string; nome_responsavel: string; nome_empresa: string }[];
        };
        setNomes(
          new Map(
            participantes
              .filter((p) => p.nome_responsavel || p.nome_empresa)
              .map((p) => [
                p.address.toLowerCase(),
                {
                  empresa: p.nome_empresa ?? "",
                  responsavel: p.nome_responsavel ?? "",
                },
              ])
          )
        );
      } catch {
        // endereço exibido como fallback
      }
    })();
  }, [token]);

  return nomes;
}
