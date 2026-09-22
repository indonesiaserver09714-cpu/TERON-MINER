require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const BOT_TOKEN = process.env.BOT_TOKEN || "";

function verifyTelegramInitData(initData) {
  if (!BOT_TOKEN || !initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;
    params.delete("hash");

    const dataCheck = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secret = crypto
      .createHmac("sha256", "WebAppData")
      .update(BOT_TOKEN)
      .digest();

    const calculated = crypto
      .createHmac("sha256", secret)
      .update(dataCheck)
      .digest("hex");

    if (!crypto.timingSafeEqual(
      Buffer.from(calculated, "hex"),
      Buffer.from(hash, "hex")
    )) return null;

    const authDate = Number(params.get("auth_date") || 0);
    if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

    const user = JSON.parse(params.get("user") || "{}");
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

function auth(req, res, next) {
  const user = verifyTelegramInitData(req.headers["x-telegram-init-data"] || "");
  if (!user) return res.status(401).json({ error: "Invalid Telegram session" });
  req.tgUser = user;
  db.upsertUser(user);
  next();
}

function admin(req, res, next) {
  const ids = String(process.env.ADMIN_IDS || "")
    .split(",").map(x => x.trim()).filter(Boolean);
  if (!ids.includes(String(req.tgUser.id))) {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

app.get("/api/me", auth, (req, res) => {
  const mine = db.getMineable(req.tgUser);
  const u = mine.user;
  res.json({
    user: {
      id: u.id, username: u.username, firstName: u.first_name,
      wallet: u.wallet, balance: u.balance, totalMined: u.total_mined,
      level: u.level, miningRate: u.mining_rate,
      referrals: u.referrals, referralEarned: u.referral_earned,
      mineable: mine.amount,
      dailyClaimAt: u.daily_claim_at
    },
    config: {
      referralReward: Number(process.env.REFERRAL_REWARD || 100),
      minWithdraw: Number(process.env.MIN_WITHDRAW || 1000),
      botUsername: process.env.BOT_USERNAME || ""
    }
  });
});

app.post("/api/mine/claim", auth, (req, res) => {
  const amount = db.claimMining(req.tgUser.id);
  res.json({ ok: true, amount });
});

app.post("/api/daily", auth, (req, res) => {
  res.json(db.claimDaily(req.tgUser.id));
});

app.get("/api/tasks", auth, (req, res) => {
  res.json({ tasks: db.listTasks(req.tgUser.id) });
});

app.post("/api/tasks/:id/claim", auth, (req, res) => {
  res.json(db.claimTask(req.tgUser.id, Number(req.params.id)));
});

app.post("/api/wallet", auth, (req, res) => {
  const wallet = String(req.body.wallet || "").trim();
  if (!wallet || wallet.length < 20 || wallet.length > 200) {
    return res.status(400).json({ error: "Enter a valid wallet address." });
  }
  db.setWallet(req.tgUser.id, wallet);
  res.json({ ok: true });
});

app.post("/api/withdraw", auth, (req, res) => {
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount." });
  }
  res.json(db.createWithdrawal(req.tgUser.id, amount));
});

app.get("/api/withdrawals", auth, (req, res) => {
  res.json({ withdrawals: db.getWithdrawals(req.tgUser.id) });
});

app.post("/api/upgrade", auth, (req, res) => {
  res.json(db.upgradeLevel(req.tgUser.id));
});

app.get("/api/admin/tasks", auth, admin, (req, res) => {
  res.json({ tasks: db.db.prepare("SELECT * FROM tasks ORDER BY id DESC").all() });
});

app.post("/api/admin/tasks", auth, admin, (req, res) => {
  const title = String(req.body.title || "").trim();
  const url = String(req.body.url || "").trim();
  const reward = Number(req.body.reward);
  if (!title || !url || !Number.isFinite(reward) || reward <= 0) {
    return res.status(400).json({ error: "Title, URL and positive reward are required." });
  }
  const id = db.createTask(title, url, reward);
  res.json({ ok: true, id });
});

app.delete("/api/admin/tasks/:id", auth, admin, (req, res) => {
  db.deleteTask(Number(req.params.id));
  res.json({ ok: true });
});

app.get("/api/admin/withdrawals", auth, admin, (req, res) => {
  res.json({ withdrawals: db.getAdminWithdrawals() });
});

app.post("/api/admin/withdrawals/:id/status", auth, admin, (req, res) => {
  const status = String(req.body.status || "");
  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  res.json({ ok: true, withdrawal: db.setWithdrawalStatus(Number(req.params.id), status) });
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`TERON Miner running on port ${port}`));

require("./bot");
