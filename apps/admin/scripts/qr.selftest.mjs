#!/usr/bin/env node
/**
 * qr.ts 自测脚本（无第三方依赖，不使用任何 QR 库）。
 *
 * 运行方式（在仓库根目录）：
 *   node apps/admin/scripts/qr.selftest.mjs
 *
 * 编译方式说明：
 *   src/lib/qr.ts 是 TypeScript，本脚本优先用仓库里已存在的 esbuild
 *   （apps/admin/node_modules/.bin/esbuild 或 node_modules/.bin/esbuild）
 *   把 qr.ts 转译成临时目录下的 qr.mjs，然后动态 import。
 *   esbuild 不可用时回退到同目录下的 tsc（--target ES2020 --module ESNext）。
 *   两者都不可用时脚本直接报错退出，不做正则剥离类型的降级（因为本仓库
 *   两个二进制都存在，见上面的路径）。
 *   可用环境变量 QR_SELFTEST_BUILD=esbuild|tsc 强制指定编译方式（便于测试回退路径）。
 *
 * 校验内容（对全部输入 × L/M/Q/H）：
 *   1. size === 17 + 4 * version（version 由独立实现的容量表推算）
 *   2. 三个定位图形的 7×7 环形结构 + 分隔符全为浅色
 *   3. 第 6 行 / 第 6 列时序图形在定位图形之间正确交替
 *   4. 固定深色模块 (4*version + 9, 8) 为深色
 *   5. 往返解码：用格式信息中的掩码反掩码 → 锯齿序读码字 → 反交织 → 去掉纠错码字
 *      → 解析模式指示符 + 字符计数 + 字节 → UTF-8 还原必须与输入完全一致
 *   6. 格式信息（两份副本）解码回请求的纠错等级与合法掩码 id
 *   7. qrToSvg 输出含 '<svg'、viewBox/宽高正确、深色模块矩形数量与矩阵一致
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// 独立于 qr.ts 的标准常量（用于交叉校验，故意重复一份）
// ---------------------------------------------------------------------------

/** 版本 → 纠错等级 → [每块纠错码字, 组1块数, 组1数据码字, 组2块数, 组2数据码字] */
const RS_BLOCKS = {
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

/** 每个版本的总码字数（用于校验上面的表） */
const TOTAL_CODEWORDS = { 1: 26, 2: 44, 3: 70, 4: 100, 5: 134, 6: 172, 7: 196, 8: 242, 9: 292, 10: 346 };

/** 版本 → 对齐图形中心坐标 */
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/** 版本 → 数据区末尾的剩余位（标准值：v1=0，v2–v6=7，v7–v10=0） */
const REMAINDER_BITS = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 };

/** 版本 → 数据区模块总数（= 总码字数×8 + 剩余位），由标准功能图形布局独立推导 */
const DATA_REGION_MODULES = { 1: 208, 2: 359, 3: 567, 4: 807, 5: 1079, 6: 1383, 7: 1568, 8: 1936, 9: 2336, 10: 2768 };

/** 纠错等级 ↔ 格式信息 2bit */
const LEVEL_TO_BITS = { L: 1, M: 0, Q: 3, H: 2 };
const BITS_TO_LEVEL = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };

const LEVELS = ['L', 'M', 'Q', 'H'];

// ---------------------------------------------------------------------------
// 断言
// ---------------------------------------------------------------------------

let checks = 0;
function check(cond, msg) {
  checks++;
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, msg) {
  check(actual === expected, `${msg}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`);
}

// ---------------------------------------------------------------------------
// 编译 qr.ts → 临时 .mjs
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const adminRoot = resolve(here, '..');
const repoRoot = resolve(adminRoot, '..', '..');
const srcFile = join(adminRoot, 'src', 'lib', 'qr.ts');

