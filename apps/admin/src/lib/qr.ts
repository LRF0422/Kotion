/**
 * 无依赖 QR Code 编码器（字节模式，版本 1–10，纠错等级 L/M/Q/H）。
 *
 * 实现要点：
 * - GF(256) 上的 Reed-Solomon 纠错，本原多项式 0x11D；
 * - 数据码字按标准块结构分块、计算纠错码字后交织；
 * - 8 种掩码全量评估，按 4 条标准罚分规则取最低分；
 * - 仅依赖 TextEncoder（不可用时退化为手写 UTF-8 编码），不引入任何第三方依赖。
 */

export interface QrOptions {
  /** 纠错等级，默认 'M' */
  level?: 'L' | 'M' | 'Q' | 'H';
}

export interface QrMatrix {
  /** 边长（模块数），等于 17 + 4 * version */
  size: number;
  /** modules[row][col]，true 表示深色模块 */
  modules: boolean[][];
}

type EcLevel = 'L' | 'M' | 'Q' | 'H';

/** 纠错等级 → 格式信息中的 2 bit 编码：L=01, M=00, Q=11, H=10 */
const EC_FORMAT_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/**
 * 版本 → 纠错等级 → [每块纠错码字数, 组1块数, 组1数据码字数, 组2块数, 组2数据码字数]。
 * 组2省略即表示 0 块。
 */
const RS_BLOCKS: Record<number, Record<EcLevel, readonly number[]>> = {
  1: { L: [7, 1, 19], M: [10, 1, 16], Q: [13, 1, 13], H: [17, 1, 9] },
  2: { L: [10, 1, 34], M: [16, 1, 28], Q: [22, 1, 22], H: [28, 1, 16] },
  3: { L: [15, 1, 55], M: [26, 1, 44], Q: [18, 2, 17], H: [22, 2, 13] },
  4: { L: [20, 1, 80], M: [18, 2, 32], Q: [26, 2, 24], H: [16, 4, 9] },
  5: { L: [26, 1, 108], M: [24, 2, 43], Q: [18, 2, 15, 2, 16], H: [22, 2, 11, 2, 12] },
  6: { L: [18, 2, 68], M: [16, 4, 27], Q: [24, 4, 19], H: [28, 4, 15] },
  7: { L: [20, 2, 78], M: [18, 4, 31], Q: [18, 2, 14, 4, 15], H: [26, 4, 13, 1, 14] },
  8: { L: [24, 2, 97], M: [22, 2, 38, 2, 39], Q: [22, 4, 18, 2, 19], H: [26, 4, 14, 2, 15] },
  9: { L: [30, 2, 116], M: [22, 3, 36, 2, 37], Q: [20, 4, 16, 4, 17], H: [24, 4, 12, 4, 13] },
  10: { L: [18, 2, 68, 2, 69], M: [26, 4, 43, 1, 44], Q: [24, 6, 19, 2, 20], H: [28, 6, 15, 2, 16] },
};

/** 版本 → 对齐图形中心坐标（v1 没有对齐图形） */
const ALIGNMENT_POSITIONS: Record<number, readonly number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const MIN_VERSION = 1;
const MAX_VERSION = 10;

// ---------------------------------------------------------------------------
// UTF-8 编码
// ---------------------------------------------------------------------------

