# Chrome Web Store: what to fill in

Everything below in English is ready to copy into the Chrome Web Store form. The Czech notes explain each step.

## Stav (19. 11. 2026, Claude)

Připraveno pro první odeslání Snap Translate 1.1.0, až obchod povolí další rozšíření.

- **Popisy:** `store/descriptions/<jazyk>.txt`, 32 souborů, přesně podle složek v `_locales` (ar, cs, da, de, el, en, es, fi, fil, fr, hi, hr, hu, id, it, ja, ko, ms, nl, no, pl, pt_BR, pt_PT, ro, sk, sv, th, tr, uk, vi, zh_CN, zh_TW). Popisky tlačítek v uvozovkách sedí na `lib/ui`, poslední řádek ("Created with 💜 by Cleedek in Vietnam") je doslova text z rozšíření. Nejdelší má 4 843 znaků (limit obchodu je 16 000).
- **Screenshoty:** `store/images/<jazyk>/screenshot-1.png` až `-5.png`, 1280×800, 160 obrázků. Jsou ze skutečného kódu rozšíření (overlay.js, popup.html), jen vložené do čisté stránky. Cílový jazyk překladu je vždy jazyk čtenáře.
  1. Před a po: plakát ve vietnamštině vlevo, přeložený v prohlížeči vpravo.
  2. Pravé tlačítko na obrázku, "Translate picture".
  3. Tažení přes jídelní lístek.
  4. Zobrazení Seznam, jeden řádek právě zkopírovaný.
  5. Skutečný popup (výběr překladače) a 4 sliby dole.
- **Znovu vygenerovat:** `node store/render.mjs all` (nebo `cs`, nebo `cs,de 1`). Texty obrázků jsou v `store/src/copy/<jazyk>.json`, překlady plakátu a lístku od Google v `store/src/copy/gt/`, obnoví je `node --network-family-autoselection-attempt-timeout=2000 store/gtrans.mjs`.

## Co musíš udělat ty (v tomto pořadí)

1. **Stránka se zásadami ochrany soukromí.** Zatím neexistuje a obchod ji vyžaduje. Edge Trim a Subtitle Overlay ji mají na cleedek.com/<rozšíření>/privacy; navrhuju https://cleedek.com/snap-translate/privacy (EN + CS). Texty níže v "Privacy practices" jsou podklad. Musí být online dřív, než odešleš.
2. **Balíček:** zip celé složky bez `store/` a bez `.git` (v1.1.0).
3. V Dashboardu: **New item**, nahrát zip.
4. **Store listing:** nejdřív anglický popis a pole níže, pak pro každý jazyk zvlášť popis z `descriptions/<jazyk>.txt` a 5 screenshotů z `images/<jazyk>/`. Popis se vkládá celý jako čistý text (obchod neumí tučné písmo ani odkazy, proto hvězdičky ★ a nadpisy velkými písmeny).
5. **Privacy practices:** texty níže, zaškrtnout Data usage a tři prohlášení.
6. **Submit for review** (to dělá vždycky člověk).

## Store listing tab

**Name:** Snap Translate (z `_locales`, v každém jazyce zvlášť)

**Summary / short description:** z `_locales/<jazyk>/messages.json` (`extDescription`), obchod ho bere z balíčku. EN:
Translate the text in pictures right where they are: right-click a picture or drag over any part of the page.

**Category:** Tools (alternative: Accessibility)

**Language:** English

**Description:** celý obsah `store/descriptions/en.txt`.

**Screenshots:** `store/images/en/screenshot-1.png` … `screenshot-5.png` (pořadí 1 až 5).

**Small promo tile (440×280) a marquee (1400×560):** nejsou připravené (nepovinné). Řekni, jestli je chceš.

**Homepage URL:** https://cleedek.com/work/snap-translate (jen pokud ta stránka existuje; jinak https://github.com/Cleedek/snap-translate)

**Support URL:** https://github.com/Cleedek/snap-translate/issues

## Privacy practices tab

**Single purpose:**
Translate the text inside pictures on the current web page and show the translation on the picture itself (in place of the original text) or as a list next to it, when the user right-clicks a picture or selects an area of the page.

