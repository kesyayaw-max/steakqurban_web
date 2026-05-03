require("dotenv").config();

const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const site = {
  name: process.env.SERVER_NAME || "SteakQurban",
  tagline: process.env.SERVER_TAGLINE || "Premium Discord Community",
  invite: process.env.DISCORD_INVITE || "https://discord.gg/yourinvite",
  callbackUrl: process.env.DISCORD_CALLBACK_URL || "",
};

let mainDB = null;
let securityDB = null;

async function connectDatabases() {
  if (process.env.MAIN_MONGO_URI) {
    mainDB = mongoose.createConnection(process.env.MAIN_MONGO_URI);
    mainDB.on("connected", () => console.log("MAIN MongoDB connected."));
    mainDB.on("error", (err) => console.log("MAIN MongoDB error:", err.message));
  }

  if (process.env.SECURITY_MONGO_URI) {
    securityDB = mongoose.createConnection(process.env.SECURITY_MONGO_URI);
    securityDB.on("connected", () => console.log("SECURITY MongoDB connected."));
    securityDB.on("error", (err) => console.log("SECURITY MongoDB error:", err.message));
  }
}

const anySchema = new mongoose.Schema({}, { strict: false });

function modelOrNull(conn, name, collection) {
  if (!conn) return null;
  return conn.models[name] || conn.model(name, anySchema, collection);
}

function getModels() {
  return {
    Leaderboard: modelOrNull(mainDB, "LeaderboardUser", process.env.LEADERBOARD_COLLECTION || "leaderboardusers"),
    MainUsers: modelOrNull(mainDB, "MainUser", process.env.USERS_COLLECTION || "users"),
    SiteEvent: modelOrNull(mainDB, "SiteEvent", "siteevents"),
    GuildConfig: modelOrNull(securityDB, "GuildConfig", "guildconfigs"),
    UserWarn: modelOrNull(securityDB, "UserWarn", "userwarns"),
  };
}

async function safeFind(model, query = {}, options = {}) {
  if (!model) return [];
  try {
    let q = model.find(query);
    if (options.sort) q = q.sort(options.sort);
    if (options.limit) q = q.limit(options.limit);
    return await q.lean();
  } catch {
    return [];
  }
}

async function safeCount(model, query = {}) {
  if (!model) return 0;
  try { return await model.countDocuments(query); } catch { return 0; }
}

const defaultEvents = [
  { title: "Voice Kings Monthly", category: "Leaderboard", status: "Active", date: "Setiap Bulan", prize: "Coins + Role Special", desc: "Ranking member paling aktif di voice.", accent: "gold" },
  { title: "Giveaway Community", category: "Giveaway", status: "Soon", date: "Weekend", prize: "Nitro / Coins / Role", desc: "Giveaway rutin untuk member aktif.", accent: "purple" },
  { title: "Game Night", category: "Mini Games", status: "Soon", date: "Jumat Malam", prize: "XP + Coins", desc: "Main bareng, quiz, dan challenge.", accent: "pink" },
];

function normalizeLeaderboard(rows) {
  return rows.map((u, i) => ({
    rank: u.rank || i + 1,
    name: u.username || u.name || u.tag || u.userTag || u.displayName || u.userId || "Unknown",
    time: u.time || u.voiceTimeText || u.stat || msToTime(u.voiceTime || u.totalVoice || u.voiceMs || 0),
    xp: u.xp || u.levelXp || u.exp || 0,
    coins: u.coins || u.coin || u.balance || 0,
  }));
}

function msToTime(ms) {
  const totalMin = Math.floor(Number(ms || 0) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h && !m) return "-";
  return `${h}j ${m}m`;
}

async function getLeaderboard() {
  const { Leaderboard, MainUsers } = getModels();
  let rows = await safeFind(Leaderboard, {}, { sort: { xp: -1, coins: -1, voiceTime: -1 }, limit: 10 });
  if (!rows.length) rows = await safeFind(MainUsers, {}, { sort: { xp: -1, coins: -1, voiceTime: -1 }, limit: 10 });
  return normalizeLeaderboard(rows);
}

