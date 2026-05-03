# SteakQurban OAuth Full Panel

## Railway Variables

```env
SERVER_NAME=SteakQurban
SERVER_TAGLINE=Premium Discord Community
DISCORD_INVITE=https://discord.gg/linkkamu

MAIN_MONGO_URI=mongodb://...
SECURITY_MONGO_URI=mongodb+srv://...

DISCORD_CLIENT_ID=application_id
DISCORD_CLIENT_SECRET=client_secret
DISCORD_CALLBACK_URL=https://domain-kamu.up.railway.app/auth/discord/callback
WEB_ADMIN_IDS=discord_user_id_kamu,discord_user_id_admin_lain

WEB_SECRET=random-secret
```

## Discord Developer Portal

OAuth2 → Redirects:
```txt
https://domain-kamu.up.railway.app/auth/discord/callback
```

## Start

```bash
npm install
npm start
```