**Permission justifications:**

- **activeTab:** The extension only works in the tab where the user starts a translation (the right-click menu, the keyboard shortcut or the popup button). activeTab gives it access to that one tab at that moment, to capture the picture or the selected area and show the translation over it. It never runs on other tabs or on every site.
- **scripting:** Injects the extension's own overlay script into the active tab when the user starts a translation, to let them select an area and to draw the translated text over the picture.
- **contextMenus:** Adds "Translate picture" (on images) and "Translate an area…" (on the page) to the right-click menu.
- **storage:** Saves, on the device only: the target language, the chosen translator (with the user's own Gemini, Claude or other API key and model, or the local model address, if entered), on-picture or list view, interface language, light or dark look, small counters for the "What's new" and support cards, and an unsent "Problem or idea?" draft. Nothing leaves the device unless the user asks for a translation or presses Send.
- **offscreen:** The free Quick translator reads the text in the picture on the user's computer with Tesseract.js (bundled with the extension, including its WebAssembly core and language data). That work runs in a hidden offscreen page (reason WORKERS), which closes after a few minutes without use. The picture is never uploaded for this step.
- **declarativeNetRequestWithHostAccess:** Used only when the user picks a local model (Ollama or LM Studio): one session rule removes the Origin header from the extension's own requests to the local server address the user entered, because Ollama refuses requests that carry a browser extension's Origin. Requests made by websites are never changed.
- **Host permissions:** Each address is one of the translators the user can pick: translate.googleapis.com (Quick: only the text found in the picture), generativelanguage.googleapis.com (Gemini), api.anthropic.com (Claude), openrouter.ai (the default "Other" API), and localhost / 127.0.0.1 (a local model on the user's own computer). Requests go only to the translator the user chose, and only when they ask for a translation.
- **Optional host permissions (http and https):** Only for "Other": a user who enters their own OpenAI-compatible API address is asked by Chrome to allow that one address when they click ↻. Nothing is requested in advance and no other site is accessed.

**Remote code:** No, I am not using remote code. (All scripts, the Tesseract.js WebAssembly core and its language data are inside the package. Translators return plain text, not code.)

**Data usage:** tick **Website content** (the text read from the picture is sent to Google Translate with Quick; with an AI translator a screenshot of only the picture or area the user chose is sent to that provider), **Personal communications** (the message the user writes in "Problem or idea?") and **Personally identifiable information** (the optional reply email in that form). Then tick all three certifications (no selling data, no unrelated use, no creditworthiness use).

Poznámka k Data usage (nejsem si jistý): stejně jako u Subtitle Overlay se API klíč pro Gemini, Claude nebo jiné API posílá jen té službě. Obchod by ho mohl brát jako **Authentication information**; doporučuju zaškrtnout i to (můj odhad, ne ověřené pravidlo). Zpráva z "Problem or idea?" s sebou nese verzi rozšíření, prohlížeč, systém a jazyk rozhraní, ne adresu stránky, proto **Web history** nezaškrtávat.

**Privacy policy URL:** https://cleedek.com/snap-translate/privacy (zatím neexistuje, viz krok 1)

## Na co si dát pozor

- **Překlady psal Claude**, rodilí mluvčí je nekontrolovali. Nejvíc riskantní jsou ar, hi, th, fil, ms (méně ověřené výrazy).
- **pt_BR** má na konci "no Vietname" (evropská portugalština), protože rozšíření má jen jednu portugalštinu (`lib/ui/pt.json`). Brazilec by napsal "no Vietnã". Buď to nechat stejné jako v rozšíření, nebo opravit obojí.
- **Screenshoty ukazují skutečný výstup Quick**, takže i chyby Google: např. "Rare beef pho" / "Seltenes Rindfleisch-Pho" (phở tái), převod ceny na "55,000 VND", v řečtině neviditelné mezery. Nadpis přeloženého plakátu vychází tenčí než originál (odhad tloušťky písma v `lib/typeset.js`), to je vlastnost produktu, ne šablony.
- V mnoha jazycích se u tlačítka objeví bublina, protože překlad je delší než původní místo. I to je skutečné chování.