const binNames = process.platform === 'win32' ? ['esbuild.cmd', 'esbuild'] : ['esbuild'];
function findBin(pkg) {
  const dirs = [join(adminRoot, 'node_modules', '.bin'), join(repoRoot, 'node_modules', '.bin')];
  for (const dir of dirs) {
    for (const name of (process.platform === 'win32' ? [`${pkg}.cmd`, pkg] : [pkg])) {
      const p = join(dir, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

async function loadQrModule() {
  const outDir = join(tmpdir(), `kn-qr-selftest-${process.pid}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'qr.mjs');

  const forced = process.env.QR_SELFTEST_BUILD;
  const esbuild = binNames.map(findBin).find(Boolean) || null;
  const tsc = findBin('tsc');
  let mode = '';

  if (forced !== 'tsc' && esbuild) {
    execFileSync(esbuild, [srcFile, '--format=esm', '--target=es2020', `--outfile=${outFile}`, '--log-level=warning'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    mode = 'esbuild';
  } else if (tsc) {
    const srcDir = join(outDir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'qr.ts'), readFileSync(srcFile));
    const tscOut = join(outDir, 'out');
    execFileSync(tsc, [
      join(srcDir, 'qr.ts'),
      '--target', 'ES2020',
      '--module', 'ESNext',
      '--moduleResolution', 'bundler',
      '--rootDir', srcDir,
      '--outDir', tscOut,
      '--skipLibCheck',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    renameSync(join(tscOut, 'qr.js'), outFile);
    mode = 'tsc';
  } else {
    throw new Error('找不到 esbuild 或 tsc，无法转译 src/lib/qr.ts（可手动转译后 import）');
  }

  const mod = await import(pathToFileURL(outFile).href);
  return { mod, mode };
}

// ---------------------------------------------------------------------------
// 独立实现的容量/功能模块/掩码/格式信息工具（不依赖 qr.ts 内部实现）
// ---------------------------------------------------------------------------

function blockSpec(version, level) {
  const s = RS_BLOCKS[version][level];
  return { ec: s[0], g1Blocks: s[1], g1Data: s[2], g2Blocks: s[3] || 0, g2Data: s[4] || 0 };
}
function dataCodewords(version, level) {
  const s = blockSpec(version, level);
  return s.g1Blocks * s.g1Data + s.g2Blocks * s.g2Data;
}
function totalCodewords(version, level) {
  const s = blockSpec(version, level);
  return dataCodewords(version, level) + (s.g1Blocks + s.g2Blocks) * s.ec;
}
function minVersion(byteLength, level) {
  for (let v = 1; v <= 10; v++) {
    const ccBits = v >= 10 ? 16 : 8;
    if (4 + ccBits + byteLength * 8 <= dataCodewords(v, level) * 8) return v;
  }
  return null;
}

/** 独立的功能模块判定：定位图形/分隔符/时序/对齐/格式信息/版本信息 */
function buildFunctionMap(size, version) {
  const map = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (y, x) => {
    if (y >= 0 && y < size && x >= 0 && x < size) map[y][x] = true;
  };
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) mark(y, x); // 左上 9×9
  for (let y = 0; y < 9; y++) for (let x = size - 8; x < size; x++) mark(y, x); // 右上
  for (let y = size - 8; y < size; y++) for (let x = 0; x < 9; x++) mark(y, x); // 左下
  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }
  const pos = ALIGN[version];
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(pos[j] + dy, pos[i] + dx);
    }
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        mark(i, size - 11 + j);
        mark(size - 11 + j, i);
      }
    }
  }
  return map;
}

/** 掩码条件（x=列, y=行），与标准一致 */
function maskCondition(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** BCH(15,5) 编码，含 0x5412 掩码 */
function formatCodeword(data) {
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function bitsToValue(bits) {
  let v = 0;
  for (let i = bits.length - 1; i >= 0; i--) v = (v << 1) | bits[i];
  return v;
}

/** 解析格式信息（两份副本必须一致，且必须能无损解码） */
function decodeFormat(size, get) {
  const copy1 = [];
  for (let i = 0; i <= 5; i++) copy1.push(get(i, 8) ? 1 : 0);
  copy1.push(get(7, 8) ? 1 : 0);
  copy1.push(get(8, 8) ? 1 : 0);
  copy1.push(get(8, 7) ? 1 : 0);
  for (let i = 9; i < 15; i++) copy1.push(get(8, 14 - i) ? 1 : 0);

  const copy2 = [];
  for (let i = 0; i < 8; i++) copy2.push(get(8, size - 1 - i) ? 1 : 0);
  for (let i = 8; i < 15; i++) copy2.push(get(size - 15 + i, 8) ? 1 : 0);

  const raw1 = bitsToValue(copy1);
  const raw2 = bitsToValue(copy2);
  check(raw1 === raw2, `格式信息两份副本不一致：copy1=0x${raw1.toString(16)} copy2=0x${raw2.toString(16)}`);

  let data = -1;
  for (let d = 0; d < 32; d++) {
    if (formatCodeword(d) === raw1) { data = d; break; }
  }
  check(data >= 0, `格式信息无法无损解码（raw=0x${raw1.toString(16)}）`);
  return { level: BITS_TO_LEVEL[(data >> 3) & 3], mask: data & 7 };
}

/** 按锯齿序读取码字（先反掩码），返回完整码字数组 */
function readCodewords(size, get, fnMap, mask) {
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fnMap[y][x]) {
          const raw = get(y, x);
          const unmasked = raw !== maskCondition(mask, x, y);
          bits.push(unmasked ? 1 : 0);
        }
      }
    }
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    out.push(b);
  }
  return { codewords: out, bitLength: bits.length, bits };
}

/** 反交织：返回按块顺序拼接的数据码字以及各块长度 */
function deinterleave(codewords, version, level) {
  const s = blockSpec(version, level);
  const lens = [];
  for (let i = 0; i < s.g1Blocks; i++) lens.push(s.g1Data);
  for (let i = 0; i < s.g2Blocks; i++) lens.push(s.g2Data);

  const blocks = lens.map(() => []);
  let p = 0;
  const maxData = Math.max(...lens);
  for (let i = 0; i < maxData; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < lens[b]) blocks[b].push(codewords[p++]);
    }
  }
  const dataLen = lens.reduce((a, b) => a + b, 0);
  // 剩余应为每块 ec 个纠错码字
  const ecLen = codewords.length - dataLen;
  check(ecLen === blocks.length * s.ec, `纠错码字数量异常：期望 ${blocks.length * s.ec}，实际 ${ecLen}`);
  return { data: blocks.flat(), blocks, dataLen, ecPerBlock: s.ec };
}

/** 解析字节模式数据段，返回解码文本与填充信息 */
function parseByteSegment(data, version) {
  const bits = [];
  for (const b of data) for (let i = 7; i >= 0; i--) bits.push((b >>> i) & 1);
  const take = (n, pos) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | bits[pos + i];
    return v;
  };
  const mode = take(4, 0);
  check(mode === 0b0100, `模式指示符应为字节模式 0100，实际 ${mode.toString(2).padStart(4, '0')}`);
  const ccBits = version >= 10 ? 16 : 8;
  const count = take(ccBits, 4);
  const start = 4 + ccBits;
  check(start + count * 8 <= bits.length, `字符计数 ${count} 超出数据容量`);
  const bytes = [];
  for (let i = 0; i < count; i++) bytes.push(take(8, start + i * 8));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));

  // 终止符 + 交替填充字节 0xEC / 0x11
  let pos = start + count * 8;
  let terminator = 0;
  while (pos < bits.length && terminator < 4 && bits[pos] === 0) { terminator++; pos++; }
  const padBytes = [];
  while (pos + 8 <= bits.length) { padBytes.push(take(8, pos)); pos += 8; }
  let expect = 0xec;
  for (const pb of padBytes) {
    check(pb === expect, `填充字节应为 0x${expect.toString(16)}，实际 0x${pb.toString(16)}`);
    expect = expect === 0xec ? 0x11 : 0xec;
  }
  return { text, count, terminator, padBytes: padBytes.length };
}

// ---------------------------------------------------------------------------
// 单个用例的完整校验
// ---------------------------------------------------------------------------

function checkFinder(size, get, cy, cx, label) {
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const ring = dy === 0 || dy === 6 || dx === 0 || dx === 6;
      const core = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
      eq(get(cy + dy, cx + dx), ring || core, `${label} 定位图形 (${cy + dy},${cx + dx}) 结构错误`);
    }
  }
}

function runCase(qr, input, level) {
  const bytes = new TextEncoder().encode(input);
  const expectVersion = minVersion(bytes.length, level);

  if (expectVersion === null) {
    // 超出 v10 容量：必须抛出明确的 Error
    let threw = null;
    try {
      qr.qrToMatrix(input, { level });
    } catch (e) {
      threw = e;
    }
    check(threw instanceof Error, `${level}: 超出容量时应抛出 Error`);
    check(/内容过长|超出二维码容量/.test(threw.message), `${level}: 错误信息不明确 -> ${threw.message}`);
    check(!/undefined|NaN/.test(threw.message), `${level}: 错误信息包含 undefined/NaN`);
    return { overflow: true, version: null };
  }

  const matrix = qr.qrToMatrix(input, { level });
  const size = matrix.size;
  const modules = matrix.modules;
  const get = (y, x) => modules[y][x];

  // 1. 尺寸
  eq(size, 17 + 4 * expectVersion, `${level}: size 应为最小可容纳版本的尺寸`);
  eq(modules.length, size, `${level}: modules 行数应等于 size`);
  for (let y = 0; y < size; y++) eq(modules[y].length, size, `${level}: 第 ${y} 行列数应等于 size`);
  const version = (size - 17) / 4;
  eq(version, expectVersion, `${level}: 由 size 反推的版本应与独立推算一致`);
  eq(totalCodewords(version, level), TOTAL_CODEWORDS[version], `${level}: 总码字数表不一致`);

  // 2. 定位图形 + 分隔符
  checkFinder(size, get, 0, 0, `${level} 左上`);
  checkFinder(size, get, 0, size - 7, `${level} 右上`);
  checkFinder(size, get, size - 7, 0, `${level} 左下`);
  for (let i = 0; i < 8; i++) {
    eq(get(7, i), false, `${level}: 左上分隔符 (7,${i}) 应为浅色`);
    eq(get(i, 7), false, `${level}: 左上分隔符 (${i},7) 应为浅色`);
    eq(get(7, size - 1 - i), false, `${level}: 右上分隔符 (7,${size - 1 - i}) 应为浅色`);
    eq(get(i, size - 8), false, `${level}: 右上分隔符 (${i},${size - 8}) 应为浅色`);
    eq(get(size - 8, i), false, `${level}: 左下分隔符 (${size - 8},${i}) 应为浅色`);
    eq(get(size - 1 - i, 7), false, `${level}: 左下分隔符 (${size - 1 - i},7) 应为浅色`);
  }

  // 3. 时序图形（定位图形之间，含对齐图形覆盖处需跳过）
  for (let i = 8; i <= size - 9; i++) {
    const expect = i % 2 === 0;
    // 对齐图形可能覆盖时序，被覆盖的位置不计入交替规律
    const inAlignment = (y, x) => {
      for (const cy of ALIGN[version]) {
        for (const cx of ALIGN[version]) {
          if (Math.abs(y - cy) <= 2 && Math.abs(x - cx) <= 2) return true;
        }
      }
      return false;
    };
    if (!inAlignment(6, i)) eq(get(6, i), expect, `${level}: 横向时序 (6,${i}) 错误`);
    if (!inAlignment(i, 6)) eq(get(i, 6), expect, `${level}: 纵向时序 (${i},6) 错误`);
  }

  // 4. 固定深色模块
  eq(get(4 * version + 9, 8), true, `${level}: 固定深色模块 (${4 * version + 9},8) 应为深色`);

  // 6. 格式信息
  const fmt = decodeFormat(size, get);
  eq(fmt.level, level, `${level}: 格式信息解码出的纠错等级不匹配`);
  check(fmt.mask >= 0 && fmt.mask <= 7, `${level}: 掩码 id ${fmt.mask} 非法`);

  // 5. 往返解码
  const fnMap = buildFunctionMap(size, version);
  // 数据区模块数必须与标准功能图形布局推导出的数量一致（可检出功能图形错位）
  let fnCount = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (fnMap[y][x]) fnCount++;
  eq(size * size - fnCount, DATA_REGION_MODULES[version], `${level}: 数据区模块数应为标准值`);

  const { codewords, bitLength, bits } = readCodewords(size, get, fnMap, fmt.mask);
  eq(bitLength, DATA_REGION_MODULES[version], `${level}: 读取到的数据区模块数不正确`);
  eq(bitLength, totalCodewords(version, level) * 8 + REMAINDER_BITS[version], `${level}: 码字数 + 剩余位不等于数据区模块数`);
  // 剩余位必须全为 0
  for (let i = totalCodewords(version, level) * 8; i < bits.length; i++) {
    eq(bits[i], 0, `${level}: 数据区剩余位（第 ${i - totalCodewords(version, level) * 8} 个）应为 0`);
  }
  eq(codewords.length, totalCodewords(version, level), `${level}: 读取到的码字数不正确`);
  const { data } = deinterleave(codewords, version, level);
  eq(data.length, dataCodewords(version, level), `${level}: 数据码字数不正确`);
  const parsed = parseByteSegment(data, version);
  eq(parsed.text, input, `${level}: 往返解码结果与输入不一致`);
  eq(parsed.count, bytes.length, `${level}: 字符计数应为 UTF-8 字节数`);

  // 7. SVG
  const svg = qr.qrToSvg(input, { level });
  check(svg.includes('<svg'), `${level}: SVG 缺少 <svg`);
  const margin = 4;
  const total = size + margin * 2;
  check(svg.includes(`viewBox="0 0 ${total} ${total}"`), `${level}: SVG viewBox 不正确`);
  check(svg.includes('width="200"') && svg.includes('height="200"'), `${level}: SVG 默认宽高应为 200`);
  const darkCount = modules.flat().filter(Boolean).length;
  const rectCount = (svg.match(/<rect [^>]*fill="#000000"/g) || []).length;
  eq(rectCount, darkCount, `${level}: SVG 深色矩形数量应等于深色模块数量`);
  check(darkCount > 0, `${level}: SVG 深色模块数量应为正`);
  const custom = qr.qrToSvg(input, { level, size: 320, margin: 2 });
  check(custom.includes(`viewBox="0 0 ${size + 4} ${size + 4}"`), `${level}: 自定义 margin 的 viewBox 不正确`);
  check(custom.includes('width="320"') && custom.includes('height="320"'), `${level}: 自定义 size 未生效`);

  return { overflow: false, version, mask: fmt.mask, dark: darkCount };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const { mod: qr, mode } = await loadQrModule();

  for (const name of ['qrToMatrix', 'qrToSvg']) {
    eq(typeof qr[name], 'function', `导出 ${name} 必须是函数`);
  }

  // 校验容量表本身（总码字数）
  for (const level of LEVELS) {
    for (let v = 1; v <= 10; v++) {
      eq(totalCodewords(v, level), TOTAL_CODEWORDS[v], `表校验：v${v}-${level} 总码字数`);
    }
  }

  const URL120 = `https://kotion.top/api/knowledge-system/ops/r/${'a'.repeat(74)}`; // 恰好 120 字符
  const URL119 = `https://kotion.top/api/knowledge-system/ops/r/${'a'.repeat(73)}`; // 恰好 119 字符

  const inputs = [
    { name: 'short-url', text: 'https://kotion.top/go/zhihu' },
    { name: 'long-url', text: 'https://kotion.top/api/knowledge-system/ops/r/abc123' },
    { name: 'HELLO', text: 'HELLO' },
    { name: 'url-120', text: URL120 },
    { name: 'url-119', text: URL119 },
    { name: 'utf8-multibyte', text: '你好，世界 😀 / ünïcode' },
  ];

  eq(URL120.length, 120, '构造的 120 字符 URL 长度不正确');
  eq(URL119.length, 119, '构造的 119 字符 URL 长度不正确');

  let cases = 0;
  let overflowCases = 0;
  const lines = [];
  for (const input of inputs) {
    for (const level of LEVELS) {
      const r = runCase(qr, input.text, level);
      cases++;
      if (r.overflow) {
        overflowCases++;
        lines.push(`  ${input.name} [${level}] -> 预期超出 v10 容量，已抛出 Error`);
      } else {
        lines.push(`  ${input.name} [${level}] v${r.version} mask=${r.mask} dark=${r.dark}`);
      }
    }
  }

  // 注入安全性：SVG 中不得出现任何来自输入的文本
  const payload = '<script>alert("x")</script>&"';
  const evil = qr.qrToSvg(payload, { level: 'L' });
  check(!evil.includes('<script'), 'SVG 不得包含输入中的 <script');
  check(!evil.includes('alert'), 'SVG 不得包含输入文本');
  eq((evil.match(/<rect [^>]*fill="#000000"/g) || []).length, qr.qrToMatrix(payload, { level: 'L' }).modules.flat().filter(Boolean).length, 'payload 用例矩形数量不一致');

  if (process.env.QR_SELFTEST_VERBOSE) {
    console.log(lines.join('\n'));
  }
  console.log(`transpile: ${mode}`);
  console.log(`OK ${cases} cases（含 ${overflowCases} 例超出容量断言，共 ${checks} 项校验）`);
}

main().catch((err) => {
  console.error(`FAIL: ${err && err.message ? err.message : err}`);
  if (process.env.QR_SELFTEST_VERBOSE && err && err.stack) console.error(err.stack);
  process.exit(1);
});
