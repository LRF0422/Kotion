export interface MindmapBranchPaletteColor {
  light: string;
  dark: string;
}

export interface MindmapBranchColorAssignment extends MindmapBranchPaletteColor {
  slot: number;
  isOverflow: boolean;
}

export const MINDMAP_BRANCH_PALETTE: readonly MindmapBranchPaletteColor[] = [
  { light: "#3526D9", dark: "#8C36E2" },
  { light: "#2671D9", dark: "#2E67B8" },
  { light: "#2EA1B8", dark: "#28A4BD" },
  { light: "#DA730B", dark: "#DA730B" },
  { light: "#29A33D", dark: "#29A33D" },
] as const;

function hashBranchId(branchId: string): number {
  let hash = 0x811c9dc5;
  for (const character of branchId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createAssignment(
  slot: number,
  isOverflow: boolean,
): MindmapBranchColorAssignment {
  return {
    ...MINDMAP_BRANCH_PALETTE[slot],
    slot,
    isOverflow,
  };
}

export function assignMindmapBranchColors(
  branchIds: readonly string[],
  previousAssignments: ReadonlyMap<
    string,
    MindmapBranchColorAssignment
  > = new Map(),
): Map<string, MindmapBranchColorAssignment> {
  const ids = [...new Set(branchIds)];
  const assignments = new Map<string, MindmapBranchColorAssignment>();
  const usedSlots = new Set<number>();

  for (const branchId of ids) {
    const previous = previousAssignments.get(branchId);
    if (!previous) continue;
    assignments.set(branchId, previous);
    if (!previous.isOverflow) usedSlots.add(previous.slot);
  }

  const unassignedIds = ids
    .filter((branchId) => !assignments.has(branchId))
    .sort((left, right) => {
      const hashDifference = hashBranchId(left) - hashBranchId(right);
      return hashDifference || left.localeCompare(right);
    });

  for (const branchId of unassignedIds) {
    const hash = hashBranchId(branchId);
    const preferredSlot = hash % MINDMAP_BRANCH_PALETTE.length;
    let slot = preferredSlot;
    let attempts = 0;
    while (attempts < MINDMAP_BRANCH_PALETTE.length && usedSlots.has(slot)) {
      attempts += 1;
      slot = (preferredSlot + attempts) % MINDMAP_BRANCH_PALETTE.length;
    }

    if (attempts < MINDMAP_BRANCH_PALETTE.length) {
      usedSlots.add(slot);
      assignments.set(branchId, createAssignment(slot, false));
      continue;
    }

    assignments.set(branchId, createAssignment(preferredSlot, true));
  }

  return assignments;
}
