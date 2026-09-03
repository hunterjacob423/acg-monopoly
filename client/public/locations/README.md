# Tile pictures

Put the photos for the board squares in this folder, then name them in
`src/shared/locations.ts`:

```ts
16: { name: "Sports Hall", image: "sports-hall.jpg" },
```

The folder is added for you — write just the filename, not a path.

## What works well

| | |
| --- | --- |
| Shape | Landscape. The tile crops to a wide strip, so a portrait photo loses its top and bottom |
| Size | Around 600×400 is plenty — the tiles are small, and a 4000px photo is only slower |
| Weight | Under ~200 kB each. All 40 at 2 MB each is an 80 MB page load |
| Format | `.jpg` for photos, `.png` for logos or anything containing text, `.webp` if you want both |

Resize a photo without extra software:

```bash
sips -Z 800 photo.jpg --out client/public/locations/sports-hall.jpg
```

(`sips` is built into macOS. On Linux use `convert photo.jpg -resize 800x sports-hall.jpg`.)

## Notes

- A missing or misspelt filename shows a plain tile with just the name — never a
  broken-image icon. So you can rename all 40 squares now and add photos later.
- Filenames are case-sensitive once the game is on a server, even though macOS
  will forgive you locally. Lowercase with hyphens avoids the whole problem.
- These files are copied into the build as-is. Anyone who can open the game can
  open the pictures directly, so don't put anything here you would not put on a
  public website — photographs of identifiable students especially.
