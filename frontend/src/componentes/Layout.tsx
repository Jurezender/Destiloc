import { BottleWine, FlaskConical, Home, Leaf, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { StatusCarteira } from "./StatusCarteira";

const LINKS = [
  { para: "/",              rotulo: "Início",        Icone: Home         },
  { para: "/participantes", rotulo: "Participantes", Icone: Users        },
  { para: "/insumos",       rotulo: "Insumos",       Icone: Leaf         },
  { para: "/lotes",         rotulo: "Lotes",         Icone: FlaskConical },
  { para: "/garrafas",      rotulo: "Garrafas",      Icone: BottleWine   },
];

export function Layout() {
  return (
    <div className="layout">
      <header className="layout__cabecalho">
        <span className="layout__titulo">Destiloc</span>
        <nav className="layout__nav">
          {LINKS.map(({ para, rotulo, Icone }) => (
            <NavLink key={para} to={para} end={para === "/"}>
              <Icone size={15} strokeWidth={1.75} aria-hidden="true" />
              {rotulo}
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
