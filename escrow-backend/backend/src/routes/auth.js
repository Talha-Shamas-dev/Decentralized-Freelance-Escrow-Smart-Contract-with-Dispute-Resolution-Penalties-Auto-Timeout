// src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../db.js';

const router = Router();

// ── Token helpers ───────────────────────────────────────────
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, wallet: user.wallet_address },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

// ── POST /auth/wallet-login (wallet + signature) ───────────
router.post('/wallet-login', async (req, res) => {
  console.log('[DEBUG] Request body:', req.body);
  const { address, signature, message } = req.body;
  if (!address) {
    console.error('[ERROR] Missing address');
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const walletLower = address.toLowerCase();

  try {
    console.log('[DEBUG] Upserting user for wallet:', walletLower);
    const { rows } = await pool.query(
      `INSERT INTO users (wallet_address, username)
       VALUES ($1, $2)
       ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
       RETURNING id, wallet_address, role, is_active`,
      [walletLower, `user_${walletLower.slice(2, 8)}`]
    );
    console.log('[DEBUG] User upserted:', rows[0]);

    const accessToken = jwt.sign(
      { sub: rows[0].id, role: rows[0].role, wallet: rows[0].wallet_address },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      access_token: accessToken,
      refresh_token: 'dummy',
      user: { id: rows[0].id, wallet_address: rows[0].wallet_address, role: rows[0].role }
    });
  } catch (err) {
    console.error('[ERROR] /wallet-login:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /auth/register ─────────────────────────────────────
router.post('/register', async (req, res) => {
  // Minimal implementation – you can keep your existing code or leave as placeholder
  res.status(501).json({ error: 'Not implemented yet' });
});

// ── POST /auth/login (email/password) ───────────────────────
router.post('/login', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// ── POST /auth/refresh ──────────────────────────────────────
router.post('/refresh', async (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// ── POST /auth/logout ───────────────────────────────────────
router.post('/logout', async (req, res) => {
  res.json({ message: 'Logged out' });
});

// ── GET /auth/me ────────────────────────────────────────────
router.get('/me', async (req, res) => {
  // Placeholder – in a real implementation you would requireAuth
  res.status(501).json({ error: 'Not implemented yet' });
});

export default router;