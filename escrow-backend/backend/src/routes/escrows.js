// src/routes/escrows.js
import { Router } from 'express';
import { z } from 'zod';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── Validation schemas ──────────────────────────────────────
const CreateEscrowSchema = z.object({
  chain_escrow_id:   z.number().int().nonnegative(),
  chain_id:          z.number().int().default(300),
  tx_hash:           z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  contract_address:  z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  client_address:    z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  freelancer_address:z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  arbiter_address:   z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount_wei:        z.string().regex(/^\d+$/),             // big number as string
  deadline_ts:       z.string().datetime(),
  title:             z.string().max(255).optional(),
  description:       z.string().max(5000).optional(),
  tags:              z.array(z.string().max(50)).max(10).optional(),
});

const UpdateStatusSchema = z.object({
  status: z.enum(['Active','Released','Cancelled','Disputed']),
});

const EvidenceSchema = z.object({
  evidence_type: z.enum(['text','url','ipfs_hash']),
  content: z.string().min(1).max(10000),
  description: z.string().max(500).optional(),
});

// ── GET /escrows ────────────────────────────────────────────
/**
 * Query: ?client=0x...  ?freelancer=0x...  ?arbiter=0x...
 *        ?status=Active  ?page=1  ?limit=20
 */
router.get('/', async (req, res) => {
  const {
    client, freelancer, arbiter,
    status, page = '1', limit = '20',
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (client) {
    conditions.push(`client_address = $${idx++}`);
    values.push(client.toLowerCase());
  }
  if (freelancer) {
    conditions.push(`freelancer_address = $${idx++}`);
    values.push(freelancer.toLowerCase());
  }
  if (arbiter) {
    conditions.push(`arbiter_address = $${idx++}`);
    values.push(arbiter.toLowerCase());
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    values.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // Total count
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM off_chain_escrows ${where}`,
      values
    );
    const total = parseInt(countRes.rows[0].count);

    // Data
    const dataRes = await pool.query(
      `SELECT
         id, chain_escrow_id, chain_id, tx_hash, contract_address,
         client_address, freelancer_address, arbiter_address,
         amount_wei, deadline_ts, status, title, description, tags,
         created_at, updated_at
       FROM off_chain_escrows
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limitNum, offset]
    );

    return res.json({
      data:  dataRes.rows,
      meta:  { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error('[GET /escrows]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /escrows/:id ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.*,
         (SELECT json_agg(de ORDER BY de.created_at DESC)
          FROM dispute_evidence de
          WHERE de.escrow_id = e.id) AS evidence
       FROM off_chain_escrows e
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Escrow not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[GET /escrows/:id]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
// ── GET /escrows/my ─────────────────────────────────────────
router.get('/my', requireAuth, async (req, res) => {
  const wallet = req.user.wallet_address; // requireAuth middleware ne user object attach kiya hoga
  if (!wallet) return res.status(401).json({ error: 'User wallet not found' });

  try {
    const { rows } = await pool.query(`
      SELECT id, chain_escrow_id, tx_hash, client_address, freelancer_address, arbiter_address,
             amount_wei, deadline_ts, status, title, description, tags, created_at
      FROM off_chain_escrows
      WHERE client_address = $1 OR freelancer_address = $1 OR arbiter_address = $1
      ORDER BY created_at DESC
    `, [wallet.toLowerCase()]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// ── POST /escrows ────────────────────────────────────────────
/**
 * Called by frontend after on-chain tx is confirmed.
 * Stores off-chain metadata + mirrors on-chain data for fast queries.
 */
router.post('/', requireAuth, async (req, res) => {
  const parsed = CreateEscrowSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const d = parsed.data;

  // Security: caller must be the client
  if (d.client_address.toLowerCase() !== req.user.wallet_address.toLowerCase()) {
    return res.status(403).json({ error: 'Only the client can register an escrow' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO off_chain_escrows (
         chain_escrow_id, chain_id, tx_hash, contract_address,
         client_address, freelancer_address, arbiter_address,
         amount_wei, deadline_ts, title, description, tags
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        d.chain_escrow_id, d.chain_id, d.tx_hash, d.contract_address.toLowerCase(),
        d.client_address.toLowerCase(),
        d.freelancer_address.toLowerCase(),
        d.arbiter_address.toLowerCase(),
        d.amount_wei, d.deadline_ts,
        d.title ?? null, d.description ?? null, d.tags ?? null,
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Escrow already registered (duplicate tx or chain ID)' });
    }
    console.error('[POST /escrows]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /escrows/:id/status ───────────────────────────────
/**
 * Sync on-chain status changes to off-chain DB.
 * In production, this should be called by an event listener,
 * not manually — but we expose it for now.
 */
router.patch('/:id/status', requireAuth, async (req, res) => {
  const parsed = UpdateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE off_chain_escrows SET status = $1
       WHERE id = $2
         AND (client_address = $3 OR freelancer_address = $3 OR arbiter_address = $3)
       RETURNING id, status`,
      [parsed.data.status, req.params.id, req.user.wallet_address.toLowerCase()]
    );
    if (!rows.length) return res.status(404).json({ error: 'Escrow not found or access denied' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /escrows/:id/status]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /escrows/:id/evidence ──────────────────────────────
router.post('/:id/evidence', requireAuth, async (req, res) => {
  const parsed = EvidenceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  try {
    // Verify caller is a party in this escrow
    const escrow = await pool.query(
      `SELECT id, status, client_address, freelancer_address, arbiter_address
       FROM off_chain_escrows WHERE id = $1`,
      [req.params.id]
    );
    if (!escrow.rows.length) return res.status(404).json({ error: 'Escrow not found' });

    const e = escrow.rows[0];
    const wallet = req.user.wallet_address.toLowerCase();
    const isParty = [e.client_address, e.freelancer_address, e.arbiter_address].includes(wallet);
    if (!isParty) return res.status(403).json({ error: 'Not a party in this escrow' });
    if (e.status !== 'Disputed') return res.status(400).json({ error: 'Escrow not in dispute' });

    const { rows } = await pool.query(
      `INSERT INTO dispute_evidence (escrow_id, submitted_by, evidence_type, content, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.id, wallet, parsed.data.evidence_type, parsed.data.content, parsed.data.description ?? null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /escrows/:id/evidence]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
