// Matek (KaTeX) és diagramok (Mermaid). Mindkettő nagy könyvtár, ezért csak akkor
// töltődnek be, ha a dokumentumban tényleg van képlet vagy diagram.

import type { MarkdownIt, StateInline, StateBlock } from "markdown-it";

// Az attribútumokba kódolva tesszük a forrást: a DOMPurify kidobja az olyan értéket,
// amiben pl. `-->` van (Mermaid-nyíl), mert HTML-megjegyzés-trükknek látja.
const attr = (s: string) => encodeURIComponent(s);
const unattr = (s: string) => decodeURIComponent(s);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- Markdown-it bővítmény: helyőrzők -------------------------------------------

function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src[start] !== "$") return false;
  const display = src[start + 1] === "$";
  const open = display ? 2 : 1;
  const first = src[start + open];
  // `$ 5` vagy `$$` üresen nem képlet (pandoc-szabály)
  if (!first || (!display && /\s/.test(first))) return false;

  let end = start + open;
  while ((end = src.indexOf(display ? "$$" : "$", end)) !== -1) {
    if (src[end - 1] === "\\") {
      end++;
      continue;
    }
    if (!display && (/\s/.test(src[end - 1]) || /\d/.test(src[end + 1] ?? ""))) {
      end++;
      continue;
    }
    break;
  }
  if (end === -1 || end === start + open) return false;
  if (!silent) {
    const token = state.push("math_inline", "", 0);
    token.content = src.slice(start + open, end);
    token.markup = display ? "$$" : "$";
  }
  state.pos = end + open;
  return true;
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.src.slice(pos, pos + 2) !== "$$") return false;
  if (silent) return true;

  let firstLine = state.src.slice(pos + 2, max);
  let content = "";
  let line = startLine;
  if (firstLine.trim().endsWith("$$")) {
    content = firstLine.trim().slice(0, -2);
  } else {
    const lines = [firstLine];
    let found = false;
    while (++line < endLine) {
      pos = state.bMarks[line] + state.tShift[line];
      max = state.eMarks[line];
      const text = state.src.slice(pos, max);
      if (text.trim().endsWith("$$")) {
        lines.push(text.trim().slice(0, -2));
        found = true;
        break;
      }
      lines.push(state.src.slice(state.bMarks[line], max));
    }
    if (!found) return false;
    content = lines.join("\n");
  }
  state.line = line + 1;
  const token = state.push("math_block", "", 0);
  token.block = true;
  token.content = content.trim();
  token.map = [startLine, state.line];
  return true;
}

export function extrasPlugin(md: MarkdownIt) {
  md.inline.ruler.after("escape", "math_inline", mathInline);
  md.block.ruler.after("blockquote", "math_block", mathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });

  md.renderer.rules.math_inline = (tokens, i) => {
    const t = tokens[i];
    const tag = t.markup === "$$" ? "div" : "span";
    const cls = t.markup === "$$" ? "math-display" : "math-inline";
    return `<${tag} class="${cls}" data-tex="${attr(t.content)}">${esc(t.content)}</${tag}>`;
  };
  md.renderer.rules.math_block = (tokens, i) =>
    `<div class="math-display" data-tex="${attr(tokens[i].content)}">${esc(tokens[i].content)}</div>\n`;

  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, i, opts, env, self) => {
    const t = tokens[i];
    const lang = t.info.trim().split(/\s+/)[0].toLowerCase();
    if (lang === "mermaid") return `<div class="mermaid-block" data-src="${attr(t.content)}"></div>\n`;
    if (lang === "math" || lang === "latex" || lang === "katex")
      return `<div class="math-display" data-tex="${attr(t.content)}">${esc(t.content)}</div>\n`;
    return fence(tokens, i, opts, env, self);
  };
}

// ---- Renderelés a DOM-ban ----------------------------------------------------------

let katexP: Promise<typeof import("katex")> | null = null;
let mermaidP: Promise<typeof import("mermaid").default> | null = null;
let mermaidTheme = "";
let mermaidSeq = 0;

function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

async function renderMath(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>("[data-tex]:not([data-done])");
  if (!nodes.length) return;
  if (!katexP) {
    katexP = import("katex");
    import("katex/dist/katex.min.css");
  }
  const katex = (await katexP).default;
  for (const el of nodes) {
    try {
      katex.render(unattr(el.dataset.tex!), el, {
        displayMode: el.classList.contains("math-display"),
        throwOnError: false,
        trust: false,
        output: "htmlAndMathml",
      });
    } catch {
      el.classList.add("math-error");
    }
    el.dataset.done = "";
  }
}

async function renderMermaid(root: HTMLElement, force = false) {
  const sel = force ? ".mermaid-block" : ".mermaid-block:not([data-done])";
  const nodes = root.querySelectorAll<HTMLElement>(sel);
  if (!nodes.length) return;
  mermaidP ??= import("mermaid").then((m) => m.default);
  const mermaid = await mermaidP;
  const theme = isDark() ? "dark" : "default";
  if (theme !== mermaidTheme) {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme, fontFamily: "Segoe UI, sans-serif" });
    mermaidTheme = theme;
  }
  for (const el of nodes) {
    try {
      const { svg } = await mermaid.render(`mmd-${++mermaidSeq}`, unattr(el.dataset.src!));
      el.innerHTML = svg;
      el.classList.remove("mermaid-error");
    } catch (e) {
      el.textContent = `Mermaid hiba: ${e instanceof Error ? e.message : e}`;
      el.classList.add("mermaid-error");
    }
    el.dataset.done = "";
  }
}

/** Képletek és diagramok kirajzolása egy frissen renderelt dokumentumban. */
export function enhance(root: HTMLElement): Promise<unknown> {
  return Promise.all([renderMath(root), renderMermaid(root)]);
}

/** Téma váltásakor a diagramokat újra kell rajzolni. */
export function rethemeDiagrams(roots: HTMLElement[]) {
  if (!mermaidP) return;
  for (const r of roots) renderMermaid(r, true);
}
