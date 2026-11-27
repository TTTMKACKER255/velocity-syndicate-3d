# Velocity Syndicate

A single-player 3D action-driving game set in **Aurelia Bay**. Start in the silver Veloce GT-R, explore the coastal highway, and take dispatch contracts against a corporate racing syndicate. The first playable release includes a three-contract campaign, three side trials and a persistent garage.

## Run the game

Install Node.js 22.12 or later and npm, then run these commands from the project root.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Select **Start driving** to enter free roam, or choose **Coastal Rush** to start the story. A current desktop browser with WebGL2 and hardware acceleration gives access to the full renderer. A built-in Canvas2D renderer projects the world and rasterizes the vehicle on machines without WebGL2. No API keys, asset downloads at runtime or backend services are required.

```sh
npm test
npm run build
python3 -m http.server 8080 --directory dist
```

Open `http://localhost:8080` to play the production build. Any static host that preserves the contents of `dist/` can serve it. The source repository ZIP contains an ordinary working checkout and its commit history. Extract the ZIP before running commands.

## Driving and controls

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Accelerate | W or Up | RT |
| Brake, then reverse | S or Down | LT |
| Steer | A / D or Left / Right | Left stick |
| Handbrake drift, airborne roll | Space and steering | B and left stick |
| Three-stage nitro | Hold Shift | Hold A |
| Cycle chase, hood, bumper and cinematic cameras | C | Y |
| Recover to the road or current race checkpoint | R | X |
| Use a nearby location or enter an event | E | LB |
| Open the map | M | View |
| Toggle headlights | H | D-pad Up |
| Pause | Escape | Menu |

Touch devices have steering, brake, throttle, drift and nitro buttons. A standard-mapping controller can navigate menus with the D-pad or stick, select with A, and go back with B. Use the bumpers on a focused tuning selector. Gamepad availability depends on the browser, a secure context or localhost, and an initial controller button press.

The simulation uses metres, seconds and radians at 120 fixed steps per second. A separate velocity heading gives the tires a gradual breakaway during drifts. Speed-dependent steering reduces twitch at high speed. Ramps add vertical velocity, and completed rolls and sustained drifts help replenish boost. The hypercar exceeds 200 mph in the automated driving check.

## Aurelia Bay

The procedural island contains **13 roads totalling 15.6 km**, including a coastal circuit, a container harbour, downtown streets, a grade-separated expressway and elevated canyon switchbacks. Eighteen traffic cars use both directions of the road network. Their oriented collision bodies exchange momentum with the player. Off-centre hits make the struck vehicle rotate and slide before it steers back to its lane. The same contact model applies to the rival and interceptor. Strong impacts leave localized dents on both cars for the drive. Four stunt ramps launch cars, while roadside lamps, barriers and glass boards can be smashed. A hard hit fells roadside trees in the direction of impact. Seven hidden parts reward exploration.

Use the world map to inspect an event, launch directly, or set GPS to its start. Click the map to place a custom destination on a road. The Places tab marks Bayline Garage, Promenade Home, the harbour stunt yard, Canyon Overlook and Festival Plaza. These destinations have matching minimap icons and coloured in-world beacons. Press E nearby to use a location. Parking at Home sets the next free-roam starting point.

| Event | Objective |
| --- | --- |
| Coastal Rush | Clear six coastal gates against the clock. |
| Neon Pursuit | Deliver a prototype along the expressway while keeping the pursuing interceptor outside capture range. |
| Canyon Duel | Beat Vale to the seventh mountain gate. |
| Dockside Air | Score 160 points with drifts, airtime and rolls. |
| Terminal Velocity | Cross the speed trap at 220 km/h or faster. |
| Glass Run | Smash the two marked harbour billboards before time expires. |

The first three contracts form the campaign and can be attempted in any order. Clearing all three unlocks the Solare X1. Events can be replayed for credits, reputation and personal bests. In-engine camera moves introduce contracts, with text dispatch and optional browser-synthesized speech. Bay FM plays MintoDog’s CC0 recordings *Pure Raceway* and *Sky Blue Street* alongside the original *Afterhours Run*. Use Playlist in the hub or the radio button while driving to play, pause or skip. All three recordings are bundled locally. See [audio credits](audio/CREDITS.md).

