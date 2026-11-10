# SayBearLand (phase 1)

Accounts, roles and login, a realtime 3D jelly office, and an admin panel.

## Run locally
    npm install
    npm test          # accounts, layout, admin and realtime checks, in-memory storage
    npm start         # http://localhost:3000 (in-memory storage unless Upstash vars are set)

## Use Upstash
Copy `.env.example` to `.env` (or set the same variables in Render) and fill in
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and `SESSION_SECRET`.
All keys start with `KEY_PREFIX` (default `saybearland:`), so an existing database is safe to share.
Never commit the token. Reset the token in Upstash if it has been pasted anywhere.

## Deploy on Render
Push this folder to GitHub, then create a Blueprint from `render.yaml`. Add the two Upstash
variables in the Render dashboard. `SESSION_SECRET` is generated for you.

## Admin
Sign up with a username listed in `ADMIN_USERNAMES` (default `admin`) to get admin rights.

## Controls
W A S D move, Q and E turn the camera, F sits at a desk or reads the board, M opens mail, Enter chats.

## What is in it
- `/` login and signup (random first password), `/office` the 3D office, `/admin` the admin panel.
- Realtime (WebSocket on the same Render service): players, chat, and server-driven bots.
- Mail: coins and new outfits (robot suit, gold crown, extra colours) only arrive as mail attachments. Players claim them once; admins send from the Mail tab, optionally signed as a bot. Starter outfits are free.
- Whiteboards: walk up and press F to draw. Everyone sees strokes live and they are saved to Upstash (`wb:*`).
- Objects: desks, sofa, meeting table, glass wall, room dividers, walk-through doors, toilet stalls, sinks, water coolers, a fountain, an aquarium, whiteboards, wall decor.
- Default map is 40 x 28 (up to 60 x 40). The admin can reset to it from the layout editor.
- Touch devices get an on-screen joystick.
- Admin panel: edit the floor shape and styles, place objects, upload the logo, write announcements,
  add and name bots, reset passwords.
- State lives in Upstash under `KEY_PREFIX`: `user:*`, `layout`, `news`, `logo`, `bots`, `chat`.
- Realtime state (who is online, where) is kept in memory, so run one Render instance.

## Not built yet
Meeting-room voice or video, password recovery by email, running more than one server instance.
