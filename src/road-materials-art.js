export const aggregateMetres = 3.2;
export const roadArt = {
  roadChip: [
    new URL("../assets/road-chip-seal.webp", import.meta.url),
    aggregateMetres,
    aggregateMetres,
  ],
  roadNormal: [
    new URL("../assets/road-aggregate-normal.webp", import.meta.url),
    aggregateMetres,
    aggregateMetres,
  ],
  roadRoughness: [
    new URL("../assets/road-binder-roughness.webp", import.meta.url),
    aggregateMetres,
    aggregateMetres,
  ],
  roadIvory: [
    new URL("../assets/road-paint-ivory.webp", import.meta.url),
    0.16,
    1.15,
  ],
  roadOchre: [
    new URL("../assets/road-paint-ochre.webp", import.meta.url),
    0.16,
    1.15,
  ],
  roadWorks: [new URL("../assets/road-works.webp", import.meta.url), 1, 1],
};
