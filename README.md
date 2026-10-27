# PAC-MAN: THE MAN EDITION

Hratelná webová arkáda podle zadání v `pacman_the_man_prompt.md`.

**Online hra:** [adamferencz.github.io/pacman-the-man-codex](https://adamferencz.github.io/pacman-the-man-codex/)

## Spuštění

Otevřete `index.html` v moderním prohlížeči. Hra běží lokálně bez instalace, serveru a backendu. Online připojení slouží jen pro načtení volitelného webového fontu; hra funguje i bez něj.

## Ovládání

- Šipky nebo WASD: směr pohybu
- P nebo Escape: pauza / pokračování
- Na telefonu: směrová tlačítka hned pod bludištěm nebo tah prstem po herní ploše
- Ikona ♫: vypnutí nebo zapnutí zvuku

Sbírejte tečky, vyhýbejte se duchům a používejte tyrkysový bonus k průchodu zdmi. Po dosažení 1 000 bodů přijde boss The Man. Fialový bonus dovolí bosse zranit dotykem. Má tři životy; útočný bonus se během boje opakovaně objevuje.

Herní pravidla, body, rychlosti a délky bonusů lze upravit v objektu `CONFIG` na začátku `game.js`. Boss používá přiložený obrázek `zeman.png`.
