// Every window faces a real room between two floor plates. Full-height piers
// and the offset service core leave clear sight lines across both axes.
const palettes = {
  glass: {
    pier: 0x728a91,
    edge: 0xa9b5b4,
    glass: 0x86b8ca,
    pitch: 4.05,
    width: 0.24,
    band: 0.3,
  },
  brick: {
    pier: 0x976954,
    edge: 0xb4937c,
    glass: 0xa6bbb5,
    pitch: 3.65,
    width: 0.94,
    band: 0.72,
  },
  residence: {
    pier: 0xc5baa6,
    edge: 0xe2d7c6,
    glass: 0xa8c5be,
    pitch: 3.2,
    width: 0.43,
    band: 0.48,
  },
  limestone: {
    pier: 0xc1b5a0,
    edge: 0xd8cdb9,
    glass: 0x91b2bb,
    pitch: 3.8,
    width: 0.82,
    band: 0.62,
  },
};
export function upperStoreys({ x, y, z, w, d, h, style, seed }) {
  const palette = palettes[style];
  const levels = Math.max(1, Math.round(h / palette.pitch));
  const pitch = h / levels;
  const props = [],
    people = [];
  function add(type, dx, dy, dz, sw, sh, sd, c, range = 900) {
    props.push({
      type,
      x: x + dx,
      y: y + dy,
      z: z + dz,
      w: sw,
      h: sh,
      d: sd,
      c,
      range,
    });
  }
  const box = (...args) => add("block", ...args);
  const side = seed % 2 === 0 ? 1 : -1;
  box(-w * 0.3, h / 2, -d * 0.24 * side, w * 0.16, h, d * 0.17, 0x8a8176);
  for (const outward of [-1, 1]) {
    for (const alongX of [false, true]) {
      const span = alongX ? w : d,
        bays = Math.max(2, Math.round(span / (style === "glass" ? 3.5 : 4.3)));
      const face = (alongX ? d : w) * 0.5 * outward;
      for (let i = 0; i <= bays; i++) {
        const offset = (i / bays - 0.5) * (span - palette.width);
        const width =
          i === 0 || i === bays ? Math.max(0.45, palette.width) : palette.width;
        box(
          alongX ? offset : face,
          h / 2,
          alongX ? face : offset,
          alongX ? width : 0.36,
          h,
          alongX ? 0.36 : width,
          palette.pier,
        );
      }
    }
  }
  for (let floor = 0; floor < levels; floor++) {
    const base = floor * pitch,
      band = Math.min(palette.band, pitch * 0.22);
    const slabOverhang = style === "residence" ? 0.8 : 0.18;
    box(
      0,
      base + band / 2,
      0,
      w + slabOverhang,
      band,
      d + slabOverhang,
      palette.edge,
    );
    const clear = pitch - band,
      center = base + band + clear * 0.5;
    for (const side of [-1, 1]) {
      add(
        "pane",
        side * (w * 0.5 - 0.18),
        center,
        0,
        0,
        clear,
        d - 0.36,
        palette.glass,
      );
      add(
        "pane",
        0,
        center,
        side * (d * 0.5 - 0.18),
        w - 0.36,
        clear,
        0,
        palette.glass,
      );
    }
    // A partly enclosed perimeter bay makes the office wings read as occupied
    // buildings. Both central window axes and the diagonal corner view stay open.
    const bayWidth = w * (style === "glass" ? 0.15 : 0.22),
      bayX = -w * 0.33;
    const panelHeight = clear * (style === "glass" ? 0.51 : 0.86);
    box(
      bayX,
      base + band + panelHeight * 0.5,
      side * (d * 0.5 - 0.28),
      bayWidth,
      panelHeight,
      0.22,
      palette.pier,
    );
    if (style === "brick" || style === "limestone")
      box(
        bayX,
        base + band + panelHeight,
        side * (d * 0.5 - 0.22),
        bayWidth + 0.22,
        0.14,
        0.4,
        palette.edge,
      );
    // Vary the occupied bays. Desks, task lights and shades stay to the sides
    // of the floor instead of forming a painted or opaque rear elevation.
    const corner = (seed + floor) % 2 ? 1 : -1,
      deskX = corner * w * 0.29,
      deskZ = d * 0.27;
    box(deskX, base + band + 0.68, deskZ, 2.7, 0.18, 1.15, 0xa8967d, 145);
    box(deskX, base + band + 0.32, deskZ, 1.8, 0.62, 0.55, 0x605c55, 110);
    if ((seed + floor) % 3 !== 1)
      add(
        "light",
        deskX,
        base + pitch - 0.15,
        deskZ,
        3.15,
        0.075,
        0.36,
        0xffdda2,
        250,
      );
    if ((seed + floor) % 4 === 0)
      box(
        corner * w * 0.24,
        base + pitch - clear * 0.14,
        -d * 0.5 + 0.32,
        w * 0.31,
        clear * 0.27,
        0.085,
        0xb1aa94,
        230,
      );
  }
  return {
    x,
    y,
    z,
    w,
    d,
    h,
    levels,
    style,
    kind: "storeys",
    seed,
    props,
    people,
  };
}
