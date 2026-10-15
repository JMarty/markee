# MD View

**Gyors, könnyű Markdown-nézegető Windowsra.** Dupla kattintás egy `.md` fájlon, és már olvasod is: tabokkal, tartalomjegyzékkel, kereséssel, élő frissítéssel.

*A fast, lightweight Markdown viewer for Windows, built with Tauri.*

> ⚠️ Korai verzió (0.1). A név, az ikon, a súgó, a menü és az automatikus frissítés még tervezés alatt áll – lásd az [ütemtervet](#ütemterv).

## Miért?

A Markdown nyersen olvasható, de renderelve az igazi. A meglévő megoldások vagy nehézkesek (egy teljes IDE elindítása egy README miatt), vagy inkább szerkesztők, mint nézegetők. Az MD View egyetlen dologra készült: **megnyitni és szépen megmutatni** a Markdown fájlokat – azonnal.

- 🪶 **Kicsi**: ~1,5 MB-os telepítő, ~5 MB-os program (Tauri + a Windowsba épített WebView2)
- ⚡ **Gyors**: natív indulás, nincs beépített böngészőmotor
- 🎯 **Egyszerű**: nincs szerkesztő, nincs fiók, nincs felhő

## Funkciók

- **Tabok** – több fájl egy ablakban; ha az app már fut, az újonnan megnyitott fájl új tabban jelenik meg
- **Fájltársítás** – `.md`, `.markdown`, `.mdown`, `.mkd`, `.mdx`
- **GitHub-stílusú Markdown** – táblázatok, feladatlisták, áthúzás, automatikus linkek, `<details>`
- **Kódszínezés** – több mint 30 nyelv (highlight.js), másolás gombbal
- **Tartalomjegyzék** – oldalsáv a címsorokból, kiemeli az aktuális szakaszt
- **Keresés** – `Ctrl+F`, találatszámlálóval
- **Linkek követése** – a relatív `.md` linkek az appon belül nyílnak meg, vissza/előre navigációval; a külső linkek a böngészőben
- **Élő frissítés** – ha a fájl máshol módosul, azonnal frissül, a görgetési pozíció megmarad
- **Relatív képek** – a fájl mappájához képest oldja fel őket
- **Világos / sötét téma** – vagy a rendszer beállítását követi
- **Zoom és olvasási szélesség**
- **Legutóbbi fájlok** a kezdőképernyőn
- **Drag & drop**
- **Biztonság** – a dokumentumba ágyazott HTML-t szűri (DOMPurify), szkriptek nem futnak

## Billentyűparancsok

| Parancs | Művelet |
|---|---|
| `Ctrl+O` | Fájl megnyitása |
| `Ctrl+W` / középső kattintás | Tab bezárása |
| `Ctrl+Shift+T` | Bezárt tab visszaállítása |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Következő / előző tab |
| `Ctrl+1` … `Ctrl+9` | Ugrás adott tabra |
| `Ctrl+F`, `F3` / `Shift+F3` | Keresés, következő / előző találat |
| `Ctrl+B` | Tartalomjegyzék be/ki |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` / `Ctrl+görgő` | Zoom |
| `Ctrl+Shift+W` | Olvasási szélesség váltása |
| `Ctrl+Shift+L` | Téma: rendszer → világos → sötét |
| `Alt+←` / `Alt+→` | Vissza / előre (linkek követése után) |
| `F5` | Újratöltés |
| `Ctrl+kattintás` linken | Megnyitás új tabban |

## Telepítés

Töltsd le a legfrissebb `…_x64-setup.exe` telepítőt a [Releases](../../releases) oldalról, és futtasd. Rendszergazdai jog nem kell (a telepítés felhasználói szintű).

**Alapértelmezett nézegetőnek** a Windows nem engedi automatikusan beállítani, ezért egyszer kézzel kell: jobb klikk egy `.md` fájlon → *Társítás* → *Másik alkalmazás választása* → **MD View** → *Mindig*.

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

A felület Tauri nélkül, böngészőben is kipróbálható (mockolt API-val): `npm run dev`, majd <http://localhost:1420/dev/preview.html>.

## Felépítés

```
src/
  main.ts       tabok, navigáció, billentyűk, tartalomjegyzék, élő frissítés
  render.ts     Markdown → HTML (markdown-it, highlight.js, DOMPurify), útvonalak
  find.ts       keresés (CSS Custom Highlight API – nem módosítja a DOM-ot)
  styles.css    téma és tipográfia
src-tauri/
  src/lib.rs    fájlolvasás, fájlfigyelés (notify), egypéldányos működés
  tauri.conf.json
  windows/hooks.nsh   telepítő-kiegészítés a „Társítás” listához
samples/        tesztdokumentumok
```

## Ütemterv

- [ ] Végleges név és ikon
- [ ] Súgó
- [ ] Menü (fájl, nézet, súgó)
- [ ] Automatikus frissítés
- [ ] Mermaid diagramok, KaTeX matematika
- [ ] Nyomtatás / PDF export
- [ ] Mappanézet (dokumentációs könyvtárak böngészése)

## Licenc

[MIT](LICENSE)
