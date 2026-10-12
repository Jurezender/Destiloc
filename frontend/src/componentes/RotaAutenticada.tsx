import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexto/AuthContexto";

// Guarda de rota simples: exige apenas login (JWT). Redireciona para /login se não autenticado.
export function RotaAutenticada({ children }: { children: ReactNode }) {
  const { token, carregando } = useAuth();

  if (carregando) return <p>Verificando sessão…</p>;
  if (!token) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
