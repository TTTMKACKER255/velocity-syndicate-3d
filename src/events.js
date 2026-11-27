export const events = [
  {
    id: "coast",
    name: "Coastal Rush",
    type: "Time attack",
    place: "Coastal Highway",
    image: "coastal",
    color: "#ff782d",
    icon: "timer",
    road: 0,
    start: 115,
    interval: 150,
    count: 6,
    limit: 75,
    reward: 3400,
    rep: 85,
    chapter: 1,
    brief:
      "Beat the clock through six coastal checkpoints. The syndicate is watching the highway cameras.",
    dispatch:
      "Rookie, take the ocean road. Six gates. Show them whose coast this is.",
  },
  {
    id: "city",
    name: "Neon Pursuit",
    type: "Heist & escape",
    place: "Downtown District",
    image: "downtown",
    color: "#b296ff",
    icon: "siren",
    road: 12,
    start: 15,
    interval: 135,
    count: 7,
    limit: 90,
    reward: 4600,
    rep: 120,
    chapter: 2,
    brief:
      "Deliver the prototype before the syndicate interceptors box you in. Keep moving to shake their pursuit.",
    dispatch:
      "Prototype is live. The interceptors have your signal. Get it to the drop.",
  },
  {
    id: "canyon",
    name: "Canyon Duel",
    type: "Rival showdown",
    place: "Canyon Pass",
    image: "canyon",
    color: "#3dd6bf",
    icon: "flag",
    road: 1,
    start: 55,
    interval: 140,
    count: 7,
    limit: 105,
    reward: 6500,
    rep: 180,
    chapter: 3,
    brief:
      "Race Vale, head of the syndicate, through seven mountain gates. Beat him to the last gate. Clear all three story contracts to claim his hypercar.",
    dispatch:
      "Vale has come out of hiding. Take his title, and the bay belongs to the drivers.",
  },
];
export const stuntEvent = {
  id: "stunt",
  name: "Dockside Air",
  type: "Stunt trial",
  place: "Harbour",
  icon: "bolt",
  road: 2,
  start: 60,
  interval: 95,
  count: 3,
  limit: 85,
  reward: 2800,
  rep: 75,
  brief:
    "Earn 160 stunt points before the timer expires. Hold the handbrake and steer to drift, or launch from a ramp.",
  dispatch: "The dock crew wants a show. Link drifts or take to the air.",
};
export const speedEvent = {
  id: "speed",
  name: "Terminal Velocity",
  type: "Speed trap",
  place: "Coastal Highway",
  icon: "gauge",
  color: "#edbc59",
  road: 0,
  start: 10,
  interval: 465,
  count: 1,
  limit: 55,
  reward: 3100,
  rep: 65,
  brief:
    "Cross the coastal speed camera at 220 km/h or more. Save a full tank of nitro for the final straight.",
  dispatch: "Speed camera ahead. We need a clean pass at two-twenty.",
};
export const smashEvent = {
  id: "glass",
  name: "Glass Run",
  type: "Smash trial",
  place: "Aurelia Harbour",
  icon: "layers",
  color: "#70bece",
  road: 2,
  start: 170,
  interval: 0,
  count: 2,
  limit: 75,
  reward: 2600,
  rep: 60,
  boards: ["2/231", "2/548"],
  brief:
    "Break both marked glass boards in the harbour before time expires. Find them just beyond the outside shoulder.",
  dispatch:
    "The syndicate bought two more billboards on the docks. Take them down.",
};
export const activities = [...events, stuntEvent, speedEvent, smashEvent];
export function storyLine(complete){
 const won=new Set(complete.map(e=>e.id));
 if(won.size===3)return 'The syndicate has fallen. Aurelia Bay is yours.';
 if(!won.has('coast'))return 'Rookie, the coast is clear. Take the Coastal Rush contract to prove yourself.';
 if(!won.has('city'))return 'The syndicate knows your name. A prototype just arrived downtown.';
 return 'Vale is waiting in the canyon. Bring your fastest car.';
}
export const startDistance = (event, lengths) =>
  event.start ?? event.startRatio * lengths[event.road];
export function newMission(event) {
  return {
    event,
    elapsed: 0,
    passed: 0,
    status: "intro",
    intro: 3.2,
    rival: 0,
    exposure: 0,
    stunt: 0,
    broken: [],
  };
}
export function tickMission(m, dt, p, waypoint, pursuit, boardHit = null) {
  if (m.status !== "running") return;
  m.elapsed += dt;
  const e = m.event;
  if (e.id === "stunt")
    m.stunt = Math.floor(p.driftScore + p.rolls * 150 + p.airtime * 14);
  if (e.id === "city")
    m.exposure = Math.max(
      0,
      Math.min(
        1,
        m.exposure +
          dt * (pursuit < 9 && Math.abs(p.speed) < 20 ? 0.12 : -0.075),
      ),
    );
  if (e.id === "canyon") m.rival += dt * (19 + Math.min(10, m.elapsed * 0.2));
  const hit = Math.hypot(p.x - waypoint.x, p.z - waypoint.z) < 23;
  if (e.id === "glass") {
    if (e.boards.includes(boardHit) && !m.broken.includes(boardHit)) {
      m.broken.push(boardHit);
      m.passed=m.broken.length;
    }
  } else if (hit && e.id === "speed") {
    m.recorded = Math.round(Math.abs(p.speed) * 3.6);
    m.status = m.recorded >= 220 ? "won" : "lost";
    return;
  } else if (hit && e.id !== "stunt") m.passed++;
  if (
    (e.id === "stunt" && m.stunt >= 160) ||
    (e.id !== "stunt" && m.passed >= e.count)
  )
    m.status = "won";
  else if (
    m.elapsed >= e.limit ||
    m.exposure >= 1 ||
    (e.id === "canyon" && m.rival >= e.interval * e.count)
  )
    m.status = "lost";
}