/** 手写 UTF-8 编码（TextEncoder 不可用时的兜底，行为与 TextEncoder 一致） */
function manualUtf8(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    // 代理对合并为一个码点；落单的代理按 U+FFFD 处理，与 TextEncoder 保持一致
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

function utf8Encode(text: string): number[] {
  if (typeof TextEncoder !== 'undefined') {
    return Array.from(new TextEncoder().encode(text));
  }
  return manualUtf8(text);
}

// ---------------------------------------------------------------------------
// GF(256) 与 Reed-Solomon
// ---------------------------------------------------------------------------

/** 指数/对数表，本原多项式 0x11D（x^8 + x^4 + x^3 + x^2 + 1） */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGaloisField(): void {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  // 扩展一倍，避免 gfMul 中做取模
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/**
 * 生成多项式 g(x) = Π (x - α^i), i ∈ [0, degree)。
 * 系数按“高位在前”存放，gen[0] 恒为 1。
 */
function rsGeneratorPoly(degree: number): number[] {
  let gen: number[] = [1];
  for (let i = 0; i < degree; i++) {
    const next = gen.concat(0);
    const root = GF_EXP[i];
    for (let j = 0; j < gen.length; j++) {
      next[j + 1] ^= gfMul(gen[j], root);
    }
    gen = next;
  }
  return gen;
}

/** 对数据码字做多项式除法，返回 degree 个纠错码字 */
function rsEncode(data: readonly number[], degree: number): number[] {
  const gen = rsGeneratorPoly(degree);
  const rem = data.concat(new Array<number>(degree).fill(0));
  for (let i = 0; i < data.length; i++) {
    const factor = rem[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      rem[i + j] ^= gfMul(gen[j], factor);
    }
  }
  return rem.slice(data.length);
}

// ---------------------------------------------------------------------------
// 码字构造
// ---------------------------------------------------------------------------

function appendBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function blockSpec(version: number, level: EcLevel): readonly number[] {
  return RS_BLOCKS[version][level];
}

function dataCodewordCount(version: number, level: EcLevel): number {
  const spec = blockSpec(version, level);
  const g2Blocks = spec[3] ?? 0;
  const g2Data = spec[4] ?? 0;
  return spec[1] * spec[2] + g2Blocks * g2Data;
}

/** 字符计数指示符位数：版本 1-9 为 8 位，版本 10 为 16 位 */
function charCountBits(version: number): number {
  return version >= 10 ? 16 : 8;
}

/** 选择能容纳给定字节数的最小版本；超出 v10 容量时抛出 Error */
function pickVersion(byteLength: number, level: EcLevel): number {
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    const capacityBits = dataCodewordCount(v, level) * 8;
    if (4 + charCountBits(v) + byteLength * 8 <= capacityBits) return v;
  }
  const maxBytes = Math.floor(
    (dataCodewordCount(MAX_VERSION, level) * 8 - 4 - charCountBits(MAX_VERSION)) / 8,
  );
  throw new Error(
    `内容过长，超出二维码容量：UTF-8 长度 ${byteLength} 字节，版本 ${MAX_VERSION}-${level} 最多 ${maxBytes} 字节`,
  );
}

/**
 * 生成最终交织后的码字比特流。
 * 流程：模式指示符 → 字符计数 → 数据字节 → 终止符 → 补零至字节边界 → 交替填充 → RS 纠错 → 交织。
 */
function buildCodewords(bytes: readonly number[], version: number, level: EcLevel): number[] {
  const spec = blockSpec(version, level);
  const ecPerBlock = spec[0];
  const g1Blocks = spec[1];
  const g1Data = spec[2];
  const g2Blocks = spec[3] ?? 0;
  const g2Data = spec[4] ?? 0;
  const totalData = g1Blocks * g1Data + g2Blocks * g2Data;
  const capacityBits = totalData * 8;

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4); // 字节模式
  appendBits(bits, bytes.length, charCountBits(version));
  for (const b of bytes) appendBits(bits, b, 8);

  // 终止符最多 4 个 0，但不能越过容量
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  // 补齐到字节边界
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  // 交替填充字节 0xEC / 0x11
  let pad = 0xec;
  while (data.length < totalData) {
    data.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }

  // 分块并逐块计算纠错码字
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  const pushBlock = (len: number): void => {
    const block = data.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    ecBlocks.push(rsEncode(block, ecPerBlock));
  };
  for (let i = 0; i < g1Blocks; i++) pushBlock(g1Data);
  for (let i = 0; i < g2Blocks; i++) pushBlock(g2Data);

  // 交织：先按列取数据码字，再按列取纠错码字
  const out: number[] = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) appendBits(out, block[i], 8);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) appendBits(out, block[i], 8);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 矩阵构造
// ---------------------------------------------------------------------------

function createGrid(size: number, fill: boolean): boolean[][] {
  const grid: boolean[][] = [];
  for (let i = 0; i < size; i++) grid.push(new Array<boolean>(size).fill(fill));
  return grid;
}

function setFunction(
  modules: boolean[][],
  isFunction: boolean[][],
  row: number,
  col: number,
  dark: boolean,
): void {
  modules[row][col] = dark;
  isFunction[row][col] = true;
}

/** 定位图形（含分隔符）：中心 (cx,cy)，切比雪夫距离 0/1/3 为深，2/4 为浅 */
function drawFinderPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  cx: number,
  cy: number,
): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const row = cy + dy;
      const col = cx + dx;
      if (row < 0 || row >= size || col < 0 || col >= size) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(modules, isFunction, row, col, dist !== 2 && dist !== 4);
    }
  }
}

/** 对齐图形：中心 (cx,cy) 的 5×5，切比雪夫距离 0/2 为深，1 为浅 */
function drawAlignmentPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  cx: number,
  cy: number,
): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(modules, isFunction, cy + dy, cx + dx, dist !== 1);
    }
  }
}

