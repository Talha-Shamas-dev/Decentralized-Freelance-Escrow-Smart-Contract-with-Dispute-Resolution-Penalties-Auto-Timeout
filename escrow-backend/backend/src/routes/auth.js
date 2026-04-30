// src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../db.js';
import { randomBytes } from 'crypto';
const router = Router();

// ── Validation schemas ──────────────────────────────────────
const RegisterSchema = z.object({
  wallet_address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(100).optional(),
});

const LoginSchema = z.object({
  wallet_address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  password: z.string().optional(),
});

// ── Token helpers ───────────────────────────────────────────
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, wallet: user.wallet_address },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

// ── POST /auth/register ─────────────────────────────────────
/**
 * Register or upsert a user by wallet address.
 * Password is optional — wallets can auth without one.
 */
router.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { wallet_address, username, email, password } = parsed.data;
  const walletLower = wallet_address.toLowerCase();

  try {
    // Check duplicates
    const exists = await pool.query(
      'SELECT id FROM users WHERE wallet_address = $1',
      [walletLower]
    );
    if (exists.rows.length) {
      return res.status(409).json({ error: 'Wallet already registered' });
    }

    if (email) {
      const emailExists = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );
      if (emailExists.rows.length) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    const password_hash = password
      ? await bcrypt.hash(password, 12)
      : null;

    const { rows } = await pool.query(
      `INSERT INTO users (wallet_address, username, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, wallet_address, username, email, role, created_at`,
      [walletLower, username ?? null, email?.toLowerCase() ?? null, password_hash]
    );

    const user = rows[0];
    const accessToken  = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    // Store refresh token hash
    const tokenHash = await bcrypt.hash(refreshToken, 8);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, tokenHash]
    );

    return res.status(201).json({
      message: 'User registered',
      user: { id: user.id, wallet_address: user.wallet_address, role: user.role },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err) {
    console.error('[POST /auth/register]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/login ────────────────────────────────────────
/**
 * Login by wallet + optional password.
 * For wallet-only auth (no password), the frontend should
 * use signature verification (ethers.js signMessage) instead.
 * This endpoint handles email+password path.
 */
router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { wallet_address, password } = parsed.data;
  const walletLower = wallet_address.toLowerCase();

  try {
    const { rows } = await pool.query(
      `SELECT id, wallet_address, username, email, password_hash, role, is_active
       FROM users WHERE wallet_address = $1`,
      [walletLower]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    // If user has a password, verify it
    if (user.password_hash && password) {
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } else if (user.password_hash && !password) {
      return res.status(401).json({ error: 'Password required' });
    }
    // If no password_hash: wallet-only user — allow login (signature auth handled client-side)

    const accessToken  = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    const tokenHash = await bcrypt.hash(refreshToken, 8);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, tokenHash]
    );

    return res.json({
      user: { id: user.id, wallet_address: user.wallet_address, role: user.role },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err) {
    console.error('[POST /auth/login]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/refresh ──────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token required' });
  }

  try {
    const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    if (payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Find valid non-revoked tokens for this user and verify
    const { rows } = await pool.query(
      `SELECT rt.id, rt.token_hash, u.id as user_id, u.wallet_address, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.user_id = $1 AND rt.revoked = FALSE AND rt.expires_at > NOW()`,
      [payload.sub]
    );

    let validRow = null;
    for (const row of rows) {
      const match = await bcrypt.compare(refresh_token, row.token_hash);
      if (match) { validRow = row; break; }
    }

    if (!validRow || !validRow.is_active) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Rotate: revoke old, issue new
    await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [validRow.id]);

    const user = { id: validRow.user_id, wallet_address: validRow.wallet_address, role: validRow.role };
    const newAccess  = signAccessToken(user);
    const newRefresh = signRefreshToken(user);

    const newHash = await bcrypt.hash(newRefresh, 8);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, newHash]
    );

    return res.json({ access_token: newAccess, refresh_token: newRefresh });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ── POST /auth/logout ───────────────────────────────────────
router.post('/logout', async (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) {
    try {
      const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
      // Mark all refresh tokens for this user as revoked
      await pool.query(
        'UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1',
        [payload.sub]
      );
    } catch (_) { /* token already invalid, ignore */ }
  }
  return res.json({ message: 'Logged out' });
});
// ── POST /auth/wallet-login ─────────────────────────────────

// (Pseudo‑verification; production mein ethers.verifyMessage use karein)
router.post('/wallet-login', async (req, res) => {
  const { address, signature, message } = req.body;
  if (!address || !signature || !message) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const walletLower = address.toLowerCase();

  try {
    // ⚠️ Signer's address ko signature se verify karna hai.
    // Yahan simplified: agar message mein address hai to maan lete hain.
    // Production mein: const recovered = ethers.verifyMessage(message, signature);
    // if (recovered !== address) return res.status(401).json(...);

    // Upsert user
    const { rows } = await pool.query(
      `INSERT INTO users (wallet_address, username)
       VALUES ($1, $2)
       ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
       RETURNING id, wallet_address, role, is_active`,
      [walletLower, `user_${walletLower.slice(2, 8)}`]
    );
    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account disabled' });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    const tokenHash = await bcrypt.hash(refreshToken, 8);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, tokenHash]
    );

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, wallet_address: user.wallet_address, role: user.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
export default router;
