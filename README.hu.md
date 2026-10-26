# Markee

**Gyors, könnyű Markdown-nézegető Windowsra.** Dupla kattintás egy `.md` fájlon, és már olvasod is: tabokkal, tartalomjegyzékkel, kereséssel, képletekkel, diagramokkal, változásfigyeléssel.

[English](README.md) · **Magyar**

## Miért?

A Markdown nyersen olvasható, de renderelve az igazi. A meglévő megoldások vagy nehézkesek (egy teljes IDE elindítása egy README miatt), vagy inkább szerkesztők, mint nézegetők. A Markee egyetlen dologra készült: **megnyitni és szépen megmutatni** a Markdown fájlokat – azonnal.

- 🪶 **Kicsi**: ~4,5 MB-os telepítő (Tauri + a Windowsba épített WebView2)
- ⚡ **Gyors**: natív indulás; a nagy könyvtárak (Mermaid, KaTeX) csak akkor töltődnek be, ha a dokumentumban szükség van rájuk
- 🎯 **Egyszerű**: nincs szerkesztő, nincs fiók, nincs felhő

## Funkciók

- **Tabok** – több fájl egy ablakban; ha az app már fut, az újonnan megnyitott fájl új tabban jelenik meg
- **Fájltársítás** – `.md`, `.markdown`, `.mdown`, `.mkd`, `.mdx`
- **GitHub-stílusú Markdown** – táblázatok, feladatlisták, áthúzás, automatikus linkek, `<details>`
- **Kódszínezés** – több mint 30 nyelv (highlight.js), másolás gombbal
- **Képletek** – `$…$` és `$$…$$` (KaTeX)
- **Diagramok** – ` ```mermaid ` blokkok (Mermaid), a témához igazodva
- **Oldalsáv** – tartalomjegyzék az aktuális szakasz kiemelésével, és **mappanézet** a dokumentációs könyvtárak böngészéséhez
- **Keresés** – `Ctrl+F`, találatszámlálóval
- **Linkek követése** – a relatív `.md` linkek az appon belül nyílnak meg, vissza/előre navigációval; a külső linkek a böngészőben
- **Változásfigyelés** – ha egy nyitott fájl megváltozik a lemezen, a Markee szól, és egy kattintással (`F5`) újratölti; a menüben **automatikus újratöltés** is bekapcsolható. A görgetési pozíció megmarad
- **Nyomtatás / PDF** – `Ctrl+P` (PDF-be a „Microsoft Print to PDF” nyomtatóval)
- **Menü** (☰ vagy `Alt`), beépített **súgó** (`F1`) és névjegy
- **Automatikus frissítés** – induláskor csendben ellenőrzi, és egy kattintással frissít
- **Tabok visszaállítása** induláskor (mint a Jegyzettömbben) – kikapcsolható
- **Többnyelvű felület**: angol, magyar, német, spanyol – a Windows nyelvét követi
- **Informatív kezdőképernyő** legutóbbi fájlokkal, tippekkel és billentyűparancsokkal
- **Világos / sötét téma**, zoom, olvasási szélesség, drag & drop
- **Biztonság** – a dokumentumba ágyazott HTML-t szűri (DOMPurify), szkriptek nem futnak; a frissítések digitálisan aláírtak

## Billentyűparancsok

| Parancs | Művelet |
|---|---|
| `Ctrl+O` / `Ctrl+Shift+O` | Fájl / mappa megnyitása |
| `Ctrl+W` / középső kattintás | Tab bezárása |
| `Ctrl+Shift+T` | Bezárt tab visszaállítása |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Következő / előző tab |
| `Ctrl+1` … `Ctrl+9` | Ugrás adott tabra |
| `Ctrl+F`, `F3` / `Shift+F3` | Keresés, következő / előző találat |
| `Ctrl+B` | Oldalsáv be/ki |
| `Ctrl+Shift+E` | Fájlok panel |
| `Ctrl+P` | Nyomtatás |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` / `Ctrl+görgő` | Zoom |
| `Ctrl+Shift+W` | Olvasási szélesség váltása |
| `Ctrl+Shift+L` | Téma: rendszer → világos → sötét |
| `Alt+←` / `Alt+→` | Vissza / előre (linkek követése után) |
| `Alt` | Menü |
| `F1` | Súgó |
| `F5` | Újratöltés |
| `Ctrl+kattintás` linken | Megnyitás új tabban |

## Telepítés

Töltsd le a legfrissebb `…_x64-setup.exe` telepítőt a [Releases](../../releases/latest) oldalról, és futtasd. Rendszergazdai jog nem kell (a telepítés felhasználói szintű). Ezután a Markee magától frissül.

**Alapértelmezett nézegetőnek** a Windows nem engedi automatikusan beállítani, ezért egyszer kézzel kell: jobb klikk egy `.md` fájlon → *Társítás* → *Másik alkalmazás választása* → **Markee** → *Mindig*.

A telepítő egyelőre nincs Windows-kódaláírással ellátva, ezért a SmartScreen figyelmeztethet („További információ” → „Futtatás mindenképp”).

## Fordítás forrásból

Előfeltételek:

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable)
- Visual Studio Build Tools a „Desktop development with C++” munkacsomaggal
- WebView2 Runtime (Windows 10/11-en általában már telepítve van)

```bash
npm install
npm run tauri dev      # fejlesztői mód, élő újratöltéssel
npm run tauri build    # release build + telepítő (src-tauri/target/release/bundle/nsis/)
```

A release build a frissítőcsomagot is aláírja, ehhez a `TAURI_SIGNING_PRIVATE_KEY` (és `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) környezeti változó kell. Saját buildhez generálj kulcsot (`npx tauri signer generate`), vagy állítsd a `bundle.createUpdaterArtifacts` értékét `false`-ra.

A felület Tauri nélkül, böngészőben is kipróbálható (mockolt API-val): `npm run dev`, majd <http://localhost:1420/dev/preview.html>.

## Új verzió kiadása

1. Verziószám átírása: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
2. Commit, majd címke: `git tag v0.3.0 && git push origin main v0.3.0`
3. A [Release munkafolyamat](.github/workflows/release.yml) lefordítja, aláírja és közzéteszi; a telepített példányok a `latest.json` alapján frissülnek

## Felépítés

```
src/
  main.ts       tabok, navigáció, menü, oldalsáv, billentyűk, változásfigyelés
  render.ts     Markdown → HTML (markdown-it, highlight.js, DOMPurify), útvonalak
  extras.ts     képletek (KaTeX) és diagramok (Mermaid), lusta betöltéssel
  folder.ts     mappanézet
  find.ts       keresés (CSS Custom Highlight API – nem módosítja a DOM-ot)
  i18n.ts       felületi fordítások
  updater.ts    automatikus frissítés
  help/*.md     beépített súgó, nyelvenként egy fájl
  styles.css    téma, tipográfia, nyomtatási nézet
src-tauri/
  src/lib.rs    fájlolvasás, mappalistázás, fájlfigyelés (notify), egypéldányos működés
  tauri.conf.json
  windows/hooks.nsh   telepítő-kiegészítés a „Társítás” listához
.github/workflows/    CI és automatikus kiadás
samples/        tesztdokumentumok
```

## Ütemterv

- [x] Név
- [x] Ikon
- [x] Súgó, menü, névjegy
- [x] Automatikus frissítés
- [x] Mermaid diagramok, KaTeX matematika
- [x] Nyomtatás / PDF
- [x] Mappanézet
- [ ] Windows-kódaláírás ([SignPath Foundation](https://signpath.org/) – ingyenes open source projekteknek)

## Licenc

[MIT](LICENSE) © JMarty
