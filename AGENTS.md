# AGENTS.md — The Twilight Arcade (Neon Lounge & Table Games)

Instructions for any agent continuing this project. Read fully before changing anything. The goal is that new work is
indistinguishable in style, architecture, and visual polish from what is already here.

---

## 1. What this project is

A browser-based **3D isometric living arcade and surreal mystery lounge**: a crisp, neon-lit room where avatars walk, sit, chat, use a jukebox, play real web games at cabinets (Ludo is playable, others plug into the iframe portal), rearrange and customize the room via an in-game Decorator Mode, win prizes at an interactive Claw Machine, and uncover surreal late-night liminal mysteries.

### The Two-Layer Identity: "The Twilight Arcade"
1. **The Surface (Living Web Arcade & Social Hangout):**
   A vibrant, cozy 3D hangout for playing real web games, collecting coins and tickets, winning wearables and furniture from the claw machine, and using **Decorator Mode** to build and customize dream lounge layouts with live multiplayer sync.
2. **The Underbelly (Surreal Night Mysteries):**
   Late at night, or when specific hidden environmental conditions are met (secret jukebox tracks, odd geometry configurations in Decorator Mode, anomalous high scores), the lounge shifts into the **"Twilight Phase"**: lighting transforms, glitched 1989 prototype cabinets flicker to life, and hidden backrooms phase into existence.

