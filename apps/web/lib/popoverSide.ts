// Which way a menu opens from its button: down if it fits below, else toward
// whichever side has more room. `top` and `bottom` are the button's edges in
// the viewport; `topInset` is what covers the top of it (the sticky header).
export function popoverSide(button: { top: number; bottom: number }, viewportHeight: number, topInset: number, needed: number): "up" | "down" {
  const below = viewportHeight - button.bottom;
  const above = button.top - topInset;
  return below >= needed || below >= above ? "down" : "up";
}

// The same for a real button on the page.
export function popoverSideFor(el: HTMLElement, needed: number): "up" | "down" {
  const header = document.querySelector("body > header, header.sticky");
  return popoverSide(el.getBoundingClientRect(), window.innerHeight, header?.getBoundingClientRect().bottom ?? 0, needed);
}
