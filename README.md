# Aryan Saxena: portfolio

A static site (HTML, CSS, JS) with no build step. The whole site can be controlled with hand gestures through MediaPipe running in the browser.

```bash
python -m http.server 5500
```

Gesture control needs camera access, which browsers only allow on `localhost` or HTTPS, so it won't work if you open the file directly.

## Before publishing
- Add a photo at `assets/photo.jpg` (portrait, about 4:5). Until then an "AS" monogram shows.
- Read the project write-ups and rewrite anything that doesn't sound like you.

## Where to edit things (`script.js`)
- `IRA`: the requests and results in the IRA walkthrough
- `SKILLS` / `MINE` / `PRESETS`: the resume matcher
- `SMALLER`: the "Smaller things" cards
- `GROUPS`: the toolbox chips
- `STOPS`: the "How I got here" timeline

## Deploy (GitHub Pages)
Push to a repo named `aryansaxena04.github.io`, then Settings → Pages → deploy from `main`, root folder.

## Puzzle
The HTML comment at the top of `index.html` is base64 for `flag{h1r3_4ry4n_2027}`.
