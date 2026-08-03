/**
 * 公式输入辅助的数据源：符号面板分组、片段模板、命令补全列表。
 *
 * 片段中的 `$0` 用于标记插入后光标所在位置，插入前会被移除。
 */

export const CURSOR_MARKER = "$0";

export interface LatexSnippet {
  /** 插入到编辑区的 latex 片段，可包含 `$0` 光标标记 */
  insert: string;
  /** 按钮上用 KaTeX 渲染的预览 latex，缺省时使用去掉光标标记的 insert */
  preview?: string;
  /** 悬浮提示，缺省时展示 insert */
  tip?: string;
}

export interface LatexSnippetGroup {
  id: string;
  /** i18n key，缺失时回退到 fallback */
  labelKey: string;
  fallback: string;
  snippets: LatexSnippet[];
}

/** 去掉光标标记，返回插入文本与光标在文本内的偏移 */
export const resolveSnippet = (insert: string): { text: string; cursor: number } => {
  const index = insert.indexOf(CURSOR_MARKER);
  if (index < 0) {
    return { text: insert, cursor: insert.length };
  }
  return { text: insert.replace(CURSOR_MARKER, ""), cursor: index };
};

/** 按钮预览用的 latex */
export const snippetPreview = (snippet: LatexSnippet): string =>
  snippet.preview ?? resolveSnippet(snippet.insert).text;

const simple = (commands: string[]): LatexSnippet[] => commands.map((it) => ({ insert: it }));

