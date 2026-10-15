import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { render, basename, dirname, resolvePath, samePath, splitHref, isExternal, MD_EXT, type TocItem } from "./render";
import { initFind, openFind, closeFind, findOpen, findStep, setFindRoot } from "./find";

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

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const tabsEl = $("tabs");
const docsEl = $("docs");
const scroller = $("scroller");
const tocEl = $("toc");
const welcome = $("welcome");
const appWindow = getCurrentWindow();

let tabs: Tab[] = [];
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
const settings = {
  theme: load<Theme>("theme", "system"),
  zoom: load("zoom", 1),
  wide: load("wide", false),
  toc: load("toc", true),
};

function applySettings() {
  const root = document.documentElement;
  if (settings.theme === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = settings.theme;
  root.style.setProperty("--zoom", String(settings.zoom));
  root.classList.toggle("wide", settings.wide);
  $("btn-theme").title = `Téma: ${{ system: "rendszer", light: "világos", dark: "sötét" }[settings.theme]} (Ctrl+Shift+L)`;
  updateToc();
}

function setZoom(z: number) {
  settings.zoom = Math.round(Math.min(2.5, Math.max(0.6, z)) * 10) / 10;
  save("zoom", settings.zoom);
  applySettings();
}

// ---- Legutóbbi fájlok ----------------------------------------------------------

function addRecent(path: string) {
  const list = load<string[]>("recent", []).filter((p) => !samePath(p, path));
  list.unshift(path);
  save("recent", list.slice(0, 12));
}

function renderWelcome() {
  const list = load<string[]>("recent", []);
  const ul = $("recent");
  ul.replaceChildren(
    ...list.map((p) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.innerHTML = `<b></b><span></span>`;
      a.querySelector("b")!.textContent = basename(p);
      a.querySelector("span")!.textContent = dirname(p);
      a.onclick = () => openFile(p);
      li.appendChild(a);
      return li;
    }),
  );
  $("recent-wrap").hidden = list.length === 0;
}

// ---- Fájlok betöltése ------------------------------------------------------------

async function loadInto(tab: Tab, scroll = 0, hash = "") {
  let frag: DocumentFragment;
  try {
    const src = await invoke<string>("read_file", { path: tab.path });
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
  if (tab === active) {
    updateToc();
    setFindRoot(tab.doc, true);
    if (hash) scrollToId(hash);
    else scroller.scrollTop = scroll;
  } else {
    tab.scroll = scroll;
  }
}

function updateTabLabel(tab: Tab) {
  tab.tabEl.querySelector(".label")!.textContent = basename(tab.path);
  tab.tabEl.title = tab.path;
  if (tab === active) appWindow.setTitle(`${basename(tab.path)} — MD View`);
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
  invoke("watch_file", { path });
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
    appWindow.setTitle(`${basename(tab.path)} — MD View`);
    setFindRoot(tab.doc);
  } else {
    appWindow.setTitle("MD View");
    renderWelcome();
    setFindRoot(null);
    scroller.scrollTop = 0;
  }
  updateToc();
}

function closeTab(tab: Tab) {
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  invoke("unwatch_file", { path: tab.path });
  closedPaths.push(tab.path);
  tabs.splice(i, 1);
  tab.tabEl.remove();
  tab.doc.remove();
  if (active === tab) {
    active = null;
    activate(tabs[Math.min(i, tabs.length - 1)] ?? null);
  }
}

async function openFile(path: string, opts: { newTab?: boolean; background?: boolean } = {}) {
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
  invoke("unwatch_file", { path: tab.path });
  tab.path = path;
  invoke("watch_file", { path });
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
  const list = Array.isArray(sel) ? sel : [sel];
  for (const p of list) await openFile(p);
}

// ---- Tartalomjegyzék ---------------------------------------------------------------

function updateToc() {
  const show = settings.toc && !!active && active.toc.length > 1;
  tocEl.hidden = !show;
  $("btn-toc").classList.toggle("on", settings.toc);
  if (!show || !active) return;
  const min = Math.min(...active.toc.map((t) => t.level));
  tocEl.replaceChildren(
    ...active.toc
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
  if (tocEl.hidden || !active) return;
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
  if (e.button !== 1 || !a || !active) return;
  e.preventDefault();
  const href = a.getAttribute("href")!;
  if (href.startsWith("#") || isExternal(href)) return;
  const path = resolvePath(dirname(active.path), splitHref(href)[0]);
  if (MD_EXT.test(path)) openFile(path, { background: true });
});

// ---- Billentyűk és egér ---------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  let handled = true;

  if (ctrl && e.key === "Tab") cycleTab(e.shiftKey ? -1 : 1);
  else if (ctrl && e.key === "PageDown") cycleTab(1);
  else if (ctrl && e.key === "PageUp") cycleTab(-1);
  else if (ctrl && !e.shiftKey && k === "o") showOpenDialog();
  else if ((ctrl && !e.shiftKey && k === "w") || (ctrl && e.key === "F4")) active && closeTab(active);
  else if (ctrl && e.shiftKey && k === "t") {
    const p = closedPaths.pop();
    if (p) openFile(p);
  } else if (ctrl && !e.shiftKey && k === "f") openFind();
  else if (e.key === "F3") findStep(e.shiftKey ? -1 : 1);
  else if (e.key === "Escape" && findOpen()) closeFind();
  else if (ctrl && !e.shiftKey && k === "b") toggleToc();
  else if (ctrl && e.shiftKey && k === "l") cycleTheme();
  else if (ctrl && e.shiftKey && k === "w") toggleWidth();
  else if (ctrl && (e.key === "+" || e.key === "=")) setZoom(settings.zoom + 0.1);
  else if (ctrl && e.key === "-") setZoom(settings.zoom - 0.1);
  else if (ctrl && e.key === "0") setZoom(1);
  else if (ctrl && /^[1-9]$/.test(e.key)) {
    const n = +e.key;
    activate(n === 9 ? tabs[tabs.length - 1] : (tabs[n - 1] ?? active));
  } else if (e.altKey && e.key === "ArrowLeft") goBack();
  else if (e.altKey && e.key === "ArrowRight") goForward();
  else if (e.key === "F5" || (ctrl && k === "r")) active && loadInto(active, scroller.scrollTop);
  else if (e.key === "Home" && !isTyping(e)) scroller.scrollTop = 0;
  else if (e.key === "End" && !isTyping(e)) scroller.scrollTop = scroller.scrollHeight;
  else handled = false;

  if (handled) e.preventDefault();
});

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

function toggleToc() {
  settings.toc = !settings.toc;
  save("toc", settings.toc);
  updateToc();
}
function toggleWidth() {
  settings.wide = !settings.wide;
  save("wide", settings.wide);
  applySettings();
}
function cycleTheme() {
  const order: Theme[] = ["system", "light", "dark"];
  settings.theme = order[(order.indexOf(settings.theme) + 1) % order.length];
  save("theme", settings.theme);
  applySettings();
}

$("btn-open").onclick = showOpenDialog;
$("btn-toc").onclick = toggleToc;
$("btn-width").onclick = toggleWidth;
$("btn-theme").onclick = cycleTheme;

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
}

start();
