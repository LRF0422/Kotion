export function allocateContainerId(base: string, used: Set<string>): string {
  const safeBase = (base || "container").slice(0, 190);
  if (!used.has(safeBase)) {
    used.add(safeBase);
    return safeBase;
  }
  let suffix = 2;
  while (used.has(`${safeBase.slice(0, 188)}-${suffix}`)) suffix += 1;
  const id = `${safeBase.slice(0, Math.max(1, 199 - String(suffix).length))}-${suffix}`;
  used.add(id);
  return id;
}
