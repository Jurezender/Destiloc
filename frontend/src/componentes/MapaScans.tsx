import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface ScanLocalizacao {
  id: number;
  latitude: number;
  longitude: number;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
  escaneadoEm: string;
  suspeito: boolean;
}

interface Props {
  scans: ScanLocalizacao[];
}

const COR_NORMAL = "#4A7C59";
const COR_NORMAL_BORDA = "#2D5038";
const COR_SUSPEITO = "#D49A22";
const COR_SUSPEITO_BORDA = "#8A6800";
const JITTER_GRAUS = 0.004;

export function MapaScans({ scans }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);

  const scansValidos = scans.filter(
    (s) => !(s.latitude === 0 && s.longitude === 0)
  );

  useEffect(() => {
    if (!containerRef.current || mapaRef.current || scansValidos.length === 0)
      return;

    let mapa: L.Map | null = null;

    try {
      mapa = L.map(containerRef.current, { scrollWheelZoom: false });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(mapa);

      // Agrupa por coordenada para aplicar jitter em marcadores sobrepostos
      const grupos = new Map<string, number[]>();
      scansValidos.forEach((scan, idx) => {
        const chave = `${scan.latitude},${scan.longitude}`;
        const grupo = grupos.get(chave) ?? [];
        grupo.push(idx);
        grupos.set(chave, grupo);
      });

      const limites: L.LatLngTuple[] = [];

      scansValidos.forEach((scan, idx) => {
        const chave = `${scan.latitude},${scan.longitude}`;
        const grupo = grupos.get(chave)!;
        const pos = grupo.indexOf(idx);

        let lat = scan.latitude;
        let lon = scan.longitude;

        if (grupo.length > 1) {
          const angulo = (pos / grupo.length) * 2 * Math.PI;
          lat += JITTER_GRAUS * Math.sin(angulo);
          lon += JITTER_GRAUS * Math.cos(angulo);
        }

        const marcador = L.circleMarker([lat, lon], {
          radius: 8,
          fillColor: scan.suspeito ? COR_SUSPEITO : COR_NORMAL,
          color: scan.suspeito ? COR_SUSPEITO_BORDA : COR_NORMAL_BORDA,
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85,
        }).addTo(mapa!);

        const local =
          [scan.cidade, scan.estado].filter(Boolean).join(", ") ||
          scan.pais ||
          "Localização não identificada";
        const data = new Date(scan.escaneadoEm).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        });
        const situacaoHtml = scan.suspeito
          ? `<span class="cp-mapa-popup__alerta">⚠ Consulta suspeita</span>`
          : `<span class="cp-mapa-popup__normal">✓ Consulta normal</span>`;

        marcador.bindPopup(
          `<div class="cp-mapa-popup"><strong>${local}</strong><br>${data}<br>${situacaoHtml}</div>`,
          { maxWidth: 220 }
        );

        limites.push([scan.latitude, scan.longitude]);
      });

      if (limites.length === 1) {
        mapa.setView(limites[0], 10);
      } else {
        mapa.fitBounds(limites as L.LatLngBoundsLiteral, {
          padding: [30, 30],
        });
      }

      mapaRef.current = mapa;
    } catch (erro) {
      console.error("[MapaScans] falha ao inicializar mapa:", erro);
      mapa?.remove();
    }

    return () => {
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
      }
    };
  }, []); // inicializa uma vez após a montagem; scansValidos não muda após carregamento

  if (scansValidos.length === 0) return null;

  return (
    <section className="cp-secao">
      <header className="cp-secao__header">
        <h2 className="cp-secao__titulo">Localização das consultas</h2>
      </header>
      <div className="cp-secao__corpo cp-secao__corpo--sem-padding">
        <div ref={containerRef} className="cp-mapa-container" />
      </div>
    </section>
  );
}
