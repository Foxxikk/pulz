# PULZ – box v rytmu (VR fitness pro Meta Quest 3)

Rytmická boxovací fitness hra ve WebXR. Stojíš na plošině uprostřed tyrkysové řeky a pěstmi rozbíjíš terče, které letí v rytmu hudby. **Hraje se jen rukama** (hand tracking) – bez ovladačů.

- **Modrý terč = levá ruka, oranžový = pravá.**
- Terč je 3D disk ze šesti dílů – po zásahu se rozletí na kusy.
- Bílé křídlo na boku = **hook** (úder zboku), křídlo dole = **zvedák**, čistý disk = **direkt**. Velký zlatý terč na konci = **finále** (libovolnou rukou).
- Oranžový půlkruh: plochá hrana vodorovně = **podřep**, šikmo = **podřep do strany**, svisle = **úklon**; často jdou za sebou ve spirále.
- Růžová zeď zleva/zprava = **ukroč** na druhou stranu.
- Combo násobí body (×2 od 10, ×3 od 25, ×4 od 50), na konci známka S–D, rekordy, odhad kalorií.

## Jak hrát
1. Na Questu 3 otevři odkaz v prohlížeči, odlož ovladače, klikni **Vstoupit do VR**.
2. V menu šťouchni prstem do trati, obtížnosti a **BOXOVAT**.
3. Postav se doprostřed plošiny a natáhni obě pěsti před sebe (kalibrace výšky a dosahu).
4. Pauza: podrž pravý ukazováček na tlačítku na levém zápěstí (nebo otevři menu Questu).

Na PC: **Ukázka na PC** – hraje bot, tažením myši se rozhlížíš, mezerník = pauza.

## Novinky v10.2 – nahrávání po částech
- **Nahrát jen část**: během nahrávání otevři pauzu (podržení ukazováčku na zápěstí) → „Uložit nahranou část“. Uloží se, co jsi stihl.
- **Zkusit část**: ve výsledcích „Zkusit část“ – hraje jen nahraný úsek (od 3 s před ním do 2,5 s po něm), ne celá skladba.
- **Nahrát znovu / Nahrát další**: přepíše jen tuto část, nebo naváže od místa, kde jsi skončil (2,5 s předehra). Části se slučují do jedné choreografie skladby.
- **Méně citlivé překážky při nahrávání**: úhyb se zapíše až při odchylce hlavy ≥ 22 cm, která trvá aspoň 0,12 s (pohupování při úderech nebo krátké cuknutí se nezapíše); zeď až při úkroku ≥ 30 cm bez naklonění hlavy.

## Novinky v10.1 – editor choreografie
- **Jen boxerské údery**: úder se zapíše, jen když pěst vyrazí z gardy (před obličejem) aspoň o 20 cm se švihem ≥ 2,2 m/s. Druh se určí podle natočení hráče (direkt dopředu od těla, hook ze strany dovnitř, zvedák zespodu nahoru). Mávnutí, spuštění rukou, stažení ruky k tělu nebo třesení se ignorují; při ztrátě sledování ruky se nic nezapisuje.
- **Úhyb = překážka**: hra sleduje odchylku hlavy od neutrální polohy (ta se průběžně dolaďuje). Podřep nebo úklon se zapíše jako půlkruh natočený přesně podle směru úhybu (po 22,5°), oblouk hlavou vytvoří spirálu, úkrok do strany bez naklonění hlavy vytvoří zeď. Zaznamenaná překážka se hned ukáže před tebou a zasviští.

## Novinky v10
- **Režimy** (v menu řádek „Režim“): *Trénink*, *Bez chyby* (první minutý terč, náraz do překážky nebo bomba = konec; výsledek ukáže, kolik skladby jsi zvládl), *Vytrvalost* (všechny skladby za sebou, mezi nimi 9 s pauza s odpočtem, celkový součet bodů, kalorií a času), *Nahrát choreo*.
- **Editor choreografie**: zvol skladbu a režim „Nahrát choreo“ → hraje hudba bez terčů, ty boxuješ a hra zaznamená každý úder (druh podle směru, ruku, místo), podřepy a úklony; časy zarovná na půldoby. Pak se skladba hraje s tvou choreografií (v menu přepínač „Moje choreografie: ZAP/VYP“).
- **Statistiky** (tlačítko v menu): počet tréninků, série dní v řadě, kalorie za týden (graf 7 dní), celkový čas, nejlepší výsledky a 12 odznaků.
- **Trenér**: krátké povely během hry (start, polovina, posledních 30 s, upozornění na spirálu, zeď, bosse, bombu, dvojitý terč, povzbuzení po sérii chyb, milníky comba) – hlasem (pokud prohlížeč má český hlas), jinak textem; po tréninku tip podle záznamu (která ruka zaostává, proč se minulo…). Nastavení: hlas / jen text / vypnuto.
- **Rozcvička a protažení**: před tréninkem ve VR 1 min rozcvičky (5 cviků s odpočtem, klidná hudba), po tréninku tlačítko „Protažení“ (5 cviků). Obojí jde v nastavení vypnout a kdykoli přeskočit.
- **Prostředí podle hudby**: barva a jas scény se plynule mění podle části skladby (gradace teplejší, pauza chladnější, refrén s jemnými záblesky do rytmu); nové prostředí **Noc**.

