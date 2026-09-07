import { NavLink, Outlet } from "react-router-dom";
import { StatusCarteira } from "./StatusCarteira";

const LINKS = [
  { para: "/", rotulo: "Início" },
  { para: "/participantes", rotulo: "Participantes" },
  { para: "/insumos", rotulo: "Insumos" },
  { para: "/lotes", rotulo: "Lotes" },
  { para: "/garrafas", rotulo: "Garrafas" },
];

export function Layout() {
  return (
    <div className="layout">
      <header className="layout__cabecalho">
        <span className="layout__titulo">Rastreabilidade de bebidas destiladas</span>
        <nav className="layout__nav">
          {LINKS.map((link) => (
            <NavLink key={link.para} to={link.para} end={link.para === "/"}>
              {link.rotulo}
            </NavLink>
          ))}
        </nav>
        <StatusCarteira />
      </header>
      <main className="layout__conteudo">
        <Outlet />
      </main>
    </div>
  );
}
