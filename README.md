# Number Bingo

A realtime, two-player Number Bingo game built with Next.js and Convex.

## Rules

Each player is dealt four standard 75-ball bingo cards with a free center.
Players take turns calling an unused number by tapping it on one of their own
cards. The number is automatically marked everywhere it appears. The first
player to complete a row, column, or diagonal on any card wins; if the same
call gives both players bingo, the round is a draw.

## Local development

Install dependencies:

```bash
npm install
```

Then start the Convex backend and Next.js frontend together:

```bash
npm run dev
```

On the first run, Convex will ask you to create or select a project and will
write the development deployment configuration automatically.

Open [http://localhost:3000](http://localhost:3000). Create a room in one
browser and join its six-character code from another browser or device.

Convex writes `NEXT_PUBLIC_CONVEX_URL` and deployment details to `.env.local`.
That file is intentionally ignored by Git.

## Production deployment

1. Push the repository to GitHub and import it into Vercel.
2. In the Convex dashboard, create a production deploy key.
3. Add the deploy key to Vercel as `CONVEX_DEPLOY_KEY`.
4. Set the Vercel build command to:

```bash
npx convex deploy --cmd "npm run build"
```

This deploys the Convex functions and supplies the production
`NEXT_PUBLIC_CONVEX_URL` while Next.js builds.

## Scripts

- `npm run dev` starts Convex and Next.js together.
- `npm run dev:frontend` starts only Next.js.
- `npm run build` creates a production Next.js build.
- `npm run deploy:backend` deploys only the Convex backend.
- `npm run typecheck` checks the TypeScript code.
