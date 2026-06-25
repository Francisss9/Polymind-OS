# Adding your custom image to the login panel

The right panel of the login screen has a placeholder that seamlessly blends any image into the dark background.

## Option A — Edit app.js (easiest, base64 embeds the image)

1. Convert your image to base64:
   - Online tool: https://www.base64-image.de/
   - Or in terminal: `base64 -i your-image.jpg`

2. Open `renderer/js/app.js` and add this near the top of `init()`:

```js
// Inside init(), after bindEvents():
const artBg = document.getElementById('gate-art-bg');
artBg.style.backgroundImage = `url('data:image/jpeg;base64,YOUR_BASE64_STRING_HERE')`;
```

## Option B — Copy image file to assets (simpler for large images)

1. Copy your image into `renderer/assets/`, e.g. `renderer/assets/login-bg.jpg`

2. Open `renderer/js/app.js` and add inside `init()`:

```js
const artBg = document.getElementById('gate-art-bg');
artBg.style.backgroundImage = `url('../assets/login-bg.jpg')`;
```

## The blend effect

The CSS `mask-image` gradient on `.gate-art-bg` makes the image fade from transparent on the left edge to fully visible on the right, so it seamlessly merges with the dark login form panel — no hard border.

You can tweak the blend in `app.css`:
```css
.gate-art-bg {
  mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 20%, black 60%);
}
```
Increase the first `%` value for a more gradual fade, decrease for a sharper one.
