# Codex brief — restyle the GuarDog website to match the app

Site repo: this repo (ehevelone/vitalink), deploys to myvitalink.app. GuarDog pages: `/guardog/` (sales), `/guardog/privacy`, `/guardog/terms`, `/guardog/delete-account`.

## Goal
Make the GuarDog web pages look like the APP — same visual language, so the site and app feel like one product.

- **Match the app's theme.** App theme is in the app repo at `C:\AI Relay\scan-safe\lib\src\guarddog_theme.dart`. Brand colors:
  - Navy background `#071522`
  - Gold accent `#ffc94a`
  - Light text `#d8e7f2`, muted `#a9bbc8`
  - Verdict colors: green `#47d17b`, amber `#ffc94a`, red `#ff5d62`
- **Same buttons** (shape, fill, gold accent), **same dark navy backgrounds**, **same imagery** (the VLGD shield / bulldog, the "Scan" shield). Reuse the app's icon/logo art for consistency.
- **Same feel/typography** as the in-app screens (the home, scan report, verdict screens).
- Keep all existing page CONTENT (sales copy, Terms, Privacy, delete-account) — only change the styling/layout to match the app. Keep it responsive/mobile-friendly.

## "Get Launch Updates" → newsletter signup
- Repurpose that button into a **newsletter signup** ("Get the GuarDog Monthly" / "Join the pack"). Don't just delete it.
- Wire the email capture to **Resend** (already set up for VitaLink — reuse it). Create/point to a **GuarDog audience** in Resend and add each submitted email as a contact. Confirm the sender domain is a verified VitaLink/Resend domain.
- Add a short line to `/guardog/privacy` disclosing email collection for the newsletter (contact: myvitalink@outlook.com).
- The monthly send itself is handled separately (stats + scam roundup, drafted then sent via Resend) — just build the signup → Resend-audience capture here.

## Notes
- Contact email across the site: `myvitalink@outlook.com` (support@myvitalink.app bounces — replace anywhere it still appears).
- Legal page drafts/finals are in this same `guardog-drafts/` folder for reference.
