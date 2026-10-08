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

## Novinky v3
- **3D létající objekty**: broušené energetické krystaly, které se za letu převalují, uvnitř svítí a odrážejí okolí. Žádné kruhy ani závorky – směr hooku a zvedáku ukazuje 3D šipka. Po úderu se krystal roztříští na barevné střepy, které osvítí záblesk.
- **Vlastní skladba (MP3)**: tlačítko na stránce (před vstupem do VR). Hra skladbu sama rozebere – najde tempo, doby a sekce (klid / sloka / refrén / gradace) – a vygeneruje terče přesně do rytmu. Skladba se uloží jen v zařízení (nikam se neodesílá) a v menu je jako čtvrtá trať.
- **Vlastní 360° video** jako pozadí (nahrání stejně jako skladba; zvuk videa hraje tiše pod hudbou).
- **Zvuky přírody** u každého prostředí (potok, jez/vodopád, ptáci) – při tréninku se samy ztiší, hlasitost v nastavení.

## Novinky v2
- **Prostředí z 360° fotek** (Poly Haven, CC0): Jezero, Laguna, Potok, Zahrada, Hráz + kreslené Město. Volí se v menu, načítají se za běhu v 8K (přes `/pano/` ve Vercelu), terče a rukavice v nich odrážejí okolí.
- **Nové létající terče**: kovové zkosené tělo s odrazy, svítící obruč, rotující ikona, záře, svítící ohon za letem, časovací kruh a závorky, které zezlátnou v perfektní chvíli. Při zásahu se terč roztříští na kovové a svítící střepy.
- **Energetické bariéry** s animovanou šestiúhelníkovou mřížkou a pruhy.
- **Citlivost každého úderu zvlášť** (direkt, hook, zvedák; 1 = přísná … 5 = bere skoro všechno) a **velikost zóny zásahu**. Výchozí citlivost je vyšší než ve v1.
- **Poslední údery**: přehled rychlosti a důvodu („slabý“, „vedle o 4 cm“, „jiný směr“) – podle něj se citlivost snadno doladí.
- **Zkušební terče** v nastavení: stojí před tebou (direkt, hook, zvedák L/P) a můžeš na nich ladit citlivost.
- Špatný směr úderu terč už nezablokuje (jen dá méně bodů), kromě nejpřísnější úrovně.

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

360° fotky prostředí: [Poly Haven](https://polyhaven.com) (CC0) – lakeside, blue_grotto, lauter_waterfall, chinese_garden, radkow_lake. Zvuky přírody: Wikimedia Commons – „Forest lawn creek“ (Dsw, volné dílo), „Vojníkov, 3. jez“ (Juandev, volné dílo), „Erithacus rubecula XC470227“ (Marie-Lan Taÿ Pamart, CC BY-SA 4.0). Ostatní grafika, zvuk i hudba jsou procedurální (vlastní). Vlastní skladby a videa nahrané hráčem zůstávají jen v jeho zařízení. Hra je inspirovaná žánrem VR boxovacího fitness, nepoužívá cizí názvy, grafiku ani hudbu.
