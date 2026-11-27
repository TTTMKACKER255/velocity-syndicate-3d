# Velocity Syndicate

Velocity Syndicate is a browser-based 3D action-driving game set in Aurelia Bay. A rookie driver takes on a corporate racing syndicate across the coast, downtown and the canyon. The project uses original fictional vehicles.

## Foundation milestone

The first playable milestone targets a detailed player coupe, fixed-step simcade driving, drift and boost, four camera positions, road traffic, an event loop and an interactive garage. The long-term art target is a photorealistic, seamless coastal metropolis. This repository starts with its modular architecture.

## Run locally

The browser client is designed to run from any static HTTP server. Once the client is implemented, serve the checkout with `python3 -m http.server 8080` and open `http://localhost:8080`. Use a modern browser with graphics acceleration enabled. Node.js is used for checks and packaging.

## Project layout

| Path | Responsibility |
| --- | --- |
| src/ | Simulation, input, rendering, world, events and cameras |
| assets/ | Original environmental art, interface assets and materials |
| models/ | Procedural vehicle meshes and configuration |
| scripts/ | Reproducible checks and static builds |
| ui/ | Driving HUD, event map and garage |
| audio/ | Procedural engine, boost and interface audio |

## Design

Physics runs at a fixed timestep independently of display refresh. The HUD consumes simulation state, and camera selection does not change vehicle handling. Browser-local progress makes an offline single-player experience possible after downloading the source.
