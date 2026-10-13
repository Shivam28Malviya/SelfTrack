# Portfolio

A standalone, single-page portfolio (plain HTML/CSS/JS, no build step).
It is independent of the SelfTrack app.

- `index.html` – the whole site
- `photo.jpg` – portrait used in the hero and the ID badge

## Edit content
Skills, engagements and awards are arrays near the bottom of `index.html`
(`skills`, `work`, and the awards list). Experience and quick facts are plain HTML.

## Swap in an animated 3D avatar
Generate a short looping clip of your 3D character, save it as `avatar.mp4`
next to `index.html`, and replace the hero `<img>` with:

    <video src="avatar.mp4" autoplay muted loop playsinline></video>

## Deploy
Drag this folder into https://app.netlify.com/drop, or create a new Vercel
project with **Root Directory** set to `portfolio` and no build command.
