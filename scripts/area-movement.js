export function tokenInsideArea(region, token, data = {}) {
  if (token.testInsideRegion) return token.testInsideRegion(region, data);
  return (!region.levels?.size || region.levels.has(data.level ?? token.level)) && region.testPoint({ ...token.getCenterPoint(), elevation: data.elevation ?? token.elevation });
}

export function crossesArea(region, token, changes, options) {
  if (options.teleport || !region.segmentizeMovementPath || !token.getContainmentTestPoints) return false;
  const origin = { x: token.x, y: token.y, elevation: token.elevation, level: token.level };
  const destination = { ...origin, ...Object.fromEntries(['x', 'y', 'elevation', 'level'].filter(k => k in changes).map(k => [k, changes[k]])) };
  if (origin.level !== destination.level || (region.levels?.size && !region.levels.has(origin.level))) return false;
  const samples = token.getContainmentTestPoints().map(p => ({ x: p.x - origin.x, y: p.y - origin.y }));
  const waypoints = options.movement?.[token.id]?.waypoints;
  const path = Array.isArray(waypoints) && waypoints.length ? [origin, ...waypoints, destination] : [origin, destination];
  return region.segmentizeMovementPath(path, samples, 0.75).some(segment => segment.type === CONST.REGION_MOVEMENT_SEGMENTS.ENTER);
}
