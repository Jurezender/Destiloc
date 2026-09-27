import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";

export function RotaAutenticada({ children }: { children: ReactNode }) {
  const { token, carregando } = useAuth();

  if (carregando) return <p>Verificando sessão…</p>;
  if (!token) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
