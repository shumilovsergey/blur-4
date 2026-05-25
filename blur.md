# Blur Background Recipe

## HTML

```html
<div id="scene">
  <div id="bg"></div>
  <div id="content">your content</div>
</div>
```

## CSS

```css
#scene {
  position: relative;
  overflow: hidden;
  background: #000;
}

#bg {
  position: absolute;
  inset: -10%;
  background-image: url('background.jpg');
  background-size: cover;
  background-position: center;
  filter: blur(40px) brightness(0.9);
  transform: scale(1.1);
}

#content {
  position: relative;
  z-index: 1;
}
```

## Why each line

- `inset: -10%` — the div overflows its parent so blurred edges stay hidden
- `transform: scale(1.1)` — extra margin against edge bleed
- `overflow: hidden` on parent — clips the oversized div
- `background: #000` on parent — fallback color when no image is set

## Swap the image from JS

```js
document.getElementById('bg').style.backgroundImage = "url('background.jpg')";
```

To clear it (show plain dark background):

```js
document.getElementById('bg').style.backgroundImage = '';
```
