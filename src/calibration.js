import proj4 from 'proj4';
import './geometry.js';
export function calibrate(meta, values) {
  const gsd = Number(values.gsd);
  if (!Number.isFinite(gsd) || gsd < .001 || gsd > 1000) throw new Error('Pixel spacing must be between 0.001 and 1,000 metres.');
  const mode = values.mode;
  if (mode === 'scale') return { ...meta, affine: [gsd, 0, 0, 0, -gsd, 0], crs: null, metric: true, georefSource: 'known scale · location unknown' };
  let east = Number(values.east), north = Number(values.north), crs = mode;
  if (mode === 'WGS84') {
    const lat = Number(values.lat), lon = Number(values.lon);
    if (values.lat === '' || values.lon === '' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) >= 85 || Math.abs(lon) > 180) throw new Error('Enter valid upper-left latitude and longitude (latitude between −85° and 85°).');
    // UTM is local and metric; unlike degree pixels it supports meaningful area.
    const zone = Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
    crs = `EPSG:${(lat < 0 ? 32700 : 32600) + zone}`;
    proj4.defs(crs, `+proj=utm +zone=${zone} ${lat < 0 ? '+south' : ''} +datum=WGS84 +units=m +no_defs`);
    [east, north] = proj4('EPSG:4326', crs, [lon, lat]);
  } else if (!['EPSG:2326', 'EPSG:3857'].includes(mode) || values.east === '' || values.north === '' || !Number.isFinite(east) || !Number.isFinite(north)) throw new Error('Enter valid upper-left easting and northing.');
  return { ...meta, affine: [gsd, 0, east, 0, -gsd, north], crs, metric: true, georefSource: 'user-supplied north-up alignment' };
}
