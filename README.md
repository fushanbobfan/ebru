# ebru

Paper marbling in the browser. Float drops of ink on a bath, pull a
stylus or a comb through them, swirl them, and save the print.

**Live demo:** https://fushanbobfan.github.io/ebru/

Every stroke moves the ink with an exact map that keeps area, the way the
thin film of paint on a real size bath behaves, so no colour ever grows or
shrinks however much it is stretched. The picture is drawn by running each
stroke backwards from every pixel, so it stays sharp at any print size.

No build step and no dependencies. The ink maps, the renderer, the
patterns, the gestures and the share links are plain ES modules covered by
a Node test suite; only `src/main.js` touches the DOM.

## Quick start

Open `index.html` through any static server, or run:

```bash
npm run serve
# then visit http://localhost:8080
```

Run the tests with `npm test` (Node 20 or newer).

## Things to try

**Drop into a stone pattern.** Pick *Battal (stones)*, choose an ink and
click into the middle of a large stone. The new drop pushes the old ink
aside into a thin ring around it instead of covering it.

**Comb back and forth.** Start from a clean bath, scatter a few dozen
drops, then use the comb: drag down once, then drag up once starting
halfway between two of the first strokes. That is gelgit, the
come-and-go pattern.

**Hearts.** The *Hearts* pattern lays rows of targets and pulls one
stylus through each row. Pull another stylus down through a column of
hearts and every one of them bends the same way.

**Spiral.** Press in the middle of a target, move out to the rings and
circle round. The swirl turns the ink along each circle, strongest on the
circle you drew.

**Waves.** Drag the wave tool across a combed pattern. The drag sets the
direction and the length of one wave; the slider sets its height.

## Tools

| Tool | Gesture | What it does |
| --- | --- | --- |
| Drop | click, or drag to size | Floats a disc of ink. Old ink at distance d from the centre moves out to √(d² + r²). |
| Stylus | drag | One tine. Ink under the tine moves the full length of the drag, and ink beside it moves less, halving every *reach* units. |
| Comb | drag | Evenly spaced tines across the whole tray, through the point where the drag starts. |
| Swirl | press at the centre, move out, circle round | Ink on each circle around the centre turns along it, by the swept arc on the circle you drew and less away from it. |
| Wave | drag | Bends the bath sideways in a sine wave along the drag. |

The share link (*Copy link*) holds the starting pattern, its seed, the
palette and every stroke added by hand. *Save PNG* prints the tray at
1000, 2000 or 3000 pixels; the smallest size is supersampled.

### Keyboard

With the tray focused, arrow keys move a cursor (`Shift` for bigger
steps) and `Enter` uses the current tool there, stroking in the
direction set by the *Keyboard stroke direction* slider. `1`–`5` pick a
tool, `[` and `]` change the drop size, `,` and `.` turn the stroke
direction, `C` picks the next ink, `Z` undoes and `Y` redoes.

## How it works

Drops and straight tines follow Aubrey Jaffer's
[mathematical marbling](https://people.csail.mit.edu/jaffer/Marbling/).
A drop of radius *r* at *C* moves older ink at *P* to

    C + (P − C) · √(1 + r² / |P − C|²)

and a tine through *B* along unit direction *M* moves it to
*P + z · u^d · M*, where *d* is the distance of *P* from the tine and
0 < *u* < 1. Here *u* is written as 2^(−1/reach), so the stroke halves
every *reach* units; a comb sums the strokes of its tines. A swirl turns
each circle around its centre rigidly, by an arc that fades the same way
with distance from the drawn circle, and a wave slides each line across
its direction by a sine of the position along it.

Each of these keeps area: the drop map sends the disc of radius *d* to
the disc of radius √(d² + r²), leaving exactly πr² for the new ink, and
the others are shears or rigid turns of circles. Each also has a closed
form inverse. To draw the tray, every pixel is traced back through the
inverses from the newest stroke to the oldest; the first drop that
covers the traced point gives the pixel its colour, and a point that
falls through every drop shows the bath.

The tests check that every map undoes exactly, that its Jacobian
determinant is 1 across the tray, and that each drop's share of the
rendered tray still matches πr² after rakes, swirls and waves.

## Accessibility

The tray is focusable and every tool works from the keyboard. Controls
are native form elements with labels, the status line announces the
number of drops and strokes, and the page follows the system light or
dark scheme. Nothing moves on its own.

## License

MIT
