// Mappanézet: a gyökérmappa fája lustán kibontható almappákkal.

import { invoke } from "@tauri-apps/api/core";
import { basename, samePath } from "./render";
import { t } from "./i18n";

interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
}

const tree = document.getElementById("tree")!;
const rootLabel = document.getElementById("files-root")!;

let root: string | null = null;
let activePath: string | null = null;
const expanded = new Set<string>();
let onOpen: (path: string, newTab: boolean) => void = () => {};

export function initFolder(open: (path: string, newTab: boolean) => void) {
  onOpen = open;
  tree.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".tree-row");
    if (!row) return;
    const path = row.dataset.path!;
    if (row.dataset.dir !== undefined) toggleDir(row);
    else onOpen(path, e.ctrlKey);
  });
  tree.addEventListener("auxclick", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".tree-row");
    if (e.button === 1 && row && row.dataset.dir === undefined) onOpen(row.dataset.path!, true);
  });
}

export const folderRoot = () => root;

export async function setFolderRoot(path: string) {
  if (root && samePath(root, path)) return;
  root = path;
  expanded.clear();
  rootLabel.textContent = basename(path) || path;
  rootLabel.title = path;
  tree.replaceChildren(await buildList(path, 0));
  markActive();
}

/** Az aktív fájl kiemelése, és ha a fán belül van, a szülőmappák kibontása. */
export async function setFolderActive(path: string | null) {
  activePath = path;
  if (root && path && path.toLowerCase().startsWith(root.toLowerCase() + "\\")) {
    const parts = path.slice(root.length + 1).split("\\").slice(0, -1);
    let cur = root;
    for (const p of parts) {
      cur += "\\" + p;
      const row = tree.querySelector<HTMLElement>(`.tree-row[data-path="${CSS.escape(cur)}"]`);
      if (row && !expanded.has(cur.toLowerCase())) await toggleDir(row);
    }
  }
  markActive();
}

function markActive() {
  for (const r of tree.querySelectorAll<HTMLElement>(".tree-row.active")) r.classList.remove("active");
  if (!activePath) return;
  const row = tree.querySelector<HTMLElement>(`.tree-row[data-path="${CSS.escape(activePath)}"]`);
  if (row) {
    row.classList.add("active");
    row.scrollIntoView({ block: "nearest" });
  }
}

async function buildList(dir: string, depth: number): Promise<HTMLElement> {
  const ul = document.createElement("div");
  ul.className = "tree-list";
  let entries: Entry[] = [];
  try {
    entries = await invoke<Entry[]>("list_dir", { path: dir });
  } catch (e) {
    ul.innerHTML = `<div class="tree-empty"></div>`;
    ul.firstElementChild!.textContent = t("pane.unreadable", String(e));
    return ul;
  }
  if (!entries.length && depth === 0) {
    ul.innerHTML = `<div class="tree-empty"></div>`;
    ul.firstElementChild!.textContent = t("pane.noMarkdown");
  }
  for (const e of entries) {
    const row = document.createElement("div");
    row.className = "tree-row";
    row.dataset.path = e.path;
    row.setAttribute("role", "treeitem");
    row.style.paddingLeft = `${8 + depth * 14}px`;
    if (e.is_dir) row.dataset.dir = "";
    row.innerHTML = e.is_dir
      ? `<svg class="chev" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg><svg viewBox="0 0 16 16"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"/></svg><span></span>`
      : `<span class="chev-space"></span><svg viewBox="0 0 16 16"><path d="M4 2h5l3 3v9H4z M9 2v3h3"/></svg><span></span>`;
    row.querySelector("span:last-child")!.textContent = e.name;
    row.title = e.path;
    ul.appendChild(row);
  }
  return ul;
}

async function toggleDir(row: HTMLElement) {
  const path = row.dataset.path!;
  const key = path.toLowerCase();
  const next = row.nextElementSibling as HTMLElement | null;
  if (expanded.has(key)) {
    expanded.delete(key);
    row.classList.remove("open");
    if (next?.classList.contains("tree-list")) next.remove();
    return;
  }
  expanded.add(key);
  row.classList.add("open");
  const depth = Math.round((parseInt(row.style.paddingLeft) - 8) / 14) + 1;
  row.after(await buildList(path, depth));
  markActive();
}
