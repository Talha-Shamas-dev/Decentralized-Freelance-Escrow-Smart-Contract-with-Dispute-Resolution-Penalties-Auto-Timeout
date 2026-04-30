// src/routes/admin.js
import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

// ── GET /admin/stats ────────────────────────────────────────
/**
 * Dashboard stats for admin panel.
 */
router.get('/stats', async (req, res) => {
  try {
    const [
      userStats,
      escrowStats,
      recentActivity,
      topClients,
    ] = await Promise.all([

      // User stats
      pool.query(`
        SELECT
          COUNT(*)                                     AS total_users,
          COUNT(*) FILTER (WHERE role = 'admin')       AS admin_count,
          COUNT(*) FILTER (WHERE is_active = FALSE)    AS inactive_users,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_this_week
        FROM users
      `),

      // Escrow stats
      pool.query(`
        SELECT
          COUNT(*)                                            AS total_escrows,
          COUNT(*) FILTER (WHERE status = 'Active')           AS active,
          COUNT(*) FILTER (WHERE status = 'Released')         AS released,
          COUNT(*) FILTER (WHERE status = 'Cancelled')        AS cancelled,
          COUNT(*) FILTER (WHERE status = 'Disputed')         AS disputed,
          SUM(amount_wei::NUMERIC)                            AS total_volume_wei,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS created_today
        FROM off_chain_escrows
      `),

      // Recent escrow activity (last 10)
      pool.query(`
        SELECT chain_escrow_id, client_address, freelancer_address,
               amount_wei, status, created_at
        FROM off_chain_escrows
        ORDER BY created_at DESC
        LIMIT 10
      `),

      // Top clients by escrow count
      pool.query(`
        SELECT client_address, COUNT(*) AS escrow_count,
               SUM(amount_wei::NUMERIC) AS total_volume_wei
        FROM off_chain_escrows
        GROUP BY client_address
        ORDER BY escrow_count DESC
        LIMIT 5
      `),
    ]);

    return res.json({
      users:           userStats.rows[0],
      escrows:         escrowStats.rows[0],
      recent_activity: recentActivity.rows,
      top_clients:     topClients.rows,
      generated_at:    new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /admin/stats]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /admin/users ────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { page = '1', limit = '50', search } = req.query;
  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, parseInt(limit));
  const offset   = (pageNum - 1) * limitNum;

  try {
    const conditions = [];
    const values     = [];
    let   idx        = 1;

    if (search) {
      conditions.push(`(wallet_address ILIKE $${idx} OR username ILIKE $${idx} OR email ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) FROM users ${where}`, values);
    const dataRes  = await pool.query(
      `SELECT id, wallet_address, username, email, role, is_active, created_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limitNum, offset]
    );

    return res.json({
      data: dataRes.rows,
      meta: {
        total: parseInt(countRes.rows[0].count),
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    console.error('[GET /admin/users]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /admin/users/:id ──────────────────────────────────
router.patch('/users/:id', async (req, res) => {
  const { is_active, role } = req.body;
  const updates = [];
  const values  = [];
  let   idx     = 1;

  if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }
  if (role !== undefined) {
    if (!['user','admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    updates.push(`role = $${idx++}`);
    values.push(role);
  }

  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  try {
    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${idx}
       RETURNING id, wallet_address, role, is_active`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    // Log admin action
    await pool.query(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, metadata, ip_address)
       VALUES ($1, $2, 'user', $3, $4, $5)`,
      [
        req.user.id,
        'update_user',
        req.params.id,
        JSON.stringify(req.body),
        req.ip,
      ]
    );

    return res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /admin/users/:id]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /admin/logs ─────────────────────────────────────────
router.get('/logs', async (req, res) => {
  const { page = '1', limit = '50' } = req.query;
  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, parseInt(limit));
  const offset   = (pageNum - 1) * limitNum;

  try {
    const { rows } = await pool.query(
      `SELECT al.*, u.wallet_address AS admin_wallet
       FROM admin_logs al
       JOIN users u ON u.id = al.admin_id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limitNum, offset]
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('[GET /admin/logs]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