Sibling projects by the same owner (same presentation language): *Club No.9* (pool + bar mini-games) and *Ludo* (standalone in the club's dice-tray style, embedded under `games/ludo`). A written system spec for this table-games line exists (`table-games-system-spec.html`).

---

## 2. The owner's standing preferences (non-negotiable)

- **Crisp and clean.** Native resolution, antialiasing, no pixelation, no dither, no low-res render target. (The owner explicitly rejected heavy pixelation.)
- **Realistic 3D feel, not flat 2D**, with a dice-tray-quality physical presentation for games (felt, wood, soft contact shadows, thrown dice).
- **Deliverables are downloadable** (zip of a static folder, or a single html). Games must run from a plain static server with zero build step.
- Wants an environment, characters, and presentation that keep getting visibly better; wants **real 3D assets** (GLB models) rather than primitive placeholder shapes where available.
- **Decisive agency:** Don't ask questions you can answer yourself; make the call, state it in one line, move on. Ask only when a decision fundamentally redirects the project.

---

## 3. Hard architecture rules

1. **Static, zero build.** ES modules, import maps, Three.js `0.170.0` (+ `three/addons/`) from jsdelivr, pinned. Ludo additionally uses `@dimforge/rapier3d-compat` `0.14.0`. No bundler, no TypeScript, no npm runtime build step. `serve.mjs` / `start.sh` / `start.bat` exist because browsers block ES modules on `file://`.
2. **Simulation decides, renderer draws.** `grid.js`, `sim.js`, `bots.js`, `props.js`, `layout.js`, and `avatar-data.js` are **pure JavaScript** (no DOM, no Three.js), deterministic given a seed, and unit-tested with `node --test`. `stage.js`, `props3d.js`, `avatar3d.js`, `assets.js`, and `audio.js` only *read* world state.
3. **One command seam.** The only way to change the world is `world.command({t:...})`. Supported commands:
   - Core: `join | leave | move | use | stand | say | emote | loadout`
   - Decorator: `placeProp | moveProp | removeProp`
   - Economy/Interaction: `claimReward | setPhase`
   Humans, bots, and network peers all act through this exact seam. Never mutate `world.people` or `world.props` directly from rendering/UI code.
4. **Everything in the room is data.** `layout.js` lists props (`type, x, y, r, color, game, model, side, ...`). `props.js` defines prop *types* (footprint, use-slots, labels). The in-game Decorator Mode manipulates this data structure and persists it to `localStorage` (`lounge.layout.custom.v1`).
5. **Rotation convention.** A prop's local frame faces **+y (south)**; `r` is quarter-turns (0..3); `resolve()` in `props.js` maps footprint, uses, and facing. World x = Three X, world y = Three Z. Tile = 1 unit. Meshes are authored centred on their footprint, floor at y=0, front facing +z; the stage rotates by `-r*π/2`.
6. **Graceful fallback.** Real glTF/GLB models are loaded when available (`assets/models/manifest.json`); otherwise procedural builders in `props3d.js` render. The lounge must run even with zero asset files loaded.
7. **Games are standalone pages** opened in the portal iframe (`GAMES` registry in `main.js`). A game never reaches into the lounge; the lounge never reaches into a game (use `postMessage` when result/ticket events are needed).
8. **Browser storage** only for per-user conveniences (profile, custom layout, quality, wallet), always wrapped in try/catch.
9. **Authoritative WebSocket multiplayer.** `serve.mjs` runs a headless `World` instance. Clients send `cmd({t:...})` over the socket; server validates and broadcasts accepted events. If the server is offline, client seamlessly falls back to local simulation with bots.

---

## 4. File map

```
index.html / style.css     UI shell, design tokens, HUD, build bar, modals
serve.mjs                  Zero-dependency static server + WebSocket multiplayer sync
src/layout.js              The room (data schema & default prop layout)
src/props.js               Prop types registry, rotation/footprint/use-slot maths
src/grid.js                Tile grid + A* pathfinding (8-way, no corner cutting)
src/sim.js                 World: people, occupancy, movement, command seam, events
src/bots.js                Bot brains (use the identical command seam as humans)
src/avatar-data.js         Loadout options, sanitize (clamps untrusted input), seeded RNG
src/assets.js              GLB model pipeline + auto-fit, tint, emissive screens
src/fit.js                 Bounding box fitting & anchor calculations
src/props3d.js             Procedural prop builders + screen texture animators
src/avatar3d.js            Procedural low-poly avatar with skeleton & procedural poses
src/stage.js               Ortho iso camera, cut-away walls, lights, post-processing, env polish, picking
src/audio.js               Procedural Web Audio synthesis (footsteps, UI, spatial blips, jukebox, drone)
src/claw.js                Interactive arcade claw machine mini-game
src/net.js                 WebSocket client synchronization & offline fallback
src/main.js                The ONLY controller: input, HUD, portals, build mode, economy, main loop
games/ludo/                Embedded standalone 3D Ludo (dice physics + AI)
games/proto89/             Glitched prototype cabinet puzzle game (surreal mystery)
assets/models/             Kenney CC0 GLB models + manifest.json + CREDITS.md
test/lounge.test.js        Unit tests (run: node --test test/lounge.test.js)
tools/                     Offline FBX/GLB processing scripts
```

---

## 5. The visual style bible (match this exactly)

- **Camera:** Orthographic, pitch 33°, yaw 45° default with 90° snap rotation (Q/E), zoom (ortho half-height) default **12**, range 4.5–16. Intro: smooth swing from yaw−0.7 and zoom 8. Camera dollies to zoom 5.5 on a prop when sitting at a game, then fades the game iframe in (0.3 s opacity+scale).
- **Walls:** Two back walls full height (3.0); walls facing the camera drop to a 0.22 rail (animated). Wall decor hides smoothly with its wall.
- **Renderer:** `antialias: true`, pixel ratio ≤ 2, sRGB, ACES tone mapping exposure 0.95, PCFSoft shadows (2048 map, normalBias 0.03). Background `#0c0a16`.
- **Lighting (Normal Phase):** Hemisphere (`0xa994e8` / `0x33254f`, 1.5) + warm sun (`0xffe2c0`, 1.7, shadowed) + cool fill (`0x8fb8ff`, 0.55) + coloured point lights near neon (`ff4d9a`, `35e0ff`, `8a5cff`, `ffb84a`, `35e0c9`).
- **Lighting (Twilight / Mystery Phase):** Sun drops to deep amber/violet; bloom threshold lowers; neon signs pulse erratically; wall sconces flicker.
- **Post-processing:** Composer with `UnrealBloomPass` (strength 0.62/0.5, radius 0.65, threshold 0.88) + `OutputPass`, MSAA 4/2. Emissive/neon materials intentionally exceed 1.0 (neon colour ×2.2, screen emissive 1.9, neon text colour 2.4) so they bloom. Quality levels `high | med | low` (low = no composer, 1024 shadows, no dust/sweep); auto-downgrades if frame time > 42 ms for 3 s unless `?q=` is pinned.
- **Environment polish (keep all of it):**
  - Fake ambient occlusion (blurred contact-shadow quad under every solid prop + gradient darkening along back walls).
  - Additive radial **light pools** on the floor under neon sources.
  - Slow colour-cycling **sweep light** over the rug (speeds up with music).
  - Floating **dust motes** (140 points, additive).
  - Animated pixel **cabinet screens** (Ludo cabinet shows a mini board).
  - Wall **posters** (canvas-generated retro art).
  - Glowing **sconces** and CSS **vignette**.
- **Palette tokens (UI):** Panel `rgba(18,22,40,.88)`, gold `#ffb84a`, green `#5fe08a`, cyan `#54e0ee`, red `#ff6a5a`, ink `#eef0ff`, mute `#9aa0c0`. Font: Inter (700–800 for labels). Icons are inline SVG (stroke 2, round caps) — no emoji in controls.
- **Scale:** A person ≈ 1.35 units tall. Bar top 0.8, stool seat ≈ 0.46, couch seat ≈ 0.34. New props must respect this scale.
- **Motion:** Smooth everything (look-at lerp, wall lerp, pose crossfade 0.22 s). Nothing pops abruptly.

---

## 6. Decorator Mode guidelines

- **Trigger:** Toggled via HUD "Build" button or pressing `B`.
- **Ghost preview:** Renders a semi-transparent ghost mesh of the active prop on the hovered floor tile. Valid tile = green tint; obstructed/invalid tile = red tint.
- **Placement validation:**
  1. Prop footprint must stay strictly within room boundaries.
  2. Footprint must not overlap existing solid props.
  3. Prop must not block the room's spawn point or make any use-slot unreachable.
- **Rotation:** Pressing `R` rotates the active prop by 90° (`(r + 1) % 4`).
- **Live A* update:** When a prop is placed, moved, or deleted, `World` immediately updates `grid.setBlock()` and `grid.setSeat()`. Any walking bots whose path is cut recalculate their path.
- **Persistence:** Custom layouts serialize to JSON in `localStorage.setItem('lounge.layout.custom.v1', ...)`. A "Reset Lounge" option restores default `LOUNGE`.

---

## 7. Economy & Claw Machine guidelines

- **Wallet state:** Profile tracks `coins` (spent on games/claw), `tickets` (earned from scores), and `inventory` (unlocked items).
- **Claw Machine (`claw.js`):**
  - Walking up to a claw machine and clicking "Play" enters the crane minigame.
  - Real physical or timing drop mechanism.
  - Drops into a prize pit with 4 capsule tiers:
    - Common: Tickets (25–100).
    - Uncommon: Wearable cosmetics for avatar editor.
    - Rare: Exclusive furniture props for Decorator Mode.
    - Cryptic: Mysterious artifacts that unlock room secrets.
- **Prize Counter:** Kiosk or counter prop where tickets can be redeemed for items.

---

## 8. Surreal Mysteries guidelines

- **The Twilight Shift:**
  - Can be triggered by: secret jukebox frequency, midnight in-game clock, or placing 3 specific mystery relics in Decorator Mode.
  - Audio shifts to ambient resonant drones with reverse synth echoes via `audio.js`.
  - Visuals shift bloom, lighting, and shadow angles via `stage.js`.
- **Glitched Cabinets:**
  - An oscillating CRT static screen cabinet that boots `games/proto89/`.
  - Beating or deciphering the prototype game drops narrative fragments and codes.
- **The Backroom:**
  - Solving specific room puzzles causes the east wall to slide back, revealing a secret room with a terminal and deeper lore.

---

## 9. Quality bar — every change must pass

1. `node --test test/lounge.test.js` green. (Pure logic must be tested; layout must keep every use-tile reachable from spawn and have no overlapping footprints).
2. **Visual review:** Test in Chromium. Verify at default zoom, close zoom, and rotated views. Fix muddy lighting, clipped geometry, floating objects, scale mismatches, z-fighting, or blown-out bloom. Never ship unseen visuals.
3. No console errors in browser.
4. Every new interaction has hover feedback, audio cues, and graceful fallback.
5. Desktop and mobile/narrow viewports remain usable.

---

## 10. How to extend (recipes)

- **New prop type:** Add type in `props.js` (w, d, uses, seatTile, flat, wall) → add 3D builder in `props3d.js` (and optional entry in `assets/models/manifest.json`) → add to Decorator Mode catalog.
- **New playable game:** Add line to `GAMES` in `main.js`, set `game: 'id'` on a cabinet in `layout.js`, create standalone game in `games/<id>/index.html`.
- **New mystery anomaly:** Register trigger in `main.js`, add atmospheric response in `stage.js` and `audio.js`.
- **New avatar option:** Add key/values to `OPTIONS` in `avatar-data.js`, handle in `avatar3d.js`, customizer UI updates automatically.

---

## 11. Phased execution roadmap

- **Phase 1 (In-Game Decorator Mode & Persistence):**
  - Add `placeProp`, `moveProp`, `removeProp` to `sim.js` and `stage.js`.
  - Build Mode toolbar, ghost preview, catalog drawer, and `localStorage` layout persistence.
- **Phase 2 (Tactile Economy & Interactive Claw Machine):**
  - Profile coins/tickets/inventory wallet in HUD.
  - Playable arcade claw machine with tiered prize capsules (`claw.js`).
  - Ticket prize counter kiosk.
- **Phase 3 (Surreal Mysteries & Glitched Cabinets):**
  - Atmospheric "Twilight Shift" state in `stage.js` and `audio.js`.
  - Glitched CRT prototype cabinet launching `games/proto89/`.
  - Mystery backroom sliding wall puzzle.
- **Phase 4 (WebSocket Multiplayer):**
  - Lightweight WebSocket server in `serve.mjs`.
  - Real-time client synchronization in `net.js` with seamless offline bot fallback.

---

## 12. Working style for the agent

- Start with one clear sentence stating what you're about to do.
- Build in stages: pure simulation logic + unit tests → 3D rendering → UI/HUD → manual browser test → polish.
- Make decisive calls on implementation details without stalling the owner.
- Be precise and honest about what has been tested and verified.
- Conclude with a concise summary (2–3 sentences) and the immediate next step.