## Vehicles and garage

Seven original, unlicensed vehicle configurations share a parametric mesh generator. Each has a distinct wheelbase, body and cabin profile, handling tune and fascia. The launch coupe has over 103,000 triangles, sculpted wheel arches, an interior dashboard, calipers, steerable front wheels, rotating alloys, red brake lights, headlights, and a carbon wing.

| Vehicle | Class |
| --- | --- |
| Veloce GT-R | Flat-six-inspired track coupe |
| Nord V60-R | Performance wagon |
| Vier RS4 | All-wheel-drive-inspired sport coupe |
| Bergwerk M4X | Track saloon |
| Maddox V8 | American muscle |
| Kaido R32 | Japanese-inspired tuner |
| Solare X1 | Mid-engine hypercar |

Buy vehicles with race winnings. Each car has three upgrade levels for engine, turbocharger, transmission, nitro capacity, tires and suspension. Advanced levels also consume reputation points. Lifetime reputation determines driver rank. The garage shows the resulting top speed, acceleration, grip and boost capacity. Cosmetic tuning is included with ownership. Choose paint colour and finish, rims, tint, wing, sport bumpers, fender flares and underglow. Drag the showroom model to inspect it.

Credits, reputation, owned cars, upgrades, appearance, collected parts, settings, victories and best times save to browser local storage under `velocity-syndicate.profile.v1`. A separate browser or origin has a separate save. The live position and unfinished event reset when you close the game.

## Rendering

Three.js runs the hardware-accelerated renderer, with instanced scenery, a procedural sky and ocean, fog, material reflections, wet-road shading, exhaust particles and a day/night cycle. Paired tire marks follow the rear wheels according to slip, road contact and elevation. Roads and downtown blocks use local asphalt, pavement, glass, masonry and storefront textures. The **High** preset adds selective screen-space road reflections, a depth-based sunlight scattering pass and speed-dependent radial blur. The software renderer uses lower-detail scenery and cached views of the configured vehicle. The photographic hub and district images are menu artwork. The driving environment is procedural.

## Source layout

| Path | Contents |
| --- | --- |
| `src/physics.js`, `src/input.js`, `src/camera.js` | Fixed-step vehicle dynamics, keyboard/gamepad input and the four driving cameras |
| `src/world.js` | Road splines, spatial queries, terrain, structures, ramps and breakable props |
| `src/graphics.js`, `src/postfx.js`, `src/software-view.js` | GPU presentation, effects and the software driving view |
| `src/traffic-physics.js`, `src/skidmarks.js`, `src/beacons.js` | Vehicle contacts, tire tracks and destination beacons |
| `src/session.js`, `src/events.js`, `src/profile.js` | Game loop, contracts, economy and saved progress |
| `src/main.js`, `ui/` | Driver hub, garage, map, settings, controls and HUD |
| `models/` | Parametric vehicle meshes and orbitable garage studio |
| `assets/`, `audio/` | Original menu and location artwork, Bay FM recordings and engine synthesis |
| `scripts/` | Build, portable repository packaging and automated regression checks |

## Verification

`npm test` covers centred and glancing impacts, momentum transfer, overpass clearance, lane recovery, tree toppling, deformation of the struck mesh and paired skid marks. It also exercises acceleration, reverse, controlled slip, staged nitro and re-arming, launch and landing physics, all seven meshes, a real harbour ramp, both expressway decks, resettable glass targets, speed-trap scoring, pursuit and rival outcomes, and speeds above 200 mph. Browser checks cover the driver hub, driving input, garage paint selection, camera changes and event entry.

## Source transfer

The downloadable ZIP preserves the `main` branch and commit objects. Run `git log --oneline` in the extracted directory to inspect them. To publish the downloadable checkout to the project’s GitHub repository, sign in with an account that can write to it, then run:

```sh
git remote add origin https://github.com/TTTMKACKER255/velocity-syndicate-3d.git
git push -u origin main
```

The hosting project uses its own Git source repository. GitHub credentials are never included in the downloadable checkout.
