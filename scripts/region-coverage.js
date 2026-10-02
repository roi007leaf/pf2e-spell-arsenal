export function regionCoverage(region, level, grid) {
  const measured = region.getCoverage?.(level);
  if (measured) return measured;
  // Core regions expose their combined geometry, including holes and disjoint shapes.
  if (!region.polygonTree || !region.bounds || !grid.getOffsetRange) return null;
  const [i0, j0, i1, j1] = grid.getOffsetRange(region.bounds);
  const covered = [];
  if ((i1 - i0) * (j1 - j0) > 10000) throw new Error('Spell area is too large to calculate safely.');
  for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
    const offset = { i, j };
    if (region.polygonTree.testPoint(grid.getCenterPoint(offset))) covered.push(offset);
    if (covered.length > 120) throw new Error('Spell areas support up to 120 cells.');
  }
  return { covered };
}
