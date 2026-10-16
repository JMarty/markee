// Keresés a dokumentumban a CSS Custom Highlight API-val: nem módosítja a DOM-ot,
// így nagy dokumentumban is gyors, és a tab váltása sem rontja el.

import { t } from "./i18n";

const bar = document.getElementById("findbar")!;
const input = document.getElementById("find-input") as HTMLInputElement;
const count = document.getElementById("find-count")!;

let ranges: Range[] = [];
let current = -1;
let root: HTMLElement | null = null;
let scroller: HTMLElement;

function clear() {
  CSS.highlights.delete("find");
  CSS.highlights.delete("find-current");
  ranges = [];
  current = -1;
  count.textContent = "";
}

function search(keepPosition = false) {
  const prev = current;
  clear();
  const q = input.value.toLowerCase();
  if (!q || !root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest(".copy-btn") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue!.toLowerCase();
    for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) {
      const r = new Range();
      r.setStart(n, i);
      r.setEnd(n, i + q.length);
      ranges.push(r);
    }
  }
  if (!ranges.length) {
    count.textContent = t("find.none");
    bar.classList.add("nomatch");
    return;
  }
  bar.classList.remove("nomatch");
  CSS.highlights.set("find", new Highlight(...ranges));
  if (keepPosition && prev >= 0) go(Math.min(prev, ranges.length - 1));
  else go(firstVisible());
}

function firstVisible(): number {
  const top = scroller.getBoundingClientRect().top;
  const i = ranges.findIndex((r) => r.getBoundingClientRect().top >= top);
  return i < 0 ? 0 : i;
}

function go(i: number) {
  if (!ranges.length) return;
  current = (i + ranges.length) % ranges.length;
  const r = ranges[current];
  CSS.highlights.set("find-current", new Highlight(r));
  count.textContent = `${current + 1} / ${ranges.length}`;
  const rect = r.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (rect.top < box.top + 40 || rect.bottom > box.bottom - 40) {
    scroller.scrollTop += rect.top - box.top - box.height / 3;
  }
}

export function initFind(scrollEl: HTMLElement) {
  scroller = scrollEl;
  input.addEventListener("input", () => search());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      go(current + (e.shiftKey ? -1 : 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeFind();
    }
  });
  document.getElementById("find-next")!.onclick = () => go(current + 1);
  document.getElementById("find-prev")!.onclick = () => go(current - 1);
  document.getElementById("find-close")!.onclick = () => closeFind();
}

export function openFind() {
  bar.hidden = false;
  input.focus();
  input.select();
  if (input.value) search();
}

export function closeFind() {
  bar.hidden = true;
  clear();
}

export const findOpen = () => !bar.hidden;

export function findStep(dir: 1 | -1) {
  if (bar.hidden) openFind();
  else go(current + dir);
}

/** Aktív dokumentum változott (tabváltás vagy újratöltés). */
export function setFindRoot(el: HTMLElement | null, keepPosition = false) {
  root = el;
  if (!bar.hidden) search(keepPosition);
}
