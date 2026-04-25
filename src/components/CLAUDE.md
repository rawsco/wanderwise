## CSS — strikethrough thickness

`text-decoration-thickness` above ~2px silently disappears in Chrome/Safari — the line renders at 2px or not at all, no matter how much `!important` or `text-decoration-skip-ink: none` you throw at it.

If you need a visible strike — e.g. to mark blocked dates in `src/components/ui/date-picker.tsx` — draw it as a pseudo-element bar, not `text-decoration`:

```css
.target { position: relative; }
.target::after {
  content: "";
  position: absolute;
  left: 12%; right: 12%;
  top: 50%;
  height: 3px;
  background-color: #dc2626;
  transform: translateY(-50%);
  pointer-events: none;
}
```

This gives full control over length, thickness, and color independent of font metrics.
