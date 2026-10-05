# PULZ – box v rytmu (VR fitness pro Meta Quest 3)

Rytmická boxovací fitness hra ve WebXR. Stojíš na plošině uprostřed tyrkysové řeky a pěstmi rozbíjíš terče, které letí v rytmu hudby. **Hraje se jen rukama** (hand tracking) – bez ovladačů.

- **Modrý terč = levá ruka, oranžový = pravá.**
- Bílé závorky kolem terče se svírají – když se dotknou terče, je čas udeřit.
- Křídlo na boku = **hook** (úder zboku), křídlo dole = **zvedák**, čistý disk = **direkt**.
- Oranžový průsvitný „měsíc“: plochá hrana vodorovně = **podřep**, svisle = **úklon** na druhou stranu.
- Combo násobí body (×2 od 10, ×3 od 25, ×4 od 50), na konci známka S–D, rekordy, odhad kalorií.

## Jak hrát
1. Na Questu 3 otevři odkaz v prohlížeči, odlož ovladače, klikni **Vstoupit do VR**.
2. V menu šťouchni prstem do trati, obtížnosti a **BOXOVAT**.
3. Postav se doprostřed plošiny a natáhni obě pěsti před sebe (kalibrace výšky a dosahu).
4. Pauza: podrž pravý ukazováček na tlačítku na levém zápěstí (nebo otevři menu Questu).

Na PC: **Ukázka na PC** – hraje bot, tažením myši se rozhlížíš, mezerník = pauza.

## Novinky v1 (MVP)
- Kompletní herní smyčka: terče v rytmu, jab / hook / zvedák, podřepy a úklony, combo, skóre, známky, rekordy.
- Detekce úderu z kloubů ruky: rychlost a směr pěsti, zásah „se zátěhem“ (nic nepropadne mezi snímky), dopočet polohy při krátké ztrátě sledování.
- Robotické rukavice postavené na kloubech ruky se svítícím znakem, záblesk a stopa za pěstí.
- Efekty zásahu: jiskry, rázové kruhy, úlomky padající do vody, plovoucí hodnocení.
- 3 vlastní syntetizované skladby (100 / 124 / 140 BPM), 3 obtížnosti, generovaná choreografie z boxerských kombinací.
- Prostředí „Zahradní město“: řeka, bujné břehy, zelené věže, panorama.
- Nastavení: síla úderu, výška bariéry, váha (kalorie), posun zvuku.

Netestováno na skutečném Questu – logika, vstupy rukou a tok obrazovek ověřeny simulací bez brýlí (bot odehraje celé trati, falešné XR klouby).

## Technika
Vanilla JS moduly bez buildu, three.js r180 ve `vendor/`, statický hosting (Vercel). Testy v `test/` (Playwright + SwiftShader):
`node test/chart.mjs`, `node test/sim.mjs '[{"track":"mesto","diff":"mid"}]'`, `node test/xr.mjs`, `node test/shots.mjs`.

Grafika, zvuk i hudba jsou procedurální (vlastní). Hra je inspirovaná žánrem VR boxovacího fitness, nepoužívá cizí názvy, grafiku ani hudbu.
