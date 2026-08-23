export type MapyRouteType =
  | 'car_fast'
  | 'car_fast_traffic'
  | 'car_short'
  | 'foot_fast'
  | 'foot_hiking'
  | 'bike_road'
  | 'bike_mountain';

export interface MapyCoordinate {
  lat: number;
  lon: number;
}

export type MapyRoutingRequest =
  | {
    action: 'route';
    params: {
      start: MapyCoordinate;
      end: MapyCoordinate;
      waypoints: MapyCoordinate[];
      routeType: MapyRouteType;
    };
  }
  | {
    action: 'elevation';
    params: { coordinates: Array<[number, number]> };
  };

export class MapyRoutingRequestError extends Error {
  constructor(readonly code: 'REQUEST_TOO_LARGE' | 'INVALID_JSON' | 'INVALID_BODY' | 'INVALID_COORDINATE') {
    super(code);
    this.name = 'MapyRoutingRequestError';
  }
}

const MAX_BODY_BYTES = 32 * 1024;
const MAX_WAYPOINTS = 8;
const MAX_ELEVATION_POINTS = 200;
const ROUTE_TYPES = new Set<MapyRouteType>([
  'car_fast', 'car_fast_traffic', 'car_short', 'foot_fast', 'foot_hiking', 'bike_road', 'bike_mountain',
]);

function objectRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MapyRoutingRequestError('INVALID_BODY');
  return value as Record<string, unknown>;
}

function exactFields(record: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new MapyRoutingRequestError('INVALID_BODY');
}

function finiteInRange(value: unknown, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function coordinate(value: unknown): MapyCoordinate {
  const point = objectRecord(value);
  exactFields(point, ['lat', 'lon']);
  if (!finiteInRange(point.lat, -90, 90) || !finiteInRange(point.lon, -180, 180)) {
    throw new MapyRoutingRequestError('INVALID_COORDINATE');
  }
  if (Number(point.lat) === 0 && Number(point.lon) === 0) throw new MapyRoutingRequestError('INVALID_COORDINATE');
  return { lat: Number(point.lat), lon: Number(point.lon) };
}

function elevationCoordinate(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new MapyRoutingRequestError('INVALID_COORDINATE');
  const [lon, lat] = value;
  if (!finiteInRange(lon, -180, 180) || !finiteInRange(lat, -90, 90) || (lon === 0 && lat === 0)) {
    throw new MapyRoutingRequestError('INVALID_COORDINATE');
  }
  return [Number(lon), Number(lat)];
}

export async function parseMapyRoutingRequest(request: Request): Promise<MapyRoutingRequest> {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new MapyRoutingRequestError('REQUEST_TOO_LARGE');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new MapyRoutingRequestError('REQUEST_TOO_LARGE');
  let value: unknown;
  try {
    value = JSON.parse(raw || '{}');
  } catch {
    throw new MapyRoutingRequestError('INVALID_JSON');
  }
  const body = objectRecord(value);
  exactFields(body, ['action', 'params']);
  const params = objectRecord(body.params);

  if (body.action === 'route') {
    exactFields(params, ['start', 'end', 'waypoints', 'routeType']);
    const waypoints = params.waypoints === undefined ? [] : params.waypoints;
    if (!Array.isArray(waypoints) || waypoints.length > MAX_WAYPOINTS) throw new MapyRoutingRequestError('INVALID_BODY');
    const routeType = params.routeType === undefined ? 'foot_fast' : params.routeType;
    if (typeof routeType !== 'string' || !ROUTE_TYPES.has(routeType as MapyRouteType)) {
      throw new MapyRoutingRequestError('INVALID_BODY');
    }
    return {
      action: 'route',
      params: {
        start: coordinate(params.start),
        end: coordinate(params.end),
        waypoints: waypoints.map(coordinate),
        routeType: routeType as MapyRouteType,
      },
    };
  }

  if (body.action === 'elevation') {
    exactFields(params, ['coordinates']);
    if (!Array.isArray(params.coordinates) || params.coordinates.length < 2 || params.coordinates.length > MAX_ELEVATION_POINTS) {
      throw new MapyRoutingRequestError('INVALID_BODY');
    }
    return { action: 'elevation', params: { coordinates: params.coordinates.map(elevationCoordinate) } };
  }

  throw new MapyRoutingRequestError('INVALID_BODY');
}
