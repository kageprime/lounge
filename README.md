# Neon Arcade Lounge

A crisp 3D isometric arcade lounge: walk around, sit, chat, pick songs on the jukebox, dress your avatar, and walk up to the
Ludo cabinet (or the Ludo table) to play the Club No.9 Ludo game inside the lounge. Bots keep the room alive.
It is built as the **foundation for a bigger isometric game**, so the structure matters more than the content.

## Run
Needs internet once (Three.js loads from the jsdelivr CDN, pinned 0.170.0).
- Windows: double-click `start.bat`
- Mac/Linux: `./start.sh` (or `node serve.mjs`), then open http://localhost:8000
- Do not double-click index.html (browsers block ES modules on file://).

URL options: `?bots=12` population, `?seed=3` bot randomness.

## Visual quality
Bloom + MSAA post-processing, fake ambient occlusion (contact shadows + wall darkening), light pools, animated cabinet screens,
wall posters and lamps, dust motes, intro camera swing, camera dolly-in and fade when you sit at a game, spatial cabinet audio,
footsteps and room tone. The sparkle button cycles graphics High / Med / Low; it also drops automatically if the frame rate is
poor (add `?q=high` to pin a level). Keys 1-4 trigger emotes.

## Controls
Click floor = walk. Click a cabinet/couch/jukebox = use it. WASD/arrows walk (camera-relative). Q/E rotate view, wheel zoom,
F follow-me, Enter chat, Esc closes panels/game. Customize button = avatar editor (saved in localStorage).

## Architecture (the part to keep)
```
layout.js   the room as DATA (props, positions, rotations, which game each cabinet launches)
props.js    prop TYPES as data: footprint, use-slots (sit / stand / play / music), facing, rotation maths
grid.js     tile grid + A* (8-way, no corner cutting)         \
sim.js      World: people, occupancy, movement, command seam    } pure, deterministic, no DOM/Three -> unit tested, server-ready
bots.js     bot brains drive the SAME command seam as a human  /
avatar-data loadout JSON (options, sanitize, random)
props3d.js  procedural prop models   avatar3d.js  loadout -> figure + procedural poses   stage.js  ortho iso camera, cut-away walls, picking
main.js     the only controller: input, DOM, portal to games, jukebox, customizer
games/      each game is a standalone page opened in the portal (games/ludo is the Ludo build)
```
Rules of the road: **only `world.command({t:...})` changes the world** (join, leave, move, use, stand, say, emote, loadout).
The stage only reads. That one seam is what lets you later swap in a WebSocket server (commands up, snapshots down) without
touching rendering.

## Extension points
- New prop: add a type in `props.js`, a builder in `props3d.js`, place it in `layout.js`. Use-slots give sitting/playing for free.
- New game: add a line to `GAMES` in `main.js` and set `game:'id'` on a cabinet in `layout.js`.
- Real models: drop `.glb` files in `assets/models/` and list them in `manifest.json` (auto-fit, tint, emissive, screens; see `assets/models/README.md`). `buildProp` shows the procedural prop first and swaps the model in when loaded. Avatars are still procedural.
- Bigger map / multiple rooms: `World` takes any layout; add doors as a `use` action that swaps layout.
- Multiplayer: replace `spawnBots` with network peers; the sim already treats every person identically.

## Which bigger game? (direction is still open — the base supports each)
1. **Lounge tycoon**: place/upgrade cabinets and furniture (layout.js becomes the save file), earn tokens from play, hire bots as staff. Needs: placement mode, economy, save.
2. **Social hub + quests**: a town of several lounges, NPCs with quests, games as minigames, cosmetics. Needs: multi-room, dialogue/quest data, server.
3. **Cozy life/RPG**: your avatar, a home, friends, mini-games for progression. Needs: inventory, day cycle, more rooms.
4. **Competitive arcade league**: ranked Ludo/pool, spectators at tables, tournaments. Needs: server, game result events (postMessage from games), matchmaking.
Pick one and the next 2-3 steps are obvious from the lists above.

## Tests
`node --test test/lounge.test.js` (pathfinding, rotation maths, layout reachability, use/occupancy, bot determinism, sanitising).

## Known limits
Procedural placeholder art (swap for glTF later), no real multiplayer yet, audio is synthesised, Ludo needs the CDN for Three.js/Rapier.
