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

//// POST /auth/wallet-login (wallet + signature)
router.post('/wallet-login', async (req, res) => {
  const { address, signature, message } = req.body;
  if (!address) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const walletLower = address.toLowerCase();

  try {
    // Upsert user (create if not exists, else update timestamp)
    const { rows } = await pool.query(
      `INSERT INTO users (wallet_address, username)
       VALUES ($1, $2)
       ON CONFLICT (wallet_address) DO UPDATE SET updated_at = NOW()
       RETURNING id, wallet_address, role, is_active`,
      [walletLower, `user_${walletLower.slice(2, 8)}`]
    );

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account disabled' });
    }

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { sub: user.id, role: user.role, wallet: user.wallet_address },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );
    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Store refresh token hash (simplified; in production use bcrypt)
    const tokenHash = require('bcryptjs').hashSync(refreshToken, 8);
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
    console.error('[POST /auth/wallet-login]', err);
    res.status(500).json({ error: err.message });
  }
});