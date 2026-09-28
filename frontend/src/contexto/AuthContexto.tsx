import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { API_URL, fetchApi } from "../lib/api";

const TOKEN_KEY = "destiloc_token";

interface Usuario {
  id: number;
  email: string;
  nome_responsavel?: string;
  nome_empresa?: string;
  tipo_participante?: string | null;
}

export interface Carteira {
  address: string;
  status: string;
}

interface EstadoAuth {
  carregando: boolean;
  usuario: Usuario | null;
  carteira: Carteira | null;
  token: string | null;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
  atualizarCarteira: (c: Carteira | null) => void;
}

const AuthContexto = createContext<EstadoAuth | null>(null);

export function AuthProvedor({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carteira, setCarteira] = useState<Carteira | null>(null);
  const [carregando, setCarregando] = useState(!!localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    if (!token) {
      setUsuario(null);
      setCarteira(null);
      setCarregando(false);
      return;
    }

    let cancelado = false;
    setCarregando(true);

    fetch(`${API_URL}/auth/eu`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          localStorage.removeItem(TOKEN_KEY);
          if (!cancelado) {
            setToken(null);
            setUsuario(null);
            setCarteira(null);
          }
          return;
        }
        const data = (await res.json()) as {
          usuario: Usuario;
          carteira: Carteira | null;
        };
        if (!cancelado) {
          setUsuario(data.usuario);
          setCarteira(data.carteira);
        }
      })
      .catch(() => {
        if (!cancelado) {
          setToken(null);
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [token]);

  const login = useCallback(async (email: string, senha: string) => {
    const res = await fetchApi(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { erro?: string };
      if (res.status === 401) {
        throw new Error("E-mail ou senha incorretos.");
      }
      if (res.status >= 500) {
        throw new Error("Serviço temporariamente indisponível. Tente novamente em instantes.");
      }
      throw new Error(body.erro ?? "Não foi possível fazer login.");
    }

    const data = (await res.json()) as {
      token: string;
      usuario: Usuario;
      carteira: Carteira | null;
    };

    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUsuario(data.usuario);
    setCarteira(data.carteira);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUsuario(null);
    setCarteira(null);
  }, []);

  const atualizarCarteira = useCallback((c: Carteira | null) => {
    setCarteira(c);
  }, []);

  const valor = useMemo<EstadoAuth>(
    () => ({ carregando, usuario, carteira, token, login, logout, atualizarCarteira }),
    [carregando, usuario, carteira, token, login, logout, atualizarCarteira]
  );

  return <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>;
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(AuthContexto);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvedor>.");
  return ctx;
}