## Novinky v9
- **Automatická kalibrace** (Nastavení → Automatická kalibrace): 12 zkušebních terčů, hra změří tvůj švih, směr úderů a jak přesně trefuješ, a sama nastaví citlivost každého úderu i zónu zásahu.
- **Nové typy terčů**: *dvojitý* (obě pěsti zároveň, spojené světelným paprskem, bonus za současný úder), *zakřivený let* (přiletí obloukem ze strany), *rychlá série* (menší terče v gradaci), *bomba* (červená ostnatá – netrefit, jinak −300 a konec comba), *boss* (velký zlatý terč uprostřed skladby, visí před tebou ~2 s a rozbíjí se po dílech rychlými údery).
- **Výkon na Questu**: skutečné měření FPS (dřív zkreslené), automatické snížení efektů, když hra nestíhá obnovovací frekvenci headsetu (a vrácení, když zase stíhá). FPS lze zobrazit v nastavení.

## Novinky v8
- **Moje skladby**: „Nahrát skladby (MP3)“ přidává do seznamu (i víc souborů najednou), nic se nepřepisuje. Seznam je na stránce i v menu ve VR („Moje skladby“). Po odemknutí PINem se skladby z tohoto zařízení samy nahrají do knihovny na serveru → uvidíš je i na Questu (a naopak).
- **Plynulé spirály půlkruhů**: série 6–15 půlkruhů po půldobách, každý pootočený o 22,5° → hlava plynule opisuje oblouk z úklonu přes podřep na druhou stranu.
- **Terče se skládají**: zdálky letí terč rozložený na dílky a roztočený, asi 0,45 s před úderem dílky zacvaknou do sebe. Jádro se při příletu nabíjí a v perfektní chvíli zbělá. Terč pulzuje do rytmu, při objevení blikne „portál“, s násobičem combo obruby terčů zlátnou.
- **Nové efekty**: body létající z místa zásahu, při novém násobiči zlatá vlna po hladině a velké „×3“, rukavice s násobičem víc září a při ×3/×4 z pěstí odlétají zlaté jiskry.
- Reproduktory ve scéně odstraněny (prostorový zvuk zůstává, jen bez viditelných beden).

## Novinky v7
- **Prostorová hudba**: levý a pravý kanál hrají ze dvou reproduktorů ve scéně (vlevo a vpravo před hráčem) přes HRTF, s malým prostorem. Hudba zůstává na místě, i když otočíš hlavou. Reproduktory jsou vidět a membrány pulzují do rytmu. V nastavení přepínač **Hudba: prostorová / klasické stereo**.
- **Basový zásah**: 808 „punch“ (sinus s prudkým pádem výšky, přebuzený, aby bas byl slyšet i z reproduktorů Questu) + tom s paličkou; hook a zvedák ještě hlubší a delší.
- **Zvuk průletu**: půlkruh i zeď při průletu kolem hlavy zasviští (vrchol zvuku přesně v okamžiku průletu, ze strany, kde překážka je); zeď je těžší a hlubší.
- **Hudba po tréninku**: na obrazovce výsledků a v menu hraje tiše klidná smyčka, dokud nezačne další trénink.
- **Lepší detekce úderů**: síla se měří jako špička švihu za posledních 120 ms (dřív rychlost v okamžiku doteku, kdy pěst už brzdí → „slabý úder“ i u pořádné rány). Směr se bere z okamžiku doteku. Terč po okamžiku úderu dojede jen kousek (nenarazí do ruky v gardě).
- **Záznam her a analýza**: po každém tréninku na Questu se odešle anonymní záznam (časy, rychlosti, vzdálenosti, kvalita sledování rukou, nastavení; žádné osobní údaje) do úložiště. Na **/analyza.html** (PIN) jsou statistiky: proč se terče minuly, úspěšnost podle úderu a ruky, švih vs. rychlost při doteku, načasování, kvalita sledování a automatická doporučení. Výsledky tréninku ukazují i důvody minutí.
- Neonové brány nad řekou odstraněny.

