import { NavLink, Outlet } from "react-router-dom";
import { usePapeis } from "../contexto/PapeisContexto";

export function LotesLayout() {
  const papeis = usePapeis();

  return (
    <section>
      <h1>Lotes de produção</h1>
      <nav className="abas">
        <NavLink
          to="/lotes"
          end
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          Todos
        </NavLink>
        {papeis.envasador && (
          <NavLink
            to="/lotes/para-mim"
            className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
          >
            Para mim
          </NavLink>
        )}
        {papeis.produtor && (
          <NavLink
            to="/lotes/novo"
            className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
          >
            Novo lote
          </NavLink>
        )}
      </nav>
      <Outlet />
    </section>
  );
}