async function getEvents() {
  const { SiteEvent } = getModels();
  const rows = await safeFind(SiteEvent, {}, { sort: { createdAt: 1 }, limit: 20 });
  return rows.length ? rows : defaultEvents;
}

async function getSecurityConfigs() {
  const { GuildConfig } = getModels();
  return safeFind(GuildConfig, {}, { sort: { updatedAt: -1 }, limit: 10 });
}

async function getDashboardData() {
  const { Leaderboard, MainUsers, GuildConfig, UserWarn } = getModels();
  const [leaderboard, events, configs] = await Promise.all([
    getLeaderboard(),
    getEvents(),
    getSecurityConfigs(),
  ]);

  const mainUsers = await safeCount(MainUsers);
  const leaderboardCount = await safeCount(Leaderboard);
  const warnCount = await safeCount(UserWarn);

  const cfg = configs[0] || {};

  return {
    leaderboard,
    events,
    configs,
    stats: {
      mainDb: mainDB?.readyState === 1 ? "Connected" : "Offline",
      securityDb: securityDB?.readyState === 1 ? "Connected" : "Offline",
      linkedServers: configs.length,
      mainUsers,
      leaderboardCount,
      warnCount,
      security: cfg.securityEnabled ? "ON" : "OFF",
      antiSpam: cfg.antiSpam ? "ON" : "OFF",
      antiNuke: cfg.antiNuke ? "ON" : "OFF",
      spamLimit: cfg.spamLimit || 7,
      mentionLimit: cfg.mentionLimit || 5,
      capsPercent: cfg.capsPercent || 80,
      punishmentDuration: cfg.punishmentDuration || "10m",
    }
  };
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: process.env.WEB_SECRET || "steakqurban-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));

function adminIds() {
  return String(process.env.WEB_ADMIN_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isAdminUser(user) {
  return !!user?.id && adminIds().includes(user.id);
}

function requireLogin(req, res, next) {
  if (req.session?.discordUser) return next();
  return res.redirect("/auth/discord");
}

function requireAdmin(req, res, next) {
  if (req.session?.discordUser && isAdminUser(req.session.discordUser)) return next();
  if (req.session?.discordUser) return res.status(403).render("forbidden", { site, user: req.session.discordUser });
  return res.redirect("/auth/discord");
}

function discordAvatar(user) {
  if (!user?.avatar) return "https://cdn.discordapp.com/embed/avatars/0.png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

function discordOAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID || "",
    redirect_uri: process.env.DISCORD_CALLBACK_URL || "",
    response_type: "code",
    scope: "identify",
    prompt: "consent",
  });

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

app.get("/", async (req, res) => {
  res.render("home", { site, ...(await getDashboardData()) });
});

app.get("/events", async (req, res) => {
  res.render("events", { site, events: await getEvents() });
});

app.get("/leaderboard", async (req, res) => {
  res.render("leaderboard", { site, leaderboard: await getLeaderboard() });
});

app.get("/admin/login", (req, res) => {
  return res.redirect("/auth/discord");
});

app.get("/auth/discord", (req, res) => {
  return res.redirect(discordOAuthUrl());
});

app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect("/");

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || "",
        client_secret: process.env.DISCORD_CLIENT_SECRET || "",
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_CALLBACK_URL || "",
      }),
    });

    const token = await tokenRes.json();
    if (!token.access_token) return res.redirect("/");

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    const user = await userRes.json();
    req.session.discordUser = {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar,
      discriminator: user.discriminator,
    };

    return res.redirect(isAdminUser(req.session.discordUser) ? "/admin" : "/me");
  } catch (err) {
    console.log("Discord OAuth error:", err.message);
    return res.redirect("/");
  }
});