export const LATEX_SNIPPET_GROUPS: LatexSnippetGroup[] = [
  {
    id: "common",
    labelKey: "editor.math.group.common",
    fallback: "常用",
    snippets: [
      { insert: "\\frac{$0}{}", preview: "\\frac{a}{b}", tip: "\\frac{a}{b}" },
      { insert: "\\dfrac{$0}{}", preview: "\\dfrac{a}{b}", tip: "\\dfrac{a}{b}" },
      { insert: "\\sqrt{$0}", preview: "\\sqrt{x}", tip: "\\sqrt{x}" },
      { insert: "\\sqrt[$0]{}", preview: "\\sqrt[n]{x}", tip: "\\sqrt[n]{x}" },
      { insert: "^{$0}", preview: "x^{n}", tip: "x^{n}" },
      { insert: "_{$0}", preview: "x_{i}", tip: "x_{i}" },
      { insert: "_{$0}^{}", preview: "x_{i}^{n}", tip: "x_{i}^{n}" },
      { insert: "\\sum_{i=1}^{$0}", preview: "\\sum_{i=1}^{n}", tip: "\\sum_{i=1}^{n}" },
      { insert: "\\prod_{i=1}^{$0}", preview: "\\prod_{i=1}^{n}", tip: "\\prod_{i=1}^{n}" },
      { insert: "\\int_{$0}^{}", preview: "\\int_{a}^{b}", tip: "\\int_{a}^{b}" },
      { insert: "\\lim_{x \\to $0}", preview: "\\lim_{x \\to 0}", tip: "\\lim_{x \\to 0}" },
      { insert: "\\binom{$0}{}", preview: "\\binom{n}{k}", tip: "\\binom{n}{k}" },
      { insert: "\\left( $0 \\right)", preview: "\\left( a \\right)", tip: "\\left( \\right)" },
      { insert: "\\left[ $0 \\right]", preview: "\\left[ a \\right]", tip: "\\left[ \\right]" },
      { insert: "\\left\\{ $0 \\right\\}", preview: "\\left\\{ a \\right\\}", tip: "\\left\\{ \\right\\}" },
      { insert: "\\left| $0 \\right|", preview: "\\left| a \\right|", tip: "\\left| \\right|" },
      { insert: "\\vec{$0}", preview: "\\vec{a}", tip: "\\vec{a}" },
      { insert: "\\hat{$0}", preview: "\\hat{a}", tip: "\\hat{a}" },
      { insert: "\\bar{$0}", preview: "\\bar{a}", tip: "\\bar{a}" },
      { insert: "\\overline{$0}", preview: "\\overline{AB}", tip: "\\overline{AB}" },
      { insert: "\\text{$0}", preview: "\\text{abc}", tip: "\\text{文本}" },
      { insert: "\\infty" },
    ],
  },
  {
    id: "multiline",
    labelKey: "editor.math.group.multiline",
    fallback: "多行结构",
    snippets: [
      {
        insert: "\\begin{aligned}\n  $0 &= \\\\\n  &=\n\\end{aligned}",
        preview: "\\begin{aligned} a &= b \\\\ &= c \\end{aligned}",
        tip: "aligned",
      },
      {
        insert: "\\begin{cases}\n  $0, & x > 0 \\\\\n  , & x \\le 0\n\\end{cases}",
        preview: "\\begin{cases} a, & x>0 \\\\ b, & x\\le 0 \\end{cases}",
        tip: "cases",
      },
      {
        insert: "\\begin{pmatrix}\n  $0 & \\\\\n   & \n\\end{pmatrix}",
        preview: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
        tip: "pmatrix",
      },
      {
        insert: "\\begin{bmatrix}\n  $0 & \\\\\n   & \n\\end{bmatrix}",
        preview: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}",
        tip: "bmatrix",
      },
      {
        insert: "\\begin{vmatrix}\n  $0 & \\\\\n   & \n\\end{vmatrix}",
        preview: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}",
        tip: "vmatrix",
      },
      {
        insert: "\\begin{matrix}\n  $0 & \\\\\n   & \n\\end{matrix}",
        preview: "\\begin{matrix} a & b \\\\ c & d \\end{matrix}",
        tip: "matrix",
      },
      {
        insert: "\\begin{array}{cc}\n  $0 & \\\\\n   & \n\\end{array}",
        preview: "\\begin{array}{cc} a & b \\\\ c & d \\end{array}",
        tip: "array",
      },
      {
        insert: "\\begin{gathered}\n  $0 \\\\\n  \n\\end{gathered}",
        preview: "\\begin{gathered} a \\\\ b \\end{gathered}",
        tip: "gathered",
      },
      { insert: "\\\\", preview: "a \\\\ b", tip: "换行 \\\\" },
      { insert: "&", preview: "\\text{\\&}", tip: "对齐位置 &" },
      { insert: "\\overbrace{$0}^{}", preview: "\\overbrace{a+b}^{n}", tip: "\\overbrace{}^{}" },
      { insert: "\\underbrace{$0}_{}", preview: "\\underbrace{a+b}_{n}", tip: "\\underbrace{}_{}" },
      { insert: "\\substack{$0 \\\\ }", preview: "\\sum_{\\substack{i=1 \\\\ j=1}}", tip: "\\substack{}" },
    ],
  },
  {
    id: "greek",
    labelKey: "editor.math.group.greek",
    fallback: "希腊字母",
    snippets: simple([
      "\\alpha", "\\beta", "\\gamma", "\\delta", "\\epsilon", "\\varepsilon", "\\zeta", "\\eta",
      "\\theta", "\\vartheta", "\\iota", "\\kappa", "\\lambda", "\\mu", "\\nu", "\\xi",
      "\\pi", "\\varpi", "\\rho", "\\varrho", "\\sigma", "\\varsigma", "\\tau", "\\upsilon",
      "\\phi", "\\varphi", "\\chi", "\\psi", "\\omega",
      "\\Gamma", "\\Delta", "\\Theta", "\\Lambda", "\\Xi", "\\Pi", "\\Sigma", "\\Upsilon",
      "\\Phi", "\\Psi", "\\Omega",
    ]),
  },
  {
    id: "operator",
    labelKey: "editor.math.group.operator",
    fallback: "运算符",
    snippets: simple([
      "+", "-", "\\times", "\\div", "\\pm", "\\mp", "\\cdot", "\\ast", "\\star", "\\circ",
      "\\bullet", "\\oplus", "\\ominus", "\\otimes", "\\oslash", "\\odot",
      "\\cup", "\\cap", "\\setminus", "\\wedge", "\\vee", "\\neg",
      "\\partial", "\\nabla", "\\forall", "\\exists", "\\nexists",
      "\\sum", "\\prod", "\\coprod", "\\int", "\\iint", "\\iiint", "\\oint",
      "\\bigcup", "\\bigcap", "\\bigoplus", "\\bigotimes",
    ]),
  },
  {
    id: "relation",
    labelKey: "editor.math.group.relation",
    fallback: "关系符",
    snippets: simple([
      "=", "\\neq", "\\approx", "\\equiv", "\\cong", "\\sim", "\\simeq", "\\propto",
      "<", ">", "\\le", "\\ge", "\\ll", "\\gg", "\\prec", "\\succ",
      "\\in", "\\notin", "\\ni", "\\subset", "\\supset", "\\subseteq", "\\supseteq",
      "\\perp", "\\parallel", "\\mid", "\\angle", "\\triangle",
      "\\emptyset", "\\varnothing", "\\therefore", "\\because",
    ]),
  },
  {
    id: "arrow",
    labelKey: "editor.math.group.arrow",
    fallback: "箭头",
    snippets: simple([
      "\\to", "\\gets", "\\leftrightarrow", "\\Rightarrow", "\\Leftarrow", "\\Leftrightarrow",
      "\\longrightarrow", "\\longleftarrow", "\\longleftrightarrow", "\\mapsto",
      "\\uparrow", "\\downarrow", "\\updownarrow", "\\Uparrow", "\\Downarrow",
      "\\nearrow", "\\searrow", "\\swarrow", "\\nwarrow",
      "\\rightharpoonup", "\\leftharpoondown", "\\rightleftharpoons", "\\hookrightarrow",
    ]),
  },
  {
    id: "function",
    labelKey: "editor.math.group.function",
    fallback: "函数",
    snippets: [
      ...simple([
        "\\sin", "\\cos", "\\tan", "\\cot", "\\sec", "\\csc",
        "\\arcsin", "\\arccos", "\\arctan", "\\sinh", "\\cosh", "\\tanh",
        "\\log", "\\ln", "\\lg", "\\exp", "\\deg", "\\det", "\\dim",
        "\\gcd", "\\max", "\\min", "\\sup", "\\inf", "\\arg", "\\Pr", "\\bmod",
      ]),
      { insert: "\\log_{$0}", preview: "\\log_{2}", tip: "\\log_{a}" },
      { insert: "\\operatorname{$0}", preview: "\\operatorname{sgn}", tip: "\\operatorname{}" },
    ],
  },
  {
    id: "notation",
    labelKey: "editor.math.group.notation",
    fallback: "记号",
    snippets: [
      ...simple([
        "\\aleph", "\\hbar", "\\ell", "\\wp", "\\Re", "\\Im", "\\imath", "\\jmath",
        "\\prime", "\\circ", "\\degree", "\\dots", "\\cdots", "\\vdots", "\\ddots",
        "\\square", "\\blacksquare", "\\checkmark", "\\dagger",
      ]),
      { insert: "\\mathbb{$0}", preview: "\\mathbb{R}", tip: "\\mathbb{R}" },
      { insert: "\\mathcal{$0}", preview: "\\mathcal{L}", tip: "\\mathcal{L}" },
      { insert: "\\mathbf{$0}", preview: "\\mathbf{x}", tip: "\\mathbf{x}" },
      { insert: "\\mathrm{$0}", preview: "\\mathrm{d}", tip: "\\mathrm{d}" },
      { insert: "\\color{red}{$0}", preview: "\\color{red}{x}", tip: "\\color{red}{}" },
    ],
  },
];