## Novinky v6
- **Větší terče** (průměr 34 cm místo 26 cm) s výraznější kopulí; zóna zásahu zůstala zhruba stejná, takže hra není „laxnější“.
- **Lepší buben**: zvuk zásahu je model skutečné blány (6 kmitových módů kruhové membrány s vlastním doznáním), úder paličky, rezonance korpusu, „buch“ do hrudi, jemné přebuzení a krátký prostor. Direkt = tom (levá ruka výš, pravá níž), hook/zvedák = velký kotel jako taiko.
- **Spirály půlkruhů**: série 3–7 půlkruhů za sebou, každý pootočený o 45° (úklon → šikmý podřep → podřep → šikmý podřep → úklon na druhou stranu), takže tělo opisuje oblouk. Nové šikmé půlkruhy. Bariéry jsou zhruba 4× častější.
- **Létající zdi**: růžové skleněné stěny s výstražnými pruhy u hrany – zleva nebo zprava, musíš ukročit na druhou stranu; v refrénech „slalom“ zdí střídavě vlevo a vpravo.
- Přepínač v nastavení: **Bariéry: všechny / jen půlkruhy (bez zdí) / vypnuté**.
- **Grafika**: neonové brány nad dráhou terčů, které jedou k hráči a blikají do rytmu, proud světelných částic (pocit rychlosti), půlkruhy se silnou zářící 3D obrubou.

## Novinky v5
- **Vypouklé terče**: čelo každé výseče je lesklá lakovaná kopule (clearcoat), po které běhají odlesky z okolí. Terč na hook je natočený čelem do strany, odkud přichází pěst, terč na zvedák čelem dolů (natočení ~40°, aby zůstal čitelný). Úlomky po zásahu jsou vypouklé taky.
- **Zvuk zásahu jako buben**: místo kovového cinknutí tom s úderem paličky (směr: levá ruka vyšší tom, pravá nižší), hook/zvedák hlubší tom s kopákem, perfektní zásah přidá virbl. Bez tónové výšky, takže sedí k téměř každé hudbě. Finále = bubnový přechod s činelem.
- **Efekty**: rázová vlna v rovině čela terče, u perfektního zásahu zlatá vlna a hvězdicový záblesk; kolem plošiny ekvalizér ze svítících sloupků (vlevo modrá, vpravo oranžová), pulzuje do rytmu a po zásahu jím proběhne vlna ze směru terče; podlahou se s každou dobou rozběhne kruh, obruba plošiny pulzuje.

## Novinky v4
- **Létající 3D terče jako ve FunFitLandu**: tmavý zkosený disk složený ze šesti výsečí, spáry svítí barvou ruky, uprostřed ikona. Po zásahu se výseče rozletí do stran i ve směru úderu, k tomu jiskry a záblesk.
- **Rytmus vlastní skladby**: terče už nestojí na pravidelné mřížce, ale na skutečných úderech v hudbě (bicí, akcenty) zarovnaných na doby a půldoby. Silné akcenty = hook/zvedák, hustota podle části skladby. Na skladbě Believer: 96 % terčů přesně na úderu v hudbě (průměrná odchylka 14 ms, dřív 36 ms), na nejsilnějších úderech 33–46 % (dřív ~20 %). Terč navíc přilétá svižněji, takže okamžik úderu je zřetelný.
- **Bariéry bez „spirál“**: mezi bariérami minimálně 2 takty, úklon nikdy hned po úklonu. V nastavení přepínač **Bariéry: všechny / jen podřep / vypnuté**.
- **Finále**: na konci každé skladby přiletí velký zlatý terč – po zásahu ohňostroj a konec tréninku.
- **Nové HUD**: skóre se načítá, ukazatel přesnosti a průběhu skladby, combo s násobičem v kruhu a ukazatelem „×3 za 7“, vše jemně pulzuje do rytmu hudby. Ve výsledcích pruh perfektní/skvělé/dobré/minuté.
- **Knihovna skladeb na PIN**: tlačítko „Knihovna (PIN)“ na stránce i v menu ve VR (klávesnice). PIN ověřuje server (výchozí 4321, změna proměnnou `PULZ_PIN` ve Vercelu). Skladby se nahrávají do Vercel Blob jen se správným PINem; stažená skladba a její analýza se uloží v zařízení, podruhé se už nestahuje.

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