/**
 * 绘制格式信息（BCH(15,5)，生成多项式 0x537，掩码 0x5412）。
 * 每个格式位在两处冗余存放，第二处末尾的固定深色模块也在这里写出。
 */
function drawFormatBits(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  level: EcLevel,
  mask: number,
): void {
  const data = (EC_FORMAT_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;

  // 第一份：左上角定位图形周围
  for (let i = 0; i <= 5; i++) setFunction(modules, isFunction, i, 8, bit(i));
  setFunction(modules, isFunction, 7, 8, bit(6));
  setFunction(modules, isFunction, 8, 8, bit(7));
  setFunction(modules, isFunction, 8, 7, bit(8));
  for (let i = 9; i < 15; i++) setFunction(modules, isFunction, 8, 14 - i, bit(i));

  // 第二份：右上角与左下角
  for (let i = 0; i < 8; i++) setFunction(modules, isFunction, 8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) setFunction(modules, isFunction, size - 15 + i, 8, bit(i));

  // 固定深色模块 (4*version + 9, 8)
  setFunction(modules, isFunction, size - 8, 8, true);
}

/** 版本信息（v≥7）：BCH(18,6)，生成多项式 0x1F25，两条 3×6 冗余存放 */
function drawVersionBits(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  version: number,
): void {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunction(modules, isFunction, b, a, dark);
    setFunction(modules, isFunction, a, b, dark);
  }
}

function drawFunctionPatterns(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  version: number,
  level: EcLevel,
): void {
  // 时序图形（先画整行/整列，定位图形与对齐图形会覆盖重叠部分）
  for (let i = 0; i < size; i++) {
    setFunction(modules, isFunction, 6, i, i % 2 === 0);
    setFunction(modules, isFunction, i, 6, i % 2 === 0);
  }

  // 三个定位图形 + 分隔符
  drawFinderPattern(modules, isFunction, size, 3, 3);
  drawFinderPattern(modules, isFunction, size, size - 4, 3);
  drawFinderPattern(modules, isFunction, size, 3, size - 4);

  // 对齐图形（跳过三个定位图形所在的角）
  const positions = ALIGNMENT_POSITIONS[version];
  const last = positions.length - 1;
  for (let i = 0; i < positions.length; i++) {
    for (let j = 0; j < positions.length; j++) {
      const isCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0);
      if (!isCorner) drawAlignmentPattern(modules, isFunction, positions[i], positions[j]);
    }
  }

  // 先用掩码 0 写一遍格式信息，把格式信息区域标记为功能模块
  drawFormatBits(modules, isFunction, size, level, 0);
  drawVersionBits(modules, isFunction, size, version);
}

/**
 * 标准的最右两列向上/向下锯齿形数据布置，跳过竖向时序列（第 6 列）。
 * 每个模块占用 1 bit，高位在前。
 *
 * 注意：版本 2–6 的数据区比「总码字数 × 8」多出 7 个剩余位（v1、v7–v10 为 0）。
 * 这些位置不会被写码字，保持初始浅色（即 0），随后与其它数据模块一起参与掩码运算，
 * 符合标准要求（剩余位编码为 0 后再加掩码）。
 */
function drawCodewords(
  bits: readonly number[],
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
): void {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // 跳过竖向时序列
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < bits.length) {
          modules[y][x] = bits[i] === 1;
          i++;
        }
      }
    }
  }
}

/** 8 种掩码条件，坐标以 (x=列, y=行) 传入 */
function maskCondition(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** 只对非功能模块应用掩码 */
function applyMask(
  modules: boolean[][],
  isFunction: boolean[][],
  size: number,
  mask: number,
): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isFunction[y][x] && maskCondition(mask, x, y)) modules[y][x] = !modules[y][x];
    }
  }
}

/** 罚分规则 1：行/列中连续 5 个及以上同色模块，长度每增加 1 追加 1 分 */
function penaltyRule1(modules: boolean[][], size: number): number {
  let penalty = 0;
  for (let y = 0; y < size; y++) {
    let run = 1;
    for (let x = 1; x < size; x++) {
      if (modules[y][x] === modules[y][x - 1]) {
        run++;
      } else {
        if (run >= 5) penalty += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) penalty += 3 + (run - 5);
  }
  for (let x = 0; x < size; x++) {
    let run = 1;
    for (let y = 1; y < size; y++) {
      if (modules[y][x] === modules[y - 1][x]) {
        run++;
      } else {
        if (run >= 5) penalty += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) penalty += 3 + (run - 5);
  }
  return penalty;
}

/** 罚分规则 2：每个 2×2 同色方块记 3 分 */
function penaltyRule2(modules: boolean[][], size: number): number {
  let penalty = 0;
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        penalty += 3;
      }
    }
  }
  return penalty;
}

