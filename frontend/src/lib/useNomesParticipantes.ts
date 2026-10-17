import { useEffect, useState } from "react";
import { useAuth } from "../contexto/AuthContexto";
import { API_URL, fetchApi } from "./api";

export function useNomesParticipantes(): Map<string, string> {
  const { token } = useAuth();
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());

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
                [p.nome_responsavel, p.nome_empresa].filter(Boolean).join(" — "),
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
