import { NavLink, Outlet } from "react-router-dom";
import { usePapeis } from "../contexto/PapeisContexto";

export function InsumosLayout() {
  const papeis = usePapeis();

  return (
    <section>
      <h1>Lotes de insumo</h1>
      <nav className="abas">
        <NavLink
          to="/insumos"
          end
          className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
        >
          Todos
        </NavLink>
        {papeis.produtor && (
          <NavLink
            to="/insumos/para-mim"
            className={({ isActive }) => `abas__item${isActive ? " abas__item--ativa" : ""}`}
          >
            Para mim
          </NavLink>
        )}
        {papeis.fornecedor && (
          <NavLink
            to="/insumos/novo"
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
