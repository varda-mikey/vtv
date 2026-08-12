# VARDA TV Display System

A lightweight digital-signage controller designed for smart-TV browsers.

## What it does

- One secure admin page controls every TV.
- Each TV is assigned a short Screen ID: `1`, `2`, `main`, `cafe`, etc.
- Admin pastes a menu/image/video/webpage URL into a screen.
- TVs update in realtime without retyping the URL.
- TV browser can use `/#1`, `?id=1`, or a pathname such as `/1` (via the included 404 fallback).
- The TV keeps the last known assignment in local browser cache if the realtime connection briefly drops.

## Recommended URLs

With a custom domain:

- Admin: `https://tv.yourdomain.com/admin.html`
- TV 1: `https://tv.yourdomain.com/#1`
- TV 2: `https://tv.yourdomain.com/#2`
- Main Canteen: `https://tv.yourdomain.com/#main`

Without a custom domain, use the GitHub Pages address, for example:

- `https://YOUR_GITHUB.github.io/vtv/#1`

A very short repository name such as `vtv` keeps the default GitHub URL shorter.

## Setup — Firebase (about 5 minutes)

1. Create a Firebase project.
2. Add a Web App.
3. Enable **Realtime Database**.
4. Enable **Authentication > Email/Password**.
5. Create one admin user in Authentication.
6. Open `firebase-config.js` and paste the Web App config values.
7. In Realtime Database > Rules, paste the contents of `database.rules.json` and publish.

The rules make TV data publicly readable while only signed-in admins can change it.

## Setup — GitHub Pages

1. Create a repository, ideally named `vtv`.
2. Upload all files in this folder to the repository root.
3. Go to **Settings > Pages**.
4. Publish from your main branch/root (or use a Pages deployment workflow).
5. Open the generated Pages URL and test `/#1`.

## Optional — short custom domain

Use a subdomain such as `tv.yourdomain.com` and connect it in GitHub Pages **Settings > Pages > Custom domain**. Configure the required DNS record with your domain provider.

Then the only address staff needs to type is something like:

`tv.yourdomain.com/#1`

## TV browser notes

- Set browser zoom to 100%.
- Use fullscreen/kiosk mode when available.
- Disable sleep/screensaver on the TV/device.
- If a third-party webpage refuses to load inside an iframe, use a direct image/video/PDF URL or a page that permits embedding.

## Files

- `admin.html` — admin control panel
- `index.html` / `tv.html` — TV player
- `404.html` — fallback player for direct short paths
- `admin.js`, `tv.js` — app logic
- `firebase-config.js` — your Firebase connection values
- `database.rules.json` — recommended database security rules
