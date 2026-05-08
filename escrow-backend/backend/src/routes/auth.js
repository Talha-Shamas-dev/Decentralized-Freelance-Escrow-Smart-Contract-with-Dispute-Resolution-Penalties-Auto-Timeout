// src/routes/auth.js
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

// POST /auth/wallet-login
router.post('/wallet-login', async (req, res) => {
  const { address, signature, message } = req.body;
  if (!address) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const walletLower = address.toLowerCase();

  try {
    // Update if exists, else insert
    const updateRes = await pool.query(
      `UPDATE users SET updated_at = NOW() WHERE wallet_address = $1 RETURNING id, wallet_address, role, is_active`,
      [walletLower]
    );

    let user;
    if (updateRes.rows.length === 0) {
      const insertRes = await pool.query(
        `INSERT INTO users (wallet_address, username)
         VALUES ($1, $2)
         RETURNING id, wallet_address, role, is_active`,
        [walletLower, `user_${walletLower.slice(2, 8)}`]
      );
      user = insertRes.rows[0];
    } else {
      user = updateRes.rows[0];
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account disabled' });
    }

    const accessToken = signAccessToken(user);
    res.json({
      access_token: accessToken,
      refresh_token: 'dummy',
      user: { id: user.id, wallet_address: user.wallet_address, role: user.role }
    });
  } catch (err) {
    console.error('[POST /wallet-login]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT id, wallet_address, username, email, role, is_active, created_at
       FROM users WHERE id = $1`,
      [payload.sub]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('[GET /auth/me]', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Other placeholder routes (keep as needed)
router.post('/refresh', (req, res) => res.status(501).json({ error: 'Not implemented' }));
router.post('/logout', (req, res) => res.json({ message: 'Logged out' }));

export default router;