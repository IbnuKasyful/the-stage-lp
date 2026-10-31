# The Stage – Landing Page · The Family Village

Landing page for **The Stage**, The Family Village's 8-week drama, speech & public speaking program for kids aged 5–12 in Johor Bahru.

**Live:** https://stage.familyvillage.pages.dev

## What's inside

```
the-stage-lp/        Static site (deployed to Cloudflare Pages)
  index.html         Page markup
  styles.css         Brand styles (Floral White, Golden Apricot, Palm Leaf, #292822)
  script.js          Interactions + form handling (CONFIG at the top)
  _headers           Cloudflare Pages headers (caching, security)
  assets/            Optimised images & short video clips
apps-script/
  Code.gs            Google Apps Script: forms -> Google Sheets + auto-reply emails
  README.md          Step-by-step setup (Indonesian)
```

## Forms

| Form | Sheet tab | Auto email |
|---|---|---|
| Book a Trial Class (RM55) | `Trial Bookings` | Booking confirmation + WhatsApp Community link |
| Confident Kid Playbook (lead magnet) | `Playbook Leads` | Playbook PDF attachment + WhatsApp Community link |

The page posts both forms to the Apps Script Web App set in `CONFIG.FORM_ENDPOINT` (`the-stage-lp/script.js`). See [`apps-script/README.md`](apps-script/README.md) for setup, and for adding the playbook PDF later via Script Properties (no redeploy needed).

## Deploy (Cloudflare Pages, Git integration)

- Framework preset: **None**
- Build command: *(empty)*
- Build output directory: **`the-stage-lp`**
- Production branch: `main`; the `stage` branch is served at `stage.<project>.pages.dev`

## To do before launch

- Replace the dummy WhatsApp Community link in `the-stage-lp/script.js` **and** `apps-script/Code.gs` (`WA_COMMUNITY_URL`).
- Add the Confident Kid Playbook PDF (Script Property `PLAYBOOK_PDF`).
- Add more parent testimonials from Google Reviews (see comment in `index.html`).