/** 命令补全项 */
export interface LatexCommand {
  /** 以 `\` 开头的命令名 */
  command: string;
  /** 选中后插入的片段，可包含 `$0` 光标标记 */
  insert: string;
  /** 预览 latex */
  preview: string;
}

const buildCommands = (): LatexCommand[] => {
  const map = new Map<string, LatexCommand>();
  const push = (insert: string, preview?: string) => {
    const command = /^\\[a-zA-Z]+/.exec(insert)?.[0];
    if (!command || map.has(command)) {
      return;
    }
    map.set(command, {
      command,
      insert,
      preview: preview ?? resolveSnippet(insert).text,
    });
  };
  LATEX_SNIPPET_GROUPS.forEach((group) => {
    group.snippets.forEach((snippet) => push(snippet.insert, snippet.preview));
  });
  // 面板未收录但常用的命令，补全时依然可用
  [
    "\\begin{aligned}\n  $0\n\\end{aligned}",
    "\\end{aligned}",
    "\\displaystyle",
    "\\limits",
    "\\nolimits",
    "\\quad",
    "\\qquad",
    "\\ ",
    "\\!",
    "\\,",
    "\\;",
    "\\middle|",
    "\\stackrel{$0}{}",
    "\\overset{$0}{}",
    "\\underset{$0}{}",
    "\\overrightarrow{$0}",
    "\\widehat{$0}",
    "\\widetilde{$0}",
    "\\tilde{$0}",
    "\\dot{$0}",
    "\\ddot{$0}",
    "\\boxed{$0}",
    "\\cfrac{$0}{}",
    "\\tfrac{$0}{}",
    "\\mathfrak{$0}",
    "\\mathsf{$0}",
    "\\mathtt{$0}",
    "\\textbf{$0}",
    "\\textit{$0}",
  ].forEach((it) => push(it));
  return Array.from(map.values()).sort((a, b) => a.command.localeCompare(b.command));
};

export const LATEX_COMMANDS: LatexCommand[] = buildCommands();

/**
 * 从光标前的文本中解析正在输入的命令（形如 `\fra`）。
 * 返回 undefined 表示当前不需要补全。
 */
export const matchCommandToken = (
  value: string,
  caret: number
): { token: string; from: number } | undefined => {
  const before = value.slice(0, caret);
  const match = /\\[a-zA-Z]*$/.exec(before);
  if (!match) {
    return undefined;
  }
  // `\\` 是换行命令，不做补全
  if (/\\\\$/.test(before)) {
    return undefined;
  }
  return { token: match[0], from: caret - match[0].length };
};

/** 按输入的命令前缀过滤补全候选 */
export const filterCommands = (token: string, limit = 24): LatexCommand[] => {
  const keyword = token.slice(1).toLowerCase();
  if (!keyword) {
    return LATEX_COMMANDS.slice(0, limit);
  }
  const starts: LatexCommand[] = [];
  const includes: LatexCommand[] = [];
  LATEX_COMMANDS.forEach((it) => {
    const name = it.command.slice(1).toLowerCase();
    if (name.startsWith(keyword)) {
      starts.push(it);
    } else if (name.includes(keyword)) {
      includes.push(it);
    }
  });
  return [...starts, ...includes].slice(0, limit);
};
