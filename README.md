# TERON Miner — Telegram Mini App

A single-repository starter for a TERON mining/rewards Telegram Mini App inspired by the public UI flow shown in the reference video.

## Included
- Mine screen with time-based mining
- Claim mining reward
- Tasks screen
- Referral link and referral reward
- Miner Store / level system
- Friends/team screen
- Profile screen
- Wallet address saving
- Withdrawal request + history
- Admin task creation/deletion
- Admin withdrawal status management
- SQLite database
- Telegram Mini App init-data verification
- Telegram bot `/start` and menu button

> This project is an original implementation. It does not contain private source code, credentials, or proprietary assets from another bot.

## 1. Create the Telegram bot
1. Open @BotFather.
2. Create a bot and copy its token.
3. Set the bot username in `.env`.
4. Deploy this project to a public HTTPS URL.
5. Set `WEBAPP_URL` to that URL.

## 2. Local setup
```bash
npm install
cp .env.example .env
npm start
```

## 3. Environment variables
- `BOT_TOKEN` — BotFather token
- `BOT_USERNAME` — username without @
- `WEBAPP_URL` — public HTTPS URL of this app
- `ADMIN_IDS` — Telegram numeric user IDs separated by commas
- `REFERRAL_REWARD` — reward for a successful referral
- `MIN_WITHDRAW` — minimum withdrawal amount
- `PORT` — server port

## 4. Deploy on Render
Create a new Web Service from this GitHub repository.
Build command:
```text
npm install
```
Start command:
```text
npm start
```

Then add the environment variables from `.env`.

## 5. Set the Mini App button
The bot automatically sends an Open App button on `/start` using `WEBAPP_URL`.

## Important
The default withdrawal flow creates a request for admin review; it does not automatically send blockchain funds. Add real on-chain payout logic only after testing your token contract, wallet, security, and accounting.

## Admin
Open:
```text
https://YOUR-DOMAIN.example/admin
```
inside Telegram after logging in as an ID listed in `ADMIN_IDS`.

The admin page can:
- add tasks
- delete tasks
- view withdrawal requests
- approve/reject requests

## Database
SQLite is stored under `data/teron.db`. On hosts with ephemeral storage, use a persistent disk or migrate to PostgreSQL before production.