/** 判断 [from, to) 区间是否全为浅色（越界部分忽略） */
function isLightRun(
  modules: boolean[][],
  size: number,
  fixed: number,
  from: number,
  to: number,
  horizontal: boolean,
): boolean {
  const start = Math.max(0, from);
  const end = Math.min(to, size);
  for (let i = start; i < end; i++) {
    if (horizontal ? modules[fixed][i] : modules[i][fixed]) return false;
  }
  return true;
}

/** 罚分规则 3：出现 1:1:3:1:1 且一侧有 4 个浅色模块（类似定位图形）记 40 分 */
function penaltyRule3(modules: boolean[][], size: number): number {
  let penalty = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (
        x + 6 < size &&
        modules[y][x] &&
        !modules[y][x + 1] &&
        modules[y][x + 2] &&
        modules[y][x + 3] &&
        modules[y][x + 4] &&
        !modules[y][x + 5] &&
        modules[y][x + 6] &&
        (isLightRun(modules, size, y, x - 4, x, true) ||
          isLightRun(modules, size, y, x + 7, x + 11, true))
      ) {
        penalty += 40;
      }
      if (
        y + 6 < size &&
        modules[y][x] &&
        !modules[y + 1][x] &&
        modules[y + 2][x] &&
        modules[y + 3][x] &&
        modules[y + 4][x] &&
        !modules[y + 5][x] &&
        modules[y + 6][x] &&
        (isLightRun(modules, size, x, y - 4, y, false) ||
          isLightRun(modules, size, x, y + 7, y + 11, false))
      ) {
        penalty += 40;
      }
    }
  }
  return penalty;
}

/** 罚分规则 4：深色占比每偏离 50% 达 5% 记 10 分 */
function penaltyRule4(modules: boolean[][], size: number): number {
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) dark++;
    }
  }
  const total = size * size;
  return Math.floor((Math.abs(dark * 2 - total) * 10) / total) * 10;
}

function penaltyScore(modules: boolean[][], size: number): number {
  return penaltyRule1(modules, size) + penaltyRule2(modules, size) + penaltyRule3(modules, size) + penaltyRule4(modules, size);
}

function cloneGrid(grid: boolean[][]): boolean[][] {
  return grid.map((row) => row.slice());
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/** 生成二维码模块矩阵。内容超出 v10 容量时抛出 Error */
export function qrToMatrix(text: string, options?: QrOptions): QrMatrix {
  if (typeof text !== 'string') throw new Error('二维码内容必须是字符串');
  const level: EcLevel = options?.level ?? 'M';
  if (level !== 'L' && level !== 'M' && level !== 'Q' && level !== 'H') {
    throw new Error(`不支持的纠错等级：${String(level)}`);
  }

  const bytes = utf8Encode(text);
  const version = pickVersion(bytes.length, level);
  const size = 17 + 4 * version;

  const modules = createGrid(size, false);
  const isFunction = createGrid(size, false);

  drawFunctionPatterns(modules, isFunction, size, version, level);

  const bits = buildCodewords(bytes, version, level);
  drawCodewords(bits, modules, isFunction, size);

  // 全量评估 8 种掩码，取罚分最低者
  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestModules = modules;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = cloneGrid(modules);
    applyMask(candidate, isFunction, size, mask);
    drawFormatBits(candidate, isFunction, size, level, mask);
    const score = penaltyScore(candidate, size);
    if (score < bestPenalty) {
      bestPenalty = score;
      bestModules = candidate;
    }
  }

  return { size, modules: bestModules };
}

/** 生成可直接用于 dangerouslySetInnerHTML 的 SVG 字符串 */
export function qrToSvg(
  text: string,
  options?: QrOptions & { size?: number; margin?: number },
): string {
  const size = options?.size ?? 200;
  const margin = options?.margin ?? 4;
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    throw new Error('二维码 size 必须是正数');
  }
  if (typeof margin !== 'number' || !Number.isFinite(margin) || margin < 0) {
    throw new Error('二维码 margin 不能为负数');
  }

  const matrix = qrToMatrix(text, options);
  const n = matrix.size;
  const total = n + margin * 2;

  const rects: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (matrix.modules[y][x]) {
        rects.push(`<rect x="${x + margin}" y="${y + margin}" width="1" height="1" fill="#000000"/>`);
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}"` +
    ` shape-rendering="crispEdges" role="img" aria-label="QR Code">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    rects.join('') +
    `</svg>`
  );
}
