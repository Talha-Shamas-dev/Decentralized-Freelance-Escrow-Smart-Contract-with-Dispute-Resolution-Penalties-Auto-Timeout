// src/routes/auth.js – minimal, reliable wallet-login
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = Router();

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, wallet: user.wallet_address },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

router.post('/wallet-login', async (req, res) => {
  const { address, signature, message } = req.body;
  if (!address) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const walletLower = address.toLowerCase();

  try {
    // Upsert user – create if not exists, else update timestamp
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

    const accessToken = signAccessToken(user);

    // Frontend expects a refresh_token – we return a dummy value
    res.json({
      access_token: accessToken,
      refresh_token: 'dummy',
      user: { id: user.id, wallet_address: user.wallet_address, role: user.role }
    });
  } catch (err) {
    console.error('[POST /auth/wallet-login]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/refresh', (req, res) => {
  res.status(501).json({ error: 'Refresh not implemented yet' });
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

export default router;