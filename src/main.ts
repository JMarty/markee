import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getVersion } from "@tauri-apps/api/app";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { render, basename, dirname, resolvePath, samePath, splitHref, isExternal, MD_EXT, type TocItem } from "./render";
import { initFind, openFind, closeFind, findOpen, findStep, setFindRoot } from "./find";
import { enhance, rethemeDiagrams } from "./extras";
import { initFolder, setFolderRoot, setFolderActive, folderRoot } from "./folder";
import { checkForUpdates } from "./updater";
import helpText from "./help.md?raw";
import iconUrl from "./assets/icon.svg";

// ---- Állapot -----------------------------------------------------------------

interface HistoryEntry {
  path: string;
  scroll: number;
}

interface Tab {
  id: number;
  path: string;
  back: HistoryEntry[];
  forward: HistoryEntry[];
  scroll: number;
  toc: TocItem[];
  doc: HTMLElement;
  tabEl: HTMLElement;
}

/** Beépített dokumentumok (pl. súgó) – nem fájlból jönnek, nem figyeljük őket. */
const HELP = "markee:súgó";
const isVirtual = (p: string) => p.startsWith("markee:");
const titleOf = (p: string) => (p === HELP ? "Súgó" : basename(p));

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const tabsEl = $("tabs");
const docsEl = $("docs");
const scroller = $("scroller");
const sidebar = $("sidebar");
const tocEl = $("toc");
const filesEl = $("files");
const welcome = $("welcome");
const menu = $("menu");
const appWindow = getCurrentWindow();

const tabs: Tab[] = [];
let active: Tab | null = null;
let nextId = 1;
const closedPaths: string[] = [];

// ---- Beállítások (localStorage) ----------------------------------------------

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* nem kritikus */
  }
}

type Theme = "system" | "light" | "dark";
type Pane = "toc" | "files";
const settings = {
  theme: load<Theme>("theme", "system"),
  zoom: load("zoom", 1),
  wide: load("wide", false),
  sidebar: load("sidebar", true),
  pane: load<Pane>("pane", "toc"),
  /** kézzel választott mappa a Fájlok panelhez; ha nincs, az aktív fájl mappáját követi */
  folder: load<string | null>("folder", null),
};

function applySettings() {
  const root = document.documentElement;
  const prevDark = isDark();
  if (settings.theme === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = settings.theme;
  root.style.setProperty("--zoom", String(settings.zoom));
  root.classList.toggle("wide", settings.wide);
  $("zoom-label").textContent = `${Math.round(settings.zoom * 100)}%`;
  for (const b of document.querySelectorAll<HTMLElement>("[data-theme-set]"))
    b.classList.toggle("on", b.dataset.themeSet === settings.theme);
  if (prevDark !== isDark()) rethemeDiagrams(tabs.map((t) => t.doc));
  updateSidebar();
}

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (settings.theme === "system") rethemeDiagrams(tabs.map((t) => t.doc));
});

function setZoom(z: number) {
  settings.zoom = Math.round(Math.min(2.5, Math.max(0.6, z)) * 10) / 10;
  save("zoom", settings.zoom);
  applySettings();
}

function setTheme(t: Theme) {
  settings.theme = t;
  save("theme", t);
  applySettings();
}

// ---- Legutóbbi fájlok ----------------------------------------------------------

function addRecent(path: string) {
  if (isVirtual(path)) return;
  const list = load<string[]>("recent", []).filter((p) => !samePath(p, path));
  list.unshift(path);
  save("recent", list.slice(0, 12));
}

function recentLink(p: string, onClick: () => void, tag: "a" | "button" = "a"): HTMLElement {
  const a = document.createElement(tag);
  a.innerHTML = `<b></b><span></span>`;
  a.querySelector("b")!.textContent = basename(p);
  a.querySelector("span")!.textContent = dirname(p);
  a.title = p;
  a.onclick = onClick;
  return a;
}

function renderWelcome() {
  const list = load<string[]>("recent", []);
  $("recent").replaceChildren(
    ...list.map((p) => {
      const li = document.createElement("li");
      li.appendChild(recentLink(p, () => openFile(p)));
      return li;
    }),
  );
  $("recent-wrap").hidden = list.length === 0;
}

// ---- Fájlok betöltése ------------------------------------------------------------

async function loadInto(tab: Tab, scroll = 0, hash = "") {
  let frag: DocumentFragment;
  try {
    const src = tab.path === HELP ? helpText : await invoke<string>("read_file", { path: tab.path });
    const r = render(src, tab.path);
    frag = r.frag;
    tab.toc = r.toc;
  } catch (e) {
    frag = document.createDocumentFragment();
    const div = document.createElement("div");
    div.className = "error";
    div.textContent = `A fájl nem olvasható: ${tab.path}\n${e}`;
    frag.appendChild(div);
    tab.toc = [];
  }
  tab.doc.replaceChildren(frag);
  updateTabLabel(tab);
  const restore = () => {
    if (tab !== active) return;
    if (hash) scrollToId(hash);
    else scroller.scrollTop = scroll;
  };
  if (tab === active) {
    updateSidebar();
    setFindRoot(tab.doc, true);
    restore();
  } else {
    tab.scroll = scroll;
  }
  // a képletek/diagramok megváltoztatják a magasságot, ezért utána újra pozicionálunk
  const hasExtras = tab.doc.querySelector("[data-tex], .mermaid-block");
  if (hasExtras) {
    await enhance(tab.doc);
    restore();
    if (tab === active) setFindRoot(tab.doc, true);
  }
}

function updateTabLabel(tab: Tab) {
  tab.tabEl.querySelector(".label")!.textContent = titleOf(tab.path);
  tab.tabEl.title = isVirtual(tab.path) ? titleOf(tab.path) : tab.path;
  if (tab === active) appWindow.setTitle(`${titleOf(tab.path)} — Markee`);
}

function watch(path: string) {
  if (!isVirtual(path)) invoke("watch_file", { path });
}
function unwatch(path: string) {
  if (!isVirtual(path)) invoke("unwatch_file", { path });
}

// ---- Tabok -------------------------------------------------------------------------

function createTab(path: string): Tab {
  const tabEl = document.createElement("div");
  tabEl.className = "tab";
  tabEl.setAttribute("role", "tab");
  tabEl.innerHTML = `<span class="label"></span><button class="close" title="Bezárás (Ctrl+W)">✕</button>`;
  const doc = document.createElement("article");
  doc.className = "markdown-body";
  doc.hidden = true;
  docsEl.appendChild(doc);

  const tab: Tab = { id: nextId++, path, back: [], forward: [], scroll: 0, toc: [], doc, tabEl };
  tabEl.addEventListener("mousedown", (e) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tab);
    } else if (e.button === 0 && !(e.target as HTMLElement).closest(".close")) {
      activate(tab);
    }
  });
  tabEl.querySelector(".close")!.addEventListener("click", () => closeTab(tab));
  tabsEl.appendChild(tabEl);
  tabs.push(tab);
  watch(path);
  return tab;
}

function activate(tab: Tab | null) {
  if (active === tab) return;
  if (active) {
    active.scroll = scroller.scrollTop;
    active.doc.hidden = true;
    active.tabEl.classList.remove("active");
  }
  active = tab;
  welcome.hidden = !!tab;
  if (tab) {
    tab.doc.hidden = false;
    tab.tabEl.classList.add("active");
    tab.tabEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    scroller.scrollTop = tab.scroll;
    appWindow.setTitle(`${titleOf(tab.path)} — Markee`);
    setFindRoot(tab.doc);
  } else {
    appWindow.setTitle("Markee");
    renderWelcome();
    setFindRoot(null);
    scroller.scrollTop = 0;
  }
  updateSidebar();
}

function closeTab(tab: Tab) {
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  unwatch(tab.path);
  closedPaths.push(tab.path);
  tabs.splice(i, 1);
  tab.tabEl.remove();
  tab.doc.remove();
  if (active === tab) {
    active = null;
    activate(tabs[Math.min(i, tabs.length - 1)] ?? null);
  }
}

async function openFile(path: string, opts: { background?: boolean } = {}) {
  const existing = tabs.find((t) => samePath(t.path, path));
  if (existing) {
    if (!opts.background) activate(existing);
    return;
  }
  addRecent(path);
  const tab = createTab(path);
  if (!opts.background) activate(tab);
  await loadInto(tab);
}

/** Navigálás egy tabon belül (linkre kattintás), előzménnyel. */
async function navigate(tab: Tab, path: string, hash = "") {
  if (samePath(tab.path, path)) {
    if (hash) scrollToId(hash);
    return;
  }
  tab.back.push({ path: tab.path, scroll: scroller.scrollTop });
  tab.forward = [];
  await switchPath(tab, path, 0, hash);
}

async function switchPath(tab: Tab, path: string, scroll: number, hash = "") {
  unwatch(tab.path);
  tab.path = path;
  watch(path);
  addRecent(path);
  await loadInto(tab, scroll, hash);
}

async function goBack() {
  const t = active;
  const e = t?.back.pop();
  if (!t || !e) return;
  t.forward.push({ path: t.path, scroll: scroller.scrollTop });
  await switchPath(t, e.path, e.scroll);
}

async function goForward() {
  const t = active;
  const e = t?.forward.pop();
  if (!t || !e) return;
  t.back.push({ path: t.path, scroll: scroller.scrollTop });
  await switchPath(t, e.path, e.scroll);
}

function cycleTab(dir: number) {
  if (!active || tabs.length < 2) return;
  const i = tabs.indexOf(active);
  activate(tabs[(i + dir + tabs.length) % tabs.length]);
}

async function showOpenDialog() {
  const sel = await openDialog({
    multiple: true,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "mdx"] },
      { name: "Minden fájl", extensions: ["*"] },
    ],
  });
  if (!sel) return;
  for (const p of Array.isArray(sel) ? sel : [sel]) await openFile(p);
}

async function showFolderDialog() {
  const dir = await openDialog({ directory: true, defaultPath: folderRoot() ?? undefined });
  if (typeof dir !== "string") return;
  settings.folder = dir;
  save("folder", dir);
  showPane("files", true);
  await setFolderRoot(dir);
  setFolderActive(active?.path ?? null);
}

// ---- Oldalsáv: tartalomjegyzék és fájlok ---------------------------------------------

function showPane(pane: Pane, forceOpen = false) {
  if (!forceOpen && settings.sidebar && settings.pane === pane) settings.sidebar = false;
  else {
    settings.sidebar = true;
    settings.pane = pane;
  }
  save("sidebar", settings.sidebar);
  save("pane", settings.pane);
  updateSidebar();
}

function toggleSidebar() {
  settings.sidebar = !settings.sidebar;
  save("sidebar", settings.sidebar);
  updateSidebar();
}

function updateSidebar() {
  const docOpen = !!active;
  sidebar.hidden = !settings.sidebar || (!docOpen && settings.pane === "toc" && !settings.folder);
  $("btn-sidebar").classList.toggle("on", !sidebar.hidden);
  for (const b of sidebar.querySelectorAll<HTMLElement>("[data-pane]"))
    b.classList.toggle("on", b.dataset.pane === settings.pane);
  tocEl.hidden = settings.pane !== "toc";
  filesEl.hidden = settings.pane !== "files";
  if (sidebar.hidden) return;
  if (settings.pane === "toc") renderToc();
  else syncFolder();
}

async function syncFolder() {
  const path = active && !isVirtual(active.path) ? active.path : null;
  const root = settings.folder ?? (path ? dirname(path) : null);
  if (root) await setFolderRoot(root);
  setFolderActive(path);
}

function renderToc() {
  const toc = active?.toc ?? [];
  if (toc.length === 0) {
    tocEl.innerHTML = `<div class="tree-empty">Nincsenek címsorok.</div>`;
    return;
  }
  const min = Math.min(...toc.map((t) => t.level));
  tocEl.replaceChildren(
    ...toc
      .filter((t) => t.level - min < 4)
      .map((t) => {
        const a = document.createElement("a");
        a.textContent = t.text;
        a.dataset.id = t.id;
        a.style.paddingLeft = `${12 + (t.level - min) * 14}px`;
        a.onclick = () => scrollToId(t.id);
        return a;
      }),
  );
  spy();
}

function scrollToId(id: string) {
  if (!active) return;
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    /* marad */
  }
  const el = active.doc.querySelector<HTMLElement>(`[id="${CSS.escape(decoded)}"], a[name="${CSS.escape(decoded)}"]`);
  if (el) scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12;
}

let spyQueued = false;
function spy() {
  if (sidebar.hidden || tocEl.hidden || !active) return;
  const top = scroller.getBoundingClientRect().top + 80;
  let current: string | null = null;
  for (const t of active.toc) {
    const el = active.doc.querySelector<HTMLElement>(`[id="${CSS.escape(t.id)}"]`);
    if (!el) continue;
    if (el.getBoundingClientRect().top <= top) current = t.id;
    else break;
  }
  current ??= active.toc[0]?.id ?? null;
  for (const a of tocEl.children as HTMLCollectionOf<HTMLElement>) {
    const on = a.dataset.id === current;
    if (on && !a.classList.contains("active")) a.scrollIntoView({ block: "nearest" });
    a.classList.toggle("active", on);
  }
}
scroller.addEventListener(
  "scroll",
  () => {
    if (spyQueued) return;
    spyQueued = true;
    requestAnimationFrame(() => {
      spyQueued = false;
      spy();
    });
  },
  { passive: true },
);

for (const b of sidebar.querySelectorAll<HTMLElement>("[data-pane]"))
  b.onclick = () => showPane(b.dataset.pane as Pane, true);
$("files-pick").onclick = showFolderDialog;
initFolder((path, newTab) => openFile(path, { background: newTab }));

// ---- Menü --------------------------------------------------------------------------------

function openMenu() {
  const needsDoc = !active || isVirtual(active.path);
  for (const b of menu.querySelectorAll<HTMLButtonElement>("[data-needs-doc]")) b.disabled = needsDoc;
  const check = (action: string, on: boolean) =>
    menu.querySelector(`[data-action="${action}"]`)!.classList.toggle("checked", on);
  check("toc", settings.sidebar && settings.pane === "toc");
  check("files", settings.sidebar && settings.pane === "files");
  check("wide", settings.wide);

  const recent = load<string[]>("recent", []).slice(0, 5);
  const box = $("menu-recent");
  box.replaceChildren();
  if (recent.length) {
    const h = document.createElement("div");
    h.className = "menu-label";
    h.textContent = "Legutóbbi";
    box.append(h, ...recent.map((p) => recentLink(p, () => (closeMenu(), openFile(p)), "button")));
    for (const el of box.querySelectorAll("button")) el.classList.add("recent-item");
  }
  box.append(document.createElement("hr"));
  menu.hidden = false;
  $("btn-menu").classList.add("on");
  (menu.querySelector("button:not(:disabled)") as HTMLElement | null)?.focus();
}

function closeMenu() {
  menu.hidden = true;
  $("btn-menu").classList.remove("on");
}

const toggleMenu = () => (menu.hidden ? openMenu() : closeMenu());

$("btn-menu").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu();
});
document.addEventListener("mousedown", (e) => {
  if (!menu.hidden && !menu.contains(e.target as Node) && !(e.target as HTMLElement).closest("#btn-menu")) closeMenu();
});
window.addEventListener("blur", closeMenu);

const actions: Record<string, () => unknown> = {
  open: showOpenDialog,
  "open-folder": showFolderDialog,
  reveal: () => active && !isVirtual(active.path) && revealItemInDir(active.path),
  print: printDoc,
  toc: () => showPane("toc"),
  files: () => showPane("files"),
  wide: toggleWidth,
  "zoom-in": () => setZoom(settings.zoom + 0.1),
  "zoom-out": () => setZoom(settings.zoom - 0.1),
  "zoom-reset": () => setZoom(1),
  help: () => openFile(HELP),
  update: () => checkForUpdates(true),
  about: showAbout,
};
const keepOpen = new Set(["zoom-in", "zoom-out", "zoom-reset"]);

menu.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!btn || btn.disabled) return;
  if (btn.dataset.themeSet) return setTheme(btn.dataset.themeSet as Theme);
  const a = btn.dataset.action;
  if (!a) return;
  if (!keepOpen.has(a)) closeMenu();
  actions[a]?.();
});

menu.addEventListener("keydown", (e) => {
  const items = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === "ArrowDown") items[(i + 1) % items.length]?.focus();
  else if (e.key === "ArrowUp") items[(i - 1 + items.length) % items.length]?.focus();
  else if (e.key === "Escape") closeMenu();
  else return;
  e.preventDefault();
  e.stopPropagation();
});

// ---- Nyomtatás, névjegy -------------------------------------------------------------------

function printDoc() {
  if (!active) return;
  closeMenu();
  window.print();
}

const about = $<HTMLDialogElement>("about");
(about.querySelector("img") as HTMLImageElement).src = iconUrl;
for (const a of about.querySelectorAll<HTMLElement>("[data-href]")) a.onclick = () => openUrl(a.dataset.href!);

async function showAbout() {
  const v = await getVersion().catch(() => "?");
  $("about-version").textContent = `Verzió ${v}`;
  about.showModal();
}

// ---- Linkek és kódmásolás ----------------------------------------------------------

docsEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;

  const copy = target.closest<HTMLButtonElement>(".copy-btn");
  if (copy) {
    const code = copy.parentElement!.querySelector("code") ?? copy.parentElement!;
    await navigator.clipboard.writeText(code.textContent ?? "");
    copy.textContent = "Másolva ✓";
    setTimeout(() => (copy.textContent = "Másolás"), 1200);
    return;
  }

  const a = target.closest<HTMLAnchorElement>("a[href]");
  if (!a || !active) return;
  e.preventDefault();
  const href = a.getAttribute("href")!;
  if (href.startsWith("#")) return scrollToId(href.slice(1));
  if (isExternal(href)) {
    if (/^(https?|mailto):/i.test(href)) openUrl(href);
    return;
  }
  if (isVirtual(active.path)) return;
  const [rel, hash] = splitHref(href);
  const path = resolvePath(dirname(active.path), rel);
  if (MD_EXT.test(path)) {
    if (e.ctrlKey) openFile(path, { background: true });
    else navigate(active, path, hash);
  } else if (await invoke<boolean>("file_exists", { path })) {
    openPath(path);
  }
});

docsEl.addEventListener("auxclick", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
  if (e.button !== 1 || !a || !active || isVirtual(active.path)) return;
  e.preventDefault();
  const href = a.getAttribute("href")!;
  if (href.startsWith("#") || isExternal(href)) return;
  const path = resolvePath(dirname(active.path), splitHref(href)[0]);
  if (MD_EXT.test(path)) openFile(path, { background: true });
});

// ---- Billentyűk és egér ---------------------------------------------------------------

let altAlone = false;

document.addEventListener("keydown", (e) => {
  altAlone = e.key === "Alt" && !e.ctrlKey && !e.shiftKey;
  if (e.key === "Alt") {
    e.preventDefault();
    return;
  }
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  let handled = true;

  if (ctrl && e.key === "Tab") cycleTab(e.shiftKey ? -1 : 1);
  else if (ctrl && e.key === "PageDown") cycleTab(1);
  else if (ctrl && e.key === "PageUp") cycleTab(-1);
  else if (ctrl && !e.shiftKey && k === "o") showOpenDialog();
  else if (ctrl && e.shiftKey && k === "o") showFolderDialog();
  else if ((ctrl && !e.shiftKey && k === "w") || (ctrl && e.key === "F4")) active && closeTab(active);
  else if (ctrl && e.shiftKey && k === "t") {
    const p = closedPaths.pop();
    if (p) openFile(p);
  } else if (ctrl && !e.shiftKey && k === "f") openFind();
  else if (e.key === "F3") findStep(e.shiftKey ? -1 : 1);
  else if (e.key === "Escape" && !menu.hidden) closeMenu();
  else if (e.key === "Escape" && findOpen()) closeFind();
  else if (ctrl && !e.shiftKey && k === "b") toggleSidebar();
  else if (ctrl && e.shiftKey && k === "e") showPane("files");
  else if (ctrl && e.shiftKey && k === "l") cycleTheme();
  else if (ctrl && e.shiftKey && k === "w") toggleWidth();
  else if (ctrl && !e.shiftKey && k === "p") printDoc();
  else if (ctrl && (e.key === "+" || e.key === "=")) setZoom(settings.zoom + 0.1);
  else if (ctrl && e.key === "-") setZoom(settings.zoom - 0.1);
  else if (ctrl && e.key === "0") setZoom(1);
  else if (ctrl && /^[1-9]$/.test(e.key)) {
    const n = +e.key;
    activate(n === 9 ? tabs[tabs.length - 1] : (tabs[n - 1] ?? active));
  } else if (e.altKey && e.key === "ArrowLeft") goBack();
  else if (e.altKey && e.key === "ArrowRight") goForward();
  else if (e.key === "F1") openFile(HELP);
  else if (e.key === "F5" || (ctrl && k === "r")) active && loadInto(active, scroller.scrollTop);
  else if (e.key === "Home" && !isTyping(e)) scroller.scrollTop = 0;
  else if (e.key === "End" && !isTyping(e)) scroller.scrollTop = scroller.scrollHeight;
  else handled = false;

  if (handled) e.preventDefault();
});

