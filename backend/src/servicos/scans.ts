import { obterContrato } from "../blockchain/index.js";
import { obterPool } from "../db/cliente.js";
import { GarrafaNaoEncontradaError } from "./consulta.js";

export { GarrafaNaoEncontradaError };

export interface EntradaScan {
  chainId: number;
  tokenId: string;
  latitude: number;
  longitude: number;
  precisao?: number;
}

export interface ItemHistorico {
  id: number;
  latitude: number;
  longitude: number;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
  escaneadoEm: string;
  suspeito: boolean;
  motivo: string | null;
}

export interface HistoricoScans {
  total: number;
  scans: ItemHistorico[];
}

// Calcula a distância em km entre dois pontos geográficos (fórmula de Haversine).
export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface RegistroAnterior {
  latitude: number;
  longitude: number;
  escaneadoEm: Date;
}

// Detecta velocidade de deslocamento implausível (>500 km/h) comparando com o scan anterior.
export function detectarComportamentoIncomum(
  lat: number,
  lon: number,
  agora: Date,
  anterior: RegistroAnterior | null
): { suspeito: boolean; motivo: string | null } {
  if (!anterior) return { suspeito: false, motivo: null };

  const deltaMs = agora.getTime() - anterior.escaneadoEm.getTime();
  if (deltaMs < 1_000) return { suspeito: false, motivo: null };

  const distanciaKm = haversine(anterior.latitude, anterior.longitude, lat, lon);
  const deltaHoras = deltaMs / 3_600_000;
  const velocidadeKmH = distanciaKm / deltaHoras;

  const LIMIAR_KMH = 500;
  if (velocidadeKmH > LIMIAR_KMH) {
    const minutos = Math.round(deltaMs / 60_000);
    const motivo =
      `Intervalo incompatível com a consulta anterior: ` +
      `${Math.round(distanciaKm)} km em ${minutos} min ` +
      `(velocidade implícita: ${Math.round(velocidadeKmH)} km/h).`;
    return { suspeito: true, motivo };
  }

  return { suspeito: false, motivo: null };
}

interface DadosGeo {
  cidade?: string;
  estado?: string;
  pais?: string;
}

// Converte coordenadas em cidade/estado/país via Nominatim (OpenStreetMap); falha silenciosamente.
async function geocodificarReverso(lat: number, lon: number): Promise<DadosGeo> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${lat}&lon=${lon}&format=json&accept-language=pt-BR`;
    const resposta = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Destiloc-TCC/1.0 (academic; meninasninaslindas@gmail.com)",
      },
    });
    if (!resposta.ok) return {};
    const dado = (await resposta.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        state?: string;
        country?: string;
      };
    };
    return {
      cidade:
        dado.address?.city ??
        dado.address?.town ??
        dado.address?.village ??
        dado.address?.municipality,
      estado: dado.address?.state,
      pais: dado.address?.country,
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

// Salva um scan no banco: verifica existência da garrafa, geocodifica, detecta comportamento suspeito.
export async function registrarScan(entrada: EntradaScan): Promise<void> {
  const pool = obterPool();

  let garrafaEmCache = false;
  try {
    const cacheRes = await pool.query(
      "SELECT 1 FROM garrafa_cache WHERE chain_id = $1 AND token_id = $2",
      [entrada.chainId, entrada.tokenId]
    );
    garrafaEmCache = cacheRes.rows.length > 0;
  } catch (erro) {
    console.warn('[registrarScan] falha ao verificar cache — verificando blockchain:', erro);
  }

  if (!garrafaEmCache) {
    const contrato = obterContrato("ContratoEnvasamento", entrada.chainId);
    const existe = (await contrato.garrafaExiste(entrada.tokenId)) as boolean;
    if (!existe) {
      throw new GarrafaNaoEncontradaError("Esta garrafa não existe.");
    }
  }

  const lat = Math.round(entrada.latitude * 100) / 100;
  const lon = Math.round(entrada.longitude * 100) / 100;

  const geo = await geocodificarReverso(lat, lon);

  const anteriorRes = await pool.query<{
    latitude: string;
    longitude: string;
    escaneado_em: Date;
  }>(
    `SELECT latitude, longitude, escaneado_em
     FROM scan_garrafa
     WHERE chain_id = $1 AND token_id = $2
     ORDER BY escaneado_em DESC
     LIMIT 1`,
    [entrada.chainId, entrada.tokenId]
  );

  const anteriorRow = anteriorRes.rows[0];
  const anterior = anteriorRow
    ? {
        latitude: Number(anteriorRow.latitude),
        longitude: Number(anteriorRow.longitude),
        escaneadoEm: anteriorRow.escaneado_em,
      }
    : null;

  const agora = new Date();
  const { suspeito, motivo } = detectarComportamentoIncomum(lat, lon, agora, anterior);

  await pool.query(
    `INSERT INTO scan_garrafa
     (chain_id, token_id, latitude, longitude, precisao_m, cidade, estado, pais,
      suspeito, motivo_suspeita)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entrada.chainId,
      entrada.tokenId,
      lat,
      lon,
      entrada.precisao ?? null,
      geo.cidade ?? null,
      geo.estado ?? null,
      geo.pais ?? null,
      suspeito,
      motivo,
    ]
  );
}

// Retorna os últimos 50 scans de uma garrafa com dados de localização e suspeita.
export async function listarScans(
  chainId: number,
  tokenId: string
): Promise<HistoricoScans> {
  const pool = obterPool();
  const res = await pool.query<{
    id: string;
    latitude: string;
    longitude: string;
    cidade: string | null;
    estado: string | null;
    pais: string | null;
    escaneado_em: Date;
    suspeito: boolean;
    motivo_suspeita: string | null;
  }>(
    `SELECT id, latitude, longitude, cidade, estado, pais, escaneado_em, suspeito, motivo_suspeita
     FROM scan_garrafa
     WHERE chain_id = $1 AND token_id = $2
     ORDER BY escaneado_em DESC
     LIMIT 50`,
    [chainId, tokenId]
  );

  return {
    total: res.rows.length,
    scans: res.rows.map((row) => ({
      id: Number(row.id),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      cidade: row.cidade,
      estado: row.estado,
      pais: row.pais,
      escaneadoEm: row.escaneado_em.toISOString(),
      suspeito: row.suspeito,
      motivo: row.motivo_suspeita,
    })),
  };
}
