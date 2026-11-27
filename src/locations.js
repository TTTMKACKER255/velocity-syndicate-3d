// Stations are metres along the same physical roads used by the driving simulation.
// Pullouts sit inside the drivable shoulder, so every entrance can be reached.
export const locations = [
  {
    id: "garage",
    name: "Bayline Garage",
    short: "Garage",
    type: "Workshop",
    place: "Coastal Highway",
    icon: "garage",
    color: "#60d8c4",
    road: 0,
    start: 78,
    offset: -8.5,
    action: "Open garage",
    brief:
      "Park at the workshop to change cars, fit upgrades, or tune your paint and bodywork.",
  },
  {
    id: "home",
    name: "Promenade Home",
    short: "Home",
    type: "Home",
    place: "Promenade",
    icon: "home",
    color: "#f7c985",
    road: 9,
    start: 872,
    offset: 4.2,
    action: "Park at home",
    brief:
      "Park at home to save Promenade as the starting point for your next free-roam drive.",
  },
  {
    id: "harbour",
    name: "Harbour Yard",
    short: "Harbour",
    type: "Stunt yard",
    place: "Harbour Loop",
    icon: "anchor",
    color: "#79bfff",
    road: 2,
    start: 355,
    offset: 5,
    action: "View stunt trial",
    brief:
      "Meet the dock crew beside the containers and launch the Dockside Air stunt trial.",
  },
  {
    id: "lookout",
    name: "Canyon Overlook",
    short: "Lookout",
    type: "Scenic viewpoint",
    place: "Lookout Drive",
    icon: "mountain",
    color: "#bcabfa",
    road: 11,
    start: 228,
    offset: -3,
    action: "View the canyon",
    brief:
      "Pull over at the ridge and switch to the cinematic camera for a view across the canyon.",
  },
  {
    id: "festival",
    name: "Festival Plaza",
    short: "Festival",
    type: "Race meet",
    place: "Festival Avenue",
    icon: "flag",
    color: "#ff945d",
    road: 5,
    start: 345,
    offset: 5,
    action: "Open event board",
    brief:
      "Find the local street-racing meet and choose your next district contract.",
  },
].map((location) => ({ ...location, landmark: true }));
export function markerPoint(item, routePoint, lengths) {
  const p = routePoint(
    item.road,
    item.start ?? item.startRatio * lengths[item.road],
  );
  const offset = item.offset || 0;
  return {
    ...p,
    x: p.x + Math.cos(p.heading) * offset,
    z: p.z - Math.sin(p.heading) * offset,
    id: item.id,
    name: item.name,
    icon: item.icon,
    color: item.color || "#ff9851",
  };
}
