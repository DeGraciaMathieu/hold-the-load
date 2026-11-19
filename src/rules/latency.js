import { SRV_LAT_MIN, DB_LAT_MIN, LAT_SURGE } from '../config.js';

// La latence explose avec le cube de la charge ρ, plafonnée à la saturation.
export function srvLat(rho) { return SRV_LAT_MIN * (1 + LAT_SURGE * Math.pow(Math.min(rho, 1), 3)); }
export function dbLat(rho) { return DB_LAT_MIN * (1 + LAT_SURGE * Math.pow(Math.min(rho, 1), 3)); }
