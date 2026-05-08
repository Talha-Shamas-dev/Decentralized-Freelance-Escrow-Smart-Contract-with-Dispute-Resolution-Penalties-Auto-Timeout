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

router.post('/wallet-login', async (req, res) => {
  const { address, signature, message } = req.body;
  if (!address) {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  const walletLower = address.toLowerCase();

  try {
    // Try to update first (if user exists)
    const updateRes = await pool.query(
      `UPDATE users SET updated_at = NOW() WHERE wallet_address = $1 RETURNING id, wallet_address, role, is_active`,
      [walletLower]
    );

    let user;
    if (updateRes.rows.length === 0) {
      // User doesn't exist – insert new
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
    console.error('[ERROR] /wallet-login:', err);
    res.status(500).json({ error: err.message });
  }
});

// Other routes (register, refresh, etc.) – keep as placeholders
router.post('/refresh', (req, res) => res.status(501).json({ error: 'Not implemented' }));
router.post('/logout', (req, res) => res.json({ message: 'Logged out' }));
router.get('/me', (req, res) => res.status(501).json({ error: 'Not implemented' }));

export default router;