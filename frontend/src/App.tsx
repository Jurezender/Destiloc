import { Navigate, Route, Routes } from "react-router-dom";
import { AreaOperacional } from "./componentes/AreaOperacional";
import { RotaProtegida } from "./componentes/RotaProtegida";
import { ConsultaPublica } from "./paginas/ConsultaPublica";
import { Emitir } from "./paginas/Emitir";
import { Garrafas } from "./paginas/Garrafas";
import { GarrafaDetalhe } from "./paginas/GarrafaDetalhe";
import { Inicio } from "./paginas/Inicio";
import { LoteDetalhe } from "./paginas/LoteDetalhe";
import { Lotes } from "./paginas/Lotes";
import { Participantes } from "./paginas/Participantes";

export function App() {
  return (
    <Routes>
      {/* Pública: sem MetaMask, sem os contextos de carteira/papéis. */}
      <Route path="/consulta/:chainId/:tokenId" element={<ConsultaPublica />} />

      {/* Operacional: exige MetaMask conectada (RotaProtegida cuida disso). */}
      <Route element={<AreaOperacional />}>
        <Route
          index
          element={
            <RotaProtegida>
              <Inicio />
            </RotaProtegida>
          }
        />
        <Route
          path="participantes"
          element={
            <RotaProtegida
              exigirPapel={(p) => p.admin}
              mensagemPapel="Só administradores (em algum dos três contratos) podem gerenciar participantes."
            >
              <Participantes />
            </RotaProtegida>
          }
        />
        <Route
          path="lotes"
          element={
            <RotaProtegida>
              <Lotes />
            </RotaProtegida>
          }
        />
        <Route
          path="lotes/:id"
          element={
            <RotaProtegida>
              <LoteDetalhe />
            </RotaProtegida>
          }
        />
        <Route
          path="lotes/:id/emitir"
          element={
            <RotaProtegida>
              <Emitir />
            </RotaProtegida>
          }
        />
        <Route
          path="garrafas"
          element={
            <RotaProtegida>
              <Garrafas />
            </RotaProtegida>
          }
        />
        <Route
          path="garrafas/:tokenId"
          element={
            <RotaProtegida>
              <GarrafaDetalhe />
            </RotaProtegida>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
