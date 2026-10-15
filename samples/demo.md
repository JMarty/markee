# MD View bemutató

Ez egy **tesztdokumentum**, amin minden funkció kipróbálható. Linkek: [másik fájl](masik.md), [szakaszra ugrás](#táblázatok), külső: https://example.com

## Szövegformázás

*Dőlt*, **félkövér**, ~~áthúzott~~, `inline kód` és <kbd>Ctrl</kbd>+<kbd>F</kbd>.

> Idézet blokk, ami
> több soros is lehet.

## Listák

- Első elem
- Második elem
  - Beágyazott
  - Még egy
1. Számozott
2. Lista

### Feladatlista

- [x] Kész feladat
- [ ] Nyitott feladat
- [ ] Még egy

## Táblázatok

| Funkció | Állapot | Megjegyzés |
|---|:---:|---:|
| Tabok | ✅ | Ctrl+Tab |
| Keresés | ✅ | Ctrl+F |
| Tartalomjegyzék | ✅ | Ctrl+B |

## Kód

```typescript
interface Tab {
  id: number;
  path: string; // fájl útvonala
}

function open(path: string): Tab {
  return { id: 1, path };
}
```

```rust
fn main() {
    let x = 42;
    println!("Hello {x}");
}
```

```diff
- régi sor
+ új sor
```

## Kép

![ikon](../app-icon.svg)

<details>
<summary>Kinyitható rész</summary>

Rejtett tartalom.

</details>

---

## Hosszú szakasz

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

### Alszakasz A

Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

### Alszakasz B

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

<script>alert("ez nem futhat le")</script>