app.post("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

async function findCurrentUserStats(discordUser) {
  if (!discordUser?.id) return null;
  const { Leaderboard, MainUsers } = getModels();

  const queries = [
    { userId: discordUser.id },
    { discordId: discordUser.id },
    { id: discordUser.id },
  ];

  for (const model of [Leaderboard, MainUsers]) {
    if (!model) continue;
    for (const query of queries) {
      try {
        const row = await model.findOne(query).lean();
        if (row) return normalizeLeaderboard([row])[0];
      } catch {}
    }
  }

  return {
    rank: "-",
    name: discordUser.global_name || discordUser.username,
    time: "-",
    xp: 0,
    coins: 0,
  };
}

app.get("/me", requireLogin, async (req, res) => {
  const data = await getDashboardData();
  const profile = await findCurrentUserStats(req.session.discordUser);

  res.render("me", {
    site,
    user: req.session.discordUser,
    avatar: discordAvatar(req.session.discordUser),
    profile,
    ...data,
  });
});

app.get("/api/me", requireLogin, async (req, res) => {
  res.json({
    user: req.session.discordUser,
    profile: await findCurrentUserStats(req.session.discordUser),
  });
});

app.post("/api/security/:id/toggle", requireAdmin, async (req, res) => {
  const { GuildConfig } = getModels();
  if (!GuildConfig) return res.status(500).json({ ok: false, error: "Security DB offline" });

  const field = req.body.field;
  const allowed = ["securityEnabled", "antiSpam", "antiInvite", "antiRaid", "antiNuke"];
  if (!allowed.includes(field)) return res.status(400).json({ ok: false, error: "Invalid field" });

  const cfg = await GuildConfig.findById(req.params.id).lean();
  if (!cfg) return res.status(404).json({ ok: false, error: "Config not found" });

  await GuildConfig.findByIdAndUpdate(req.params.id, { $set: { [field]: !cfg[field] } });
  res.json({ ok: true, field, value: !cfg[field] });
});


app.get("/admin", requireAdmin, async (req, res) => {
  res.render("admin", {
    site,
    user: req.session.discordUser,
    avatar: discordAvatar(req.session.discordUser),
    saved: req.query.saved === "1",
    ...(await getDashboardData())
  });
});

app.post("/admin/events", requireAdmin, async (req, res) => {
  const { SiteEvent } = getModels();
  if (!SiteEvent) return res.redirect("/admin?saved=0");

  await SiteEvent.create({
    title: req.body.title,
    category: req.body.category,
    status: req.body.status,
    date: req.body.date,
    prize: req.body.prize,
    desc: req.body.desc,
    accent: req.body.accent || "purple",
  });

  res.redirect("/admin?saved=1");
});

app.post("/admin/events/:id/delete", requireAdmin, async (req, res) => {
  const { SiteEvent } = getModels();
  if (SiteEvent) await SiteEvent.findByIdAndDelete(req.params.id).catch(() => {});
  res.redirect("/admin?saved=1");
});

app.post("/admin/security/:id", requireAdmin, async (req, res) => {
  const { GuildConfig } = getModels();
  if (!GuildConfig) return res.redirect("/admin?saved=0");

  await GuildConfig.findByIdAndUpdate(req.params.id, {
    $set: {
      securityEnabled: req.body.securityEnabled === "on",
      antiSpam: req.body.antiSpam === "on",
      antiInvite: req.body.antiInvite === "on",
      antiRaid: req.body.antiRaid === "on",
      antiNuke: req.body.antiNuke === "on",
      spamLimit: Number(req.body.spamLimit || 7),
      mentionLimit: Number(req.body.mentionLimit || 5),
      capsPercent: Number(req.body.capsPercent || 80),
      punishmentDuration: req.body.punishmentDuration || "10m",
    }
  });

  res.redirect("/admin?saved=1");
});

app.get("/api/live", async (req, res) => {
  res.json(await getDashboardData());
});

app.listen(PORT, async () => {
  await connectDatabases();
  console.log(`${site.name} full panel live aktif di port ${PORT}`);
});
