# Poker — Texas Hold'em (hotseat 2–6)

Prosta, poprawna implementacja Texas Hold'em. Silnik gry jest oddzielony od UI
i przetestowany: **21 testów, 0 błędów** (`node test.js`).

## Uruchomienie

Otwórz `index.html` w przeglądarce (albo `python3 -m http.server` i wejdź na localhost).
Nic nie instalować — czysty JavaScript, zero zależności.

## Sterowanie

| Klawisz | Akcja |
|---|---|
| `F` | Fold |
| `C` / spacja | Check albo Call |
| `R` | Raise (kwota w polu) |
| `A` | All-in |

## Co jest zaimplementowane

- pełna ocena układów: od wysokiej karty po royal flush, w tym „wheel" (A-2-3-4-5)
- wybór najlepszych 5 kart z 7 (21 kombinacji)
- blindy, pełne rundy: preflop → flop → turn → river → showdown
- side poty przy all-inach, podbicie minimalne, short all-in blokuje podbicia
- 2–6 graczy, karty przeciwników zakryte do showdownu
- statystyki w ukrytym notatniku

## Pliki

- `engine.js` — logika gry (czysta, bez DOM)
- `test.js` — testy na Node (`node test.js`)
- `index.html` — interfejs
- `app.js` — logika UI
- `warianty/` — wcześniejsze wersje gry (zarchiwizowane, nie używane)
