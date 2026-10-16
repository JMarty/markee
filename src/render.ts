import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";
import { convertFileSrc } from "@tauri-apps/api/core";
import { extrasPlugin } from "./extras";

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch {
        /* nyers kód marad */
      }
    }
    return "";
  },
})
  .use(taskLists, { enabled: false })
  .use(extrasPlugin);

// ---- Útvonalak -----------------------------------------------------------

export const MD_EXT = /\.(md|markdown|mdown|mkd|mdx|txt)$/i;

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return i >= 0 ? p.slice(0, i) : p;
}

export function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return p.slice(i + 1);
}

function isAbsolute(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

/** `rel` feloldása `baseDir`-hez képest, `.` és `..` szegmensek kezelésével. */
export function resolvePath(baseDir: string, rel: string): string {
  const full = isAbsolute(rel) ? rel : `${baseDir}\\${rel}`;
  const unc = full.startsWith("\\\\");
  const parts = full.replace(/\//g, "\\").split("\\").filter((s, i) => s !== "" || i === 0);
  const out: string[] = [];
  for (const s of parts) {
    if (s === "." || s === "") continue;
    if (s === "..") {
      if (out.length > 1) out.pop();
    } else out.push(s);
  }
  return (unc ? "\\\\" : "") + out.join("\\");
}

export function samePath(a: string, b: string): boolean {
  return a.replace(/\//g, "\\").toLowerCase() === b.replace(/\//g, "\\").toLowerCase();
}

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/** Hivatkozás felbontása: [útvonal, horgony]. */
export function splitHref(href: string): [string, string] {
  const i = href.indexOf("#");
  const path = i >= 0 ? href.slice(0, i) : href;
  const hash = i >= 0 ? href.slice(i + 1) : "";
  return [safeDecode(path.split("?")[0]), hash];
}

export const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href) && !/^[a-zA-Z]:[\\/]/.test(href);

// ---- Renderelés ------------------------------------------------------------

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

export function render(source: string, filePath: string): { frag: DocumentFragment; toc: TocItem[] } {
  const html = md.render(source);
  const frag = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ADD_TAGS: ["details", "summary"],
  }) as DocumentFragment;

  const dir = dirname(filePath);

  for (const img of frag.querySelectorAll<HTMLImageElement>("img[src]")) {
    const src = img.getAttribute("src")!;
    if (!isExternal(src) && !src.startsWith("data:")) {
      img.src = convertFileSrc(resolvePath(dir, splitHref(src)[0]));
    }
    img.loading = "lazy";
    img.decoding = "async";
  }

  const toc: TocItem[] = [];
  const used = new Map<string, number>();
  for (const h of frag.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")) {
    const text = h.textContent ?? "";
    let id = h.id || slugify(text) || "szakasz";
    const n = used.get(id) ?? 0;
    used.set(id, n + 1);
    if (n > 0) id = `${id}-${n}`;
    h.id = id;
    toc.push({ level: +h.tagName[1], text, id });
  }

  for (const pre of frag.querySelectorAll("pre")) {
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Másolás";
    pre.appendChild(btn);
  }

  return { frag, toc };
}
