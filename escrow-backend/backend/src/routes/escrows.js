// src/routes/escrows.js
import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /escrows/my – returns escrows where user is a party
router.get('/my', requireAuth, async (req, res) => {
  // 🔥 TEMPORARY: return empty array without any DB query
  // Replace this when you want the real query
  return res.json([]);

  /* REAL QUERY (uncomment after debugging)
  try {
    const wallet = req.user.wallet_address;
    if (!wallet) {
      return res.status(400).json({ error: 'No wallet address in token' });
    }
    const { rows } = await pool.query(
      `SELECT id, chain_escrow_id, tx_hash, client_address, freelancer_address, arbiter_address,
              amount_wei, deadline_ts, status, title, description, tags, created_at
       FROM off_chain_escrows
       WHERE client_address = $1 OR freelancer_address = $1 OR arbiter_address = $1
       ORDER BY created_at DESC`,
      [wallet]
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /escrows/my]', err);
    res.status(500).json({ error: err.message });
  }
  */
});

// POST /escrows – store off‑chain metadata
router.post('/', requireAuth, async (req, res) => {
  // your existing POST code here (unchanged)
  // ...
});

export default router;