import type { MapId } from '../maps/IMapSystem';

export type DropPhase = 'inactive' | 'waiting' | 'airplane' | 'freefall' | 'parachute' | 'landed';

export interface FlightPathSpec {
  id: string;
  label: string;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  altitude: number;
  speedMps: number;
}

export interface AirplaneDropSnapshot {
  phase: DropPhase;
  mapId: MapId;
  mapName: string;
  flightLabel: string;
  waitingRemainingSec: number;
  waitingDurationSec: number;
  altitudeMeters: number;
  groundElevationMeters: number;
  flightProgress: number; // 0..1
  verticalSpeedMps: number;
  horizontalSpeedMps: number;
  totalSpeedMps: number;
  canJump: boolean;
  canDeployParachute: boolean;
  autoDeployDelaySec: number;
  autoDeployRemainingSec: number;
  deployMaxAltitudeMeters: number;
  autoDeployAltitudeMeters: number;
  airplaneX: number;
  airplaneY: number;
  airplaneZ: number;
  flightStartX: number;
  flightStartZ: number;
  flightEndX: number;
  flightEndZ: number;
  airplaneHeadingRad: number;
  timeRemainingInPlaneSec: number;
}

/**
 * Curated predefined flight paths across all three 1.1 km maps, crossing major cities,
 * military bases, villages, rivers/lakes, and central plazas at ~198-204m altitude.
 */
export const MAP_FLIGHT_PATHS: Record<MapId, readonly FlightPathSpec[]> = {
  desert: [
    {
      id: 'desert-corridor-nw-se',
      label: 'SUNSTONE → SCORCH MILITARY',
      startX: -505,
      startZ: -495,
      endX: 505,
      endZ: 495,
      altitude: 200,
      speedMps: 36,
    },
    {
      id: 'desert-corridor-sw-ne',
      label: 'SANDSTONE → MIRAGE RESORT',
      startX: -495,
      startZ: 495,
      endX: 495,
      endZ: -495,
      altitude: 200,
      speedMps: 36,
    },
    {
      id: 'desert-corridor-w-e',
      label: 'CANYON REFINERY → DUSTBOWL',
      startX: -525,
      startZ: -25,
      endX: 525,
      endZ: 28,
      altitude: 202,
      speedMps: 36,
    },
  ],
  forest: [
    {
      id: 'forest-corridor-nw-se',
      label: 'EMERALD ESTATES → IRONWOOD BASE',
      startX: -500,
      startZ: -490,
      endX: 500,
      endZ: 490,
      altitude: 198,
      speedMps: 36,
    },
    {
      id: 'forest-corridor-sw-ne',
      label: 'PINEWOOD → OAKRIDGE METROPOLIS',
      startX: -500,
      startZ: 485,
      endX: 500,
      endZ: -485,
      altitude: 198,
      speedMps: 36,
    },
    {
      id: 'forest-corridor-s-n',
      label: 'SAWMILL DEPOT → NORTHGATE',
      startX: -32,
      startZ: 515,
      endX: 34,
      endZ: -515,
      altitude: 200,
      speedMps: 36,
    },
  ],
  snow: [
    {
      id: 'snow-corridor-nw-se',
      label: 'FROSTHAVEN → CRYO CITADEL',
      startX: -505,
      startZ: -495,
      endX: 505,
      endZ: 495,
      altitude: 204,
      speedMps: 36,
    },
    {
      id: 'snow-corridor-sw-ne',
      label: 'ALPINE VILLAGE → AURORA VILLAS',
      startX: -495,
      startZ: 495,
      endX: 495,
      endZ: -495,
      altitude: 204,
      speedMps: 36,
    },
    {
      id: 'snow-corridor-e-w',
      label: 'TUNDRA REFINERY → SNOWDRIFT',
      startX: 520,
      startZ: -28,
      endX: -520,
      endZ: 28,
      altitude: 204,
      speedMps: 36,
    },
  ],
};