// egymagában lenyomott Alt: menü (mint a Windows-alkalmazásokban)
document.addEventListener("keyup", (e) => {
  if (e.key === "Alt" && altAlone) {
    e.preventDefault();
    toggleMenu();
  }
  altAlone = false;
});
document.addEventListener("mousedown", () => (altAlone = false));

function isTyping(e: KeyboardEvent) {
  return (e.target as HTMLElement).tagName === "INPUT";
}

document.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(settings.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
  },
  { passive: false },
);

// egér vissza/előre gombjai
document.addEventListener("mouseup", (e) => {
  if (e.button === 3) goBack();
  else if (e.button === 4) goForward();
});

// a böngésző menüje (Frissítés, Vissza…) itt csak zavarna; kijelölt szöveg másolása Ctrl+C-vel
document.addEventListener("contextmenu", (e) => {
  if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault();
});

tabsEl.addEventListener("dblclick", (e) => {
  if (e.target === tabsEl) showOpenDialog();
});
tabsEl.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) return;
    tabsEl.scrollLeft += e.deltaY;
  },
  { passive: true },
);

// ---- Eszköztár --------------------------------------------------------------------------

function toggleWidth() {
  settings.wide = !settings.wide;
  save("wide", settings.wide);
  applySettings();
}
function cycleTheme() {
  const order: Theme[] = ["system", "light", "dark"];
  setTheme(order[(order.indexOf(settings.theme) + 1) % order.length]);
}

$("btn-sidebar").onclick = toggleSidebar;

// ---- Élő újratöltés -------------------------------------------------------------------

const reloadTimers = new Map<string, number>();
listen<string>("file-changed", ({ payload }) => {
  const key = payload.toLowerCase();
  clearTimeout(reloadTimers.get(key));
  reloadTimers.set(
    key,
    window.setTimeout(() => {
      reloadTimers.delete(key);
      for (const t of tabs) {
        if (samePath(t.path, payload)) loadInto(t, t === active ? scroller.scrollTop : t.scroll);
      }
    }, 120),
  );
});

// ---- Megnyitás kívülről: második példány, drag & drop ----------------------------------

listen<string[]>("open-files", async ({ payload }) => {
  for (const p of payload) await openFile(p);
});

const overlay = $("drop-overlay");
getCurrentWebview().onDragDropEvent(async (ev) => {
  const p = ev.payload;
  if (p.type === "enter" || p.type === "over") overlay.hidden = false;
  else if (p.type === "leave") overlay.hidden = true;
  else if (p.type === "drop") {
    overlay.hidden = true;
    for (const path of p.paths) if (MD_EXT.test(path)) await openFile(path);
  }
});

// ---- Indítás --------------------------------------------------------------------------------

async function start() {
  initFind(scroller);
  applySettings();
  const files = await invoke<string[]>("take_launch_files").catch(() => []);
  if (files.length) {
    for (const p of files) await openFile(p);
  } else {
    activate(null);
  }
  await appWindow.show();
  await appWindow.setFocus();
  if (import.meta.env.PROD) setTimeout(() => checkForUpdates(), 4000);
}

start();
