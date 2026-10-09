# GuarDog legal pages — instructions for Codex

Two draft pages are attached: `guardog-terms.html` and `guardog-privacy.html`.
They are **content drafts** written by Claude. Please implement them into the
VitaLink site (`C:\VitaLink Site`, repo `ehevelone/vitalink`, deploys to
myvitalink.app).

## What to do
1. **Restyle** both pages to match the site template (shared header/footer,
   `audience-pages.css` or whatever the standard GuarDog/marketing pages use).
   Keep all the text content and headings intact — only the styling/layout
   should change.
2. **Deploy at these paths** (they are already cross-linked assuming this):
   - `myvitalink.app/guardog-terms.html`
   - `myvitalink.app/guardog-privacy.html`
3. **guardog.html (the sales page)** should link to both in its footer:
   "Terms of Use" → guardog-terms.html, "Privacy Policy" → guardog-privacy.html.
4. **Fix the bounced email sitewide.** `support@myvitalink.app` bounces. Replace
   it with `myvitalink@outlook.com` everywhere it appears (notably
   `delete-account.html`). The two GuarDog drafts already use the Outlook address.
5. **Fill in every `[BRACKET]` placeholder** — do NOT invent these; get them from
   Eric:
   - `[LEGAL ENTITY NAME]` — the legal company/owner name
   - `[EFFECTIVE DATE]` — the date you publish
   - `[STATE]`, `[COUNTY/STATE]` — governing-law location
   - In privacy, confirm the public **account-deletion URL** to list.

## Google Play compliance (required before submission)
- **In-app privacy link:** Google requires the Privacy Policy to be linked
  INSIDE the app, not only in the Play listing. Please add a "Privacy Policy"
  (and "Terms of Use") link on the GuarDog Account screen (and ideally the
  sign-in screen) pointing to the deployed URLs. This is an app change in
  `C:\AI Relay\scan-safe` — Claude left it to you since you own the app styling
  and just restyled those screens; keep it in the new theme.
- **External deletion path:** handled — the account-deletion page (served by the
  Worker at /account-deletion) and the privacy policy now include a
  `mailto:myvitalink@outlook.com` deletion-request method with instructions.
- **Backend deletion:** updated (2026-10-03) so account deletion now also removes
  the free-access grant tied to the number, the user's membership in any family
  plan, and the members under a plan they bought. Worker needs redeploy for this
  to go live.

## Still needed from Eric (placeholders in both pages)
- `[LEGAL ENTITY NAME]`, `[EFFECTIVE DATE]`, `[STATE]`, `[COUNTY/STATE]`.

## Important
- **These are drafts and must be reviewed by a lawyer before launch.** Do not
  present them as final legal advice.
- **Keep the "no scan catches every threat / no guarantee of safety" wording**
  in the Terms — it is the core liability protection and was requested
  specifically. Don't soften or remove it.
- The privacy data statements were written to match how the app actually works
  (phone-number sign-in; scanned links not stored in readable form; scan history
  stored only on the device; final URL sent to Google Web Risk; subscriptions via
  Google Play). If you change app behavior, update the policy to match.
- The **Privacy Policy URL is required by Google Play Console** — guardog-privacy.html
  will be entered there at submission.
