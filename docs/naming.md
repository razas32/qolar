# Naming — working notes

**Decided 2026-09-04: Qolar.** Coined (a riff on *polar*); Canadian register
clear in classes 9/36/42; only other user is a near-dormant B2B gold-loan
software company in Bengaluru. `qolar.app` registered (Cloudflare), `qolar.ca`
free at CIRA as of writing, `qolar.com` is squatted (Dynadot, 2016 — not
needed). The Canadian half of the brand is carried by the polar-bear (toonie)
mascot, the Q by the "cool for the rest of the world" half.

Before that, the working name was **Loonie**, which is not usable publicly
(see below). Everything below is the record of what was checked so it isn't
re-done.

## Constraints that emerged

- Must read as *warm / iconic / a little cool* — every calm or scenic name
  ("Toundra", "Jokul") checked out but felt flat.
- Canada-first, not Canada-only: the name should still work outside Canada.
- Exact `.app`/`.com` for any real word is gone; `.ca` as the primary is
  correct for a Canada-first product (what KOHO / Wealthsimple / banks do).
- Trademark confusion is judged by *sound*, and French/English equivalents
  count as the same mark in Canada. Spelling tricks don't help.
- Not legal advice. Before anything public: a Canadian trademark agent's
  clearance opinion (~$300–600).

## Checked

| Name | Verdict | Why |
|---|---|---|
| Loonie / Loony | ✗ | loonieapp.com is a live CA budgeting app (2021); LOONIO registered Class 36 (TMA1243870, Edmonton). "Loony" = same sound + means crazy |
| Toonie | ✗ | Tooni is a live CA Plaid-connected finance app in beta; one letter off |
| Nickel / Dime | ✗ | generic, not Canadian, crowded (Nickel = French neobank) |
| Polar / Polaire | ✗ | POLAR registered Class 36, Polar Financial Corp, Toronto |
| Hudson's Bay | ✗ | HBC marks now owned by Canadian Tire |
| Vinland | ✗✗ | ADL-listed hate symbol appropriation |
| Fundy | ~ | clean-ish; user (Ontarian) didn't recognize it |
| Tundra | ~ | clean register (Tundra Esports design mark only); all core domains taken |
| **Toundra** | ✓ | French spelling. `toundra.app` FREE. `.ca` = greenhouse co., `.com` = 1990s archery site. Felt "good not cool" |
| **Tuque** | ✓ | `tuque.app` FREE; no brand mark; warm & iconic; doesn't travel (US says "toque") |
| Landfall | ~ | `landfall.ca` FREE, `.app`/`.com` taken. Backlog |
| Nordet | ✗ | nor'easter = the bad wind; near "Nord" |
| Givre | ✗ | `givré` = crazy in French |
| Carcajou / Huard / Piasse / Macareux | ~ | carcajou.app + macareux.app free; others taken. Macareux (puffin) = mascot idea |
| Nuna / Tunturi / Vidde | ✗ | domains taken |
| Kutup (Turkish "pole") | ✓ | `.app` + `.ca` FREE; means nothing to Canadians — pure coined |
| Keewatin | ~ | `.app` free; Cree word — only with a real conversation behind it |
| Niflheim | ✗ | `.app` + `.ca` free but it's the Norse underworld |
| **Fimbul** | ? | `.ca` + `.io` free, `.app`/`.com` taken. **Register + market NOT yet checked.** User liked it most |
| Skadi | ~ | SKADI registered Class 9 (GPS software, Terrebonne QC, 2025); only `.io` free |
| **Jokul / Jökull** | ✓ | cleanest of all: no CIPO hit, no finance use, `.app` + `.ca` FREE (`.com` parked for sale). User lukewarm |
| Munin / Hugin (Odin's ravens) | ~ | best *meaning* (watches, remembers); `.app` taken |
| Penguin | ✗ | no penguins in Canada; Penguin Random House |
| Kita / Boreas / Kuzey / Dhruv / Kyoku / Polaire / Ymir / Svalbard / Nifl / piasse | ✗ | domains taken |
| Kaamos, Halla, Bruma, Buran, Gelu, Eira, Reo, Fubuki, Rera, Vordr, Skjol, Fylgia, Mundr, Gaetir | — | floated, not checked |

## Free domains as of 2026-09-04 (not purchased)

`toundra.app`, `tuque.app`, `jokul.app`, `jokul.ca`, `jokull.app`, `jokull.ca`,
`kutup.app`, `kutup.ca`, `fimbul.ca`, `fimbul.io`, `landfall.ca`,
`carcajou.app`, `macareux.app`, `keewatin.app`, `givre.app`, `givre.ca`.

## How to check a domain (the system `whois` lies)

- `.app` / `.io` / most gTLDs: `curl -sL -o /dev/null -w "%{http_code}" https://rdap.org/domain/NAME.app` → **404 = free**, 200 = taken
- `.ca`: `whois -h whois.cira.ca NAME.ca` → "Not found" = free
- `.com`: `whois -h whois.verisign-grs.com "=NAME.com"` → "No match" = free
- Register: https://ised-isde.canada.ca/cipo/trademark-search (search the word, filter Class 9 / 36 / 42)
