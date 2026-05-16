# Nova North Shore Website

Static website for Nova North Shore. Built with plain HTML, CSS, and JavaScript so it can be hosted on Netlify without a build step.

## Files

- `index.html` - Main website page.
- `current-event.html` - Current free RSVP event page with poster, Google Maps button, and Netlify RSVP form.
- `cypress-event.html` - Paid event RSVP page with poster, Google Maps button, and Stripe Checkout form.
- `thank-you.html` - Netlify form success page.
- `styles.css` - Site styling and responsive layout.
- `script.js` - Header behavior, mobile menu, reveal animations, and image lightbox.
- `assets/` - Images, video, logos, event posters, and favicon.

## Netlify Deploy

No build command is required.

If deploying through Netlify:

- Build command: leave blank
- Publish directory: `.`
- Functions directory: `netlify/functions`

The contact form and non-paid RSVP forms use Netlify Forms. In Netlify, set the form notification email to:

```bash
info@novanorthshore.com
```

The Cypress paid RSVP does not submit to Netlify Forms directly; it uses Stripe Checkout and the
Stripe webhook writes confirmed payments to Google Sheets. If a remaining free form submit shows
`Method Not Allowed`, check Netlify > Forms > Usage and configuration > Form detection and make
sure form detection is enabled, then redeploy the site.

## Paid Cypress RSVP

`cypress-event.html` uses Stripe Checkout instead of direct Netlify Forms. The RSVP is only saved
after Stripe confirms successful payment through the webhook.

The paid event capacity is shared across both Stripe prices. The checkout function reads the
confirmed paid row count from Google Sheets and stops creating Checkout Sessions once the event
reaches 120 confirmed paid RSVPs. Stripe collects payment; Google Sheets is the shared stock tracker.

Install dependencies before local function testing:

```bash
npm install
```

Run the site and Netlify Functions locally:

```bash
npm run dev
```

This expects the Netlify CLI to be installed. If it is not installed, run:

```bash
npx netlify-cli dev
```

Required Netlify environment variables:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STANDARD_PRICE_ID=
STRIPE_PHOTOGRAPHY_PRICE_ID=
SITE_URL=
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEET_TAB=Confirmed RSVPs
```

Use `.env.example` as the local development template. Do not commit a real `.env` file.

Stripe setup:

- Create one-time CAD prices for `$10` standard RSVP and `$30` RSVP with professional photography.
- Add the live/test price IDs to Netlify.
- Configure the webhook endpoint:

```text
https://YOUR-SITE.netlify.app/.netlify/functions/stripe-webhook
```

- Subscribe the webhook to `checkout.session.completed`.

Google Sheets setup:

- Create a Google Cloud service account and enable the Google Sheets API.
- Share the RSVP sheet with the service account email.
- Make sure the sheet tab exists. Default tab name: `Confirmed RSVPs`.
- The function will add headers if the first row is empty.
- The paid RSVP sheet includes license plate as a required check-in field.

Confirmation emails:

- Custom confirmation emails are not sent by this site.
- If attendee payment receipts are needed, enable Stripe receipt emails in Stripe.
- The Google Sheet is the confirmed RSVP/check-in source of truth.

Local Stripe webhook testing:

```bash
stripe listen --forward-to localhost:8888/.netlify/functions/stripe-webhook
```

Use the webhook signing secret printed by the Stripe CLI as `STRIPE_WEBHOOK_SECRET` while testing.

## Git Workflow

Use these commands when saving and publishing changes.

### 1. Pull Latest Changes

Run this before editing if the project is connected to GitHub and more than one machine/person may update it.

```bash
git pull
```

What it does: downloads the latest changes from GitHub and applies them to your local project.

### 2. Check Changed Files

```bash
git status
```

What it does: shows which files have been changed, added, or deleted.

### 3. Add Files To The Commit

Add everything that changed:

```bash
git add .
```

What it does: stages all changed files so they will be included in the next commit.

Or add one specific file:

```bash
git add index.html
```

What it does: stages only that file.

### 4. Commit Changes

```bash
git commit -m "Update website content"
```

What it does: saves a snapshot of the staged changes with a short message describing the update.

Use a message that explains what changed, for example:

```bash
git commit -m "Add current event page"
```

### 5. Push To GitHub

```bash
git push
```

What it does: uploads your committed changes to GitHub.

If Netlify is connected to the GitHub repo, pushing to GitHub will trigger a new Netlify deploy automatically.

## Typical Update Flow

```bash
git pull
git status
git add .
git commit -m "Describe the update"
git push
```
