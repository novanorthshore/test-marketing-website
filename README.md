# Nova North Shore Website

Static website for Nova North Shore. Built with plain HTML, CSS, and JavaScript so it can be hosted on Netlify without a build step.

## Files

- `index.html` - Main website page.
- `current-event.html` - Current event page with poster and Google Maps button.
- `thank-you.html` - Netlify form success page.
- `styles.css` - Site styling and responsive layout.
- `script.js` - Header behavior, mobile menu, reveal animations, and image lightbox.
- `assets/` - Images, video, logos, event posters, and favicon.

## Netlify Deploy

No build command is required.

If deploying through Netlify:

- Build command: leave blank
- Publish directory: `.`

The contact form uses Netlify Forms. In Netlify, set the form notification email to:

```bash
info@novanorthshore.com
```

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
