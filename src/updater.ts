// Automatikus frissítés a GitHub Release-ekből (Tauri updater plugin).

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { t } from "./i18n";

const bar = document.getElementById("update-bar")!;
const text = document.getElementById("update-text")!;
const go = document.getElementById("update-go") as HTMLButtonElement;
const later = document.getElementById("update-later") as HTMLButtonElement;

let pending: Update | null = null;

function show(msg: string, withAction: boolean) {
  text.textContent = msg;
  go.hidden = !withAction;
  later.textContent = withAction ? t("update.later") : t("update.ok");
  bar.hidden = false;
}

later.onclick = () => (bar.hidden = true);

go.onclick = async () => {
  if (!pending) return;
  go.disabled = later.disabled = true;
  let total = 0;
  let done = 0;
  try {
    await pending.downloadAndInstall((ev) => {
      if (ev.event === "Started") total = ev.data.contentLength ?? 0;
      else if (ev.event === "Progress") {
        done += ev.data.chunkLength;
        text.textContent = t("update.downloading", total ? `${Math.round((done / total) * 100)}%` : "");
      } else if (ev.event === "Finished") text.textContent = t("update.installing");
    });
    await relaunch();
  } catch (e) {
    show(t("update.failed", String(e)), false);
  } finally {
    go.disabled = later.disabled = false;
  }
};

/** `manual`: a menüből indítva akkor is visszajelez, ha nincs újabb verzió vagy hiba van. */
export async function checkForUpdates(manual = false) {
  if (manual) show(t("update.checking"), false);
  try {
    pending = await check();
    if (pending) show(t("update.available", pending.version), true);
    else if (manual) show(t("update.upToDate"), false);
  } catch (e) {
    if (manual) show(t("update.checkFailed", String(e)), false);
  }
}
