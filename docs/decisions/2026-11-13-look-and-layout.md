# Look and layout (2026-11-13)

The product owner's direction for the one screen. It refines the shell-and-offline spec. A tired person at 9 pm must understand the screen without reading instructions; a judge must get a result in ten seconds.

## The idea the layout carries

The journey runs left to right, and the line between "this device" and "the cloud" is drawn on the screen.

| Zone | Title | What is in it |
|---|---|---|
| 1, left, widest | Your note | the rough note (typed or a photo), then the record with its tags. Everything here stays on this device, and a short line under the title says so |
| boundary | a vertical rule | labelled "this device" on its left and "the cloud" on its right, at the top |
| 2, middle, narrow | What leaves | the exact outgoing text in a monospace face on slightly darker paper with a dashed border, the send notice, the Send control, and the egress check line fixed at the bottom of the zone |
| 3, right | Finished note | the formal note as a document sheet: serif face, soft shadow, names restored, the source label, Copy |

Below 1200 px the zones stack in the same order and the boundary becomes a horizontal labelled rule.

## Status bar

Left: the name and one line, "A writing aid with an egress check." Right: three states, each an icon with words, never colour alone: Network (online, offline) · Device model (ready, downloading with a percentage, not on this computer) · Cloud (connected, not connected).

## Paper, ink, one accent

- Paper `#FAF8F3`; darker paper for zone 2 `#F1EEE6`; ink `#1C1B19`; second ink `#5E5A52`; hairline `#D9D4C7`.
- One accent, deep green `#1E6B52`: primary control, focus ring, listed-name chips.
- The failure colour `#B3261E` appears only on a failing egress line and on errors, always with words and an icon.
- Check every text and background pair for a contrast ratio of at least 4.5 to 1 in a test.

## Type

System faces only, so no font files are bundled: a sans stack for the interface, a serif stack for the finished note, a monospace stack for the outgoing text. Base size 18 px, note text 20 px, line height 1.5. No text under 16 px.

## Parts

- **Chips.** A masked value is a chip showing its tag, for example `[Person 1]`. A listed name found by matching has a solid outline and a light accent fill. A value proposed by the device model has a dashed outline until she accepts it. A tap or the Enter key toggles a chip; the change is announced to assistive technology.
- **Source label.** Top right of every result: "on this device" is an outlined pill with a laptop outline; "in the cloud" is a filled pill with a cloud outline. The shapes differ, not only the fill.
- **Egress check line.** One large sentence with an icon. Pass: a check mark and the counts. Fail: a crossed octagon, the failure colour, the words "Found" and what was found, and what to do next.
- **Controls.** Drawn buttons, 48 px high, 1.5 px ink border, 10 px radius; the primary one is filled with the accent. Focus ring 3 px accent, 2 px away from the control. Targets at least 44 px.
- **Icons.** A small set of drawn inline SVGs, one stroke weight: laptop, cloud, arrow crossing a line, check, crossed octagon, pencil, camera, eye. No padlock and no shield: they would say "safe".
- **Motion.** Fades of at most 120 ms. None when reduced motion is asked for.

## First run and the ten-second path

The page opens on the tool. No hero, no marketing header, no illustration.

The empty state of zone 1 has one secondary control, "Try an invented visit". It fills an invented rough note and an invented client list of 12 names, marked "invented example" until cleared. From there every step works with one press each.

With no device model: one line in zone 1 says what the device model would add and that it is not on this computer; hand entry of the record, exact matching, cloud drafting and the egress check all still work.

## Never

Emoji, stock art, gradients, dark theme, a second accent, text in images, the words safe, private by design, anonymised, guaranteed, cleared.
