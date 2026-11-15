# kyua-chat

KYAU-CHAT is a real-time chat app for students. It has one-on-one and group messaging, group audio and video calls, friend requests, file sharing, and an AI mentor.

| Part | Stack |
|---|---|
| `frontend/` | React 18, Vite, Tailwind CSS + daisyUI, TanStack Query, Zustand, Stream Chat React, Stream Video React SDK, Socket.IO client |
| `backend/` | Node.js, Express, MongoDB (Mongoose), Socket.IO, JWT auth, Stream (chat + video tokens), Cloudinary (uploads), Gemini / Groq (AI mentor) |

## Features

- Sign up, log in and onboarding (JWT cookie auth)
- Friend requests, and a friends list showing who is online
- One-on-one chat with file and image sharing (Stream Chat)
- Group chat: create a group, add members, remove members (admin only), leave a group
- One-on-one and group **audio and video calls** (Stream Video). Calling someone rings them with an accept / decline screen
- In-call controls: mute, camera, flip camera (mobile), screen share, emoji reactions, local recording
- Notification counters: the bell shows new activity plus pending friend requests, and the inbox shows unread private messages
- AI mentor (Gemini, with Groq as a fallback)

## Project structure

```
.
├── backend/
│   ├── src/
│   │   ├── controller/   # route handlers
│   │   ├── routes/       # Express routers (/api/auth, /api/users, /api/groups, ...)
│   │   ├── models/       # Mongoose models
│   │   ├── lib/          # db, stream, validation helpers
│   │   ├── middleware/   # auth, uploads
│   │   ├── socket.js     # Socket.IO: group rooms, notifications, call ringing
│   │   └── server.js     # entry point
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── pages/        # Home, Chat, Groups, GroupChat, Call, GroupCall, ...
    │   ├── components/   # Navbar, Sidebar, call/CallRoom, RealtimeListener, ...
    │   ├── hooks/        # useSocket, useStreamCall, useAuthUser, ...
    │   ├── lib/          # axios instance, API functions
    │   └── store/        # Zustand stores (notifications, theme)
    └── .env.example
```

## Getting started

### 1. Prerequisites

- **Node.js 20** or newer, and npm 10
- A **MongoDB** database (MongoDB Atlas free tier works)
- A free **[Stream](https://getstream.io)** account for chat and video. You need its API key and secret
- A **[Cloudinary](https://cloudinary.com)** account for file uploads
- Optional: a **Gemini** and/or **Groq** API key for the AI mentor

### 2. Clone and install

```bash
git clone https://github.com/Abdullauap/kyua-chat.git
cd kyua-chat

cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
```

### 3. Environment variables

The `.env` files are **not** in git. Create them from the examples:

```bash
cp backend/.env.example  backend/.env
cp frontend/.env.example frontend/.env
```

**`backend/.env`**

| Variable | What it is |
|---|---|
| `PORT` | API port. Use `5001`, because the frontend expects it |
| `NODE_ENV` | Use `development` locally |
| `CLIENT_URL` | Frontend origin, used for CORS. Locally this is `http://localhost:5173` |
| `MONGO_URI` | MongoDB connection string, **including the database name** |
| `JWT_SECRET_KEY` | Any long random string |
| `STREAM_API_KEY` / `STREAM_API_SECRET` | From the Stream dashboard |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | From the Cloudinary dashboard |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Optional, for the AI mentor |

**`frontend/.env`** (local development)

```env
VITE_STREAM_API_KEY=<same Stream API key as the backend>
VITE_API_URL=http://localhost:5001/api
VITE_SOCKET_URL=http://localhost:5001
```

> To run the frontend against a deployed backend instead, point `VITE_API_URL` and `VITE_SOCKET_URL` at that server.
> If you keep production URLs in `frontend/.env`, you can override them for `npm run dev` only with a `frontend/.env.development.local` file (it is gitignored).

### 4. Run it

Open two terminals:

```bash
# Terminal 1 - API + Socket.IO on http://localhost:5001
cd backend
npm run dev
```

```bash
# Terminal 2 - web app on http://localhost:5173
cd frontend
npm run dev
```

Then open **http://localhost:5173**, sign up, and complete onboarding.

To try calls and notifications, log in with **two different accounts** in two browsers, or in one normal window and one incognito window.

### Other scripts

| Where | Command | Does |
|---|---|---|
| backend | `npm start` | Run the API without auto-reload (production) |
| frontend | `npm run build` | Production build into `frontend/dist` |
| frontend | `npm run preview` | Serve the production build locally |

### Troubleshooting

- **`Cannot find module ...` or `nodemon is not recognized`**: `node_modules` is incomplete. Delete it and run `npm install` again.
- **The app loads but nothing works, with 401 or CORS errors**: check that `VITE_API_URL` points at your backend and that `CLIENT_URL` in `backend/.env` matches the frontend origin.
- **Calls fail to connect**: allow camera and microphone in the browser, and check that the Stream key is the same in both `.env` files.

## Recent update: calls, groups and notifications

- **Group calls**: the group header has audio and video call buttons. Starting a call rings every other member with a full-screen accept / decline card and a ringtone. If nobody answers within 35 seconds, it becomes a "Missed call" notification. The call message in the chat shows a "Join call" card.
- **Add members**: the modal lists your friends directly. Search works, you can select several people at once, and people who are already members are hidden. Added people get a notification.
- **Leave / remove member**: there is a new `POST /api/groups/:groupId/leave` route. When the admin leaves, the next member becomes admin. When the last member leaves, the group and its messages are deleted. The admin can remove members with `DELETE /api/groups/:groupId/members/:memberId`.
- **Call screen redesign**: one-on-one and group calls share a new in-call screen.
  - The top bar shows the name, a Live badge, a timer and the participant count.
  - The layout adapts to the number of people: a picture-in-picture view for two people, a grid for more, and a speaker view during screen share.
  - Audio calls show avatar cards, and a ring lights up around whoever is speaking.
  - Leaving the page now always leaves the call.
- **Notification counters fixed**: three bugs kept the counters from working:
  - The server never sent a realtime event for group messages.
  - The private-message event the app waited for was never emitted.
  - The shared socket was disconnected whenever any page unmounted.

  The bell now shows new activity plus pending friend requests, and the inbox shows unread private messages. Muting a group silences only its notifications.
- **One-on-one call buttons**: they were hidden under Stream's chat header. The chat now has its own header with the name, an online dot, and audio and video buttons.

## Deployment notes

- **Call ringing and live notifications need a long-running Socket.IO server.** Serverless hosts such as Vercel do not keep a socket server running. Host the backend somewhere that does, such as Railway or Render (`backend/render.yaml` is included). If the backend is on Vercel, call links still appear in the chat, but the other person's phone will not ring.
- **The notification activity list is stored in the browser only**, so it clears on page reload. Pending friend requests come from the server and are always counted.
- **Set the environment variables in the hosting dashboard** (Railway / Render / Vercel). The `.env` files are intentionally not committed.
- **Set `CLIENT_URL` on the backend** to the deployed frontend URL. Without it, CORS only allows `localhost` and `*.vercel.app`.
- **Case-sensitive filenames:** `frontend/src/components/Layout.jsx` imports `./Sidebar`, but the file is named `SIdeBar.jsx`. Windows does not mind, but a Linux build server (Vercel, Railway, Render) will fail on this import. Rename the file to `Sidebar.jsx` before deploying the frontend from Linux.
