const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "teron.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  wallet TEXT DEFAULT '',
  balance REAL DEFAULT 0,
  total_mined REAL DEFAULT 0,
  mining_started_at INTEGER DEFAULT 0,
  mining_rate REAL DEFAULT 1,
  level INTEGER DEFAULT 1,
  referrals INTEGER DEFAULT 0,
  referral_earned REAL DEFAULT 0,
  daily_claim_at INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  reward REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_claims (
  user_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, task_id)
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  processed_at INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referral_claims (
  user_id INTEGER PRIMARY KEY,
  referrer_id INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL
);
`);

function now() { return Date.now(); }

function getUser(id) {
  return db.prepare("SELECT * FROM users WHERE id=?").get(id);
}

function upsertUser(tg) {
  const old = getUser(tg.id);
  const t = now();
  if (!old) {
    db.prepare(`
      INSERT INTO users
      (id,username,first_name,created_at,updated_at,mining_started_at)
      VALUES (?,?,?,?,?,?)
    `).run(tg.id, tg.username || "", tg.first_name || "", t, t, t);
  } else {
    db.prepare(`
      UPDATE users SET username=?, first_name=?, updated_at=? WHERE id=?
    `).run(tg.username || "", tg.first_name || "", t, tg.id);
  }
  return getUser(tg.id);
}

function getMineable(user) {
  const u = getUser(user.id);
  if (!u) return { amount: 0, user: null };
  const start = u.mining_started_at || now();
  const elapsed = Math.max(0, (now() - start) / 3600000);
  const amount = Math.max(0, elapsed * u.mining_rate);
  return { amount, user: u };
}

function claimMining(userId) {
  const result = getMineable({ id: userId });
  if (!result.user) throw new Error("USER_NOT_FOUND");
  const amount = result.amount;
  const t = now();
  db.prepare(`
    UPDATE users
    SET balance=balance+?, total_mined=total_mined+?, mining_started_at=?, updated_at=?
    WHERE id=?
  `).run(amount, amount, t, t, userId);
  return amount;
}

function claimDaily(userId) {
  const u = getUser(userId);
  const day = 24 * 60 * 60 * 1000;
  if (u.daily_claim_at && now() - u.daily_claim_at < day) {
    return { ok: false, reason: "ALREADY_CLAIMED" };
  }
  const reward = 15;
  db.prepare(`
    UPDATE users SET balance=balance+?, daily_claim_at=?, updated_at=? WHERE id=?
  `).run(reward, now(), now(), userId);
  return { ok: true, reward };
}

function listTasks(userId) {
  return db.prepare(`
    SELECT t.*, CASE WHEN c.user_id IS NULL THEN 0 ELSE 1 END AS claimed
    FROM tasks t
    LEFT JOIN task_claims c ON c.task_id=t.id AND c.user_id=?
    WHERE t.active=1 ORDER BY t.id DESC
  `).all(userId);
}

function createTask(title, url, reward) {
  return db.prepare(`
    INSERT INTO tasks(title,url,reward,created_at) VALUES(?,?,?,?)
  `).run(title, url, reward, now()).lastInsertRowid;
}

function deleteTask(id) {
  return db.prepare("UPDATE tasks SET active=0 WHERE id=?").run(id);
}

function claimTask(userId, taskId) {
  const task = db.prepare("SELECT * FROM tasks WHERE id=? AND active=1").get(taskId);
  if (!task) return { ok: false, reason: "TASK_NOT_FOUND" };
  const already = db.prepare(
    "SELECT 1 FROM task_claims WHERE user_id=? AND task_id=?"
  ).get(userId, taskId);
  if (already) return { ok: false, reason: "ALREADY_CLAIMED" };

  const t = now();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO task_claims(user_id,task_id,claimed_at) VALUES(?,?,?)"
    ).run(userId, taskId, t);
    db.prepare(
      "UPDATE users SET balance=balance+?,updated_at=? WHERE id=?"
    ).run(task.reward, t, userId);
  });
  tx();
  return { ok: true, reward: task.reward };
}

function setWallet(userId, wallet) {
  db.prepare("UPDATE users SET wallet=?,updated_at=? WHERE id=?")
    .run(wallet.trim(), now(), userId);
}

function createWithdrawal(userId, amount) {
  const u = getUser(userId);
  const min = Number(process.env.MIN_WITHDRAW || 1000);
  if (!u) return { ok: false, reason: "USER_NOT_FOUND" };
  if (!u.wallet) return { ok: false, reason: "WALLET_REQUIRED" };
  if (amount < min) return { ok: false, reason: "MIN_WITHDRAW", min };
  if (amount > u.balance) return { ok: false, reason: "INSUFFICIENT_BALANCE" };

  const t = now();
  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET balance=balance-?,updated_at=? WHERE id=?")
      .run(amount, t, userId);
    return db.prepare(`
      INSERT INTO withdrawals(user_id,wallet,amount,status,created_at)
      VALUES(?,?,?,?,?)
    `).run(userId, u.wallet, amount, "pending", t).lastInsertRowid;
  });
  return { ok: true, id: tx() };
}

function getWithdrawals(userId) {
  return db.prepare(
    "SELECT * FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 50"
  ).all(userId);
}

function getAdminWithdrawals() {
  return db.prepare(`
    SELECT w.*, u.username, u.first_name
    FROM withdrawals w JOIN users u ON u.id=w.user_id
    ORDER BY w.id DESC LIMIT 100
  `).all();
}

function setWithdrawalStatus(id, status) {
  const w = db.prepare("SELECT * FROM withdrawals WHERE id=?").get(id);
  if (!w) return null;
  if (w.status === status) return w;

  const t = now();
  const tx = db.transaction(() => {
    if (status === "rejected" && w.status === "pending") {
      db.prepare("UPDATE users SET balance=balance+?,updated_at=? WHERE id=?")
        .run(w.amount, t, w.user_id);
    }
    db.prepare(
      "UPDATE withdrawals SET status=?,processed_at=? WHERE id=?"
    ).run(status, t, id);
  });
  tx();
  return db.prepare("SELECT * FROM withdrawals WHERE id=?").get(id);
}

function addReferral(referrerId, newUserId) {
  if (!referrerId || referrerId === newUserId) return false;
  const newUser = getUser(newUserId);
  const referrer = getUser(referrerId);
  if (!newUser || !referrer) return false;
  const exists = db.prepare(
    "SELECT 1 FROM referral_claims WHERE user_id=?"
  ).get(newUserId);
  if (exists) return false;

  const reward = Number(process.env.REFERRAL_REWARD || 100);
  const t = now();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO referral_claims(user_id,referrer_id,claimed_at) VALUES(?,?,?)"
    ).run(newUserId, referrerId, t);
    db.prepare(`
      UPDATE users
      SET balance=balance+?,referrals=referrals+1,referral_earned=referral_earned+?,updated_at=?
      WHERE id=?
    `).run(reward, reward, t, referrerId);
  });
  tx();
  return true;
}

function upgradeLevel(userId) {
  const u = getUser(userId);
  if (!u) return { ok: false };
  const next = u.level + 1;
  const cost = Math.round(50 * Math.pow(1.55, u.level - 1));
  if (u.balance < cost) return { ok: false, reason: "INSUFFICIENT_BALANCE", cost };
  const newRate = Math.min(20, 1 + next * 0.35);
  db.prepare(`
    UPDATE users SET balance=balance-?,level=?,mining_rate=?,updated_at=? WHERE id=?
  `).run(cost, next, newRate, now(), userId);
  return { ok: true, level: next, cost, miningRate: newRate };
}

module.exports = {
  db, getUser, upsertUser, getMineable, claimMining, claimDaily,
  listTasks, createTask, deleteTask, claimTask, setWallet,
  createWithdrawal, getWithdrawals, getAdminWithdrawals,
  setWithdrawalStatus, addReferral, upgradeLevel
};
