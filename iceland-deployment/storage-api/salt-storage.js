/**
 * Remote Salt Storage API for Split-Key Architecture
 * Deployed on Iceland (gimbal.fobdongle.com) / Romania / onionhat.com
 *
 * Stores ONLY encryption salts - encrypted data remains on Finland server
 * Both components required for decryption = maximum security
 */

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const router = express.Router();

// PostgreSQL connection for remote server
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'salt_storage',
  user: process.env.DB_USER || 'salt_admin',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Initialize salt storage table
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS encryption_salts (
        id VARCHAR(64) PRIMARY KEY,
        salt TEXT NOT NULL,
        purpose VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        access_count INTEGER DEFAULT 0,
        metadata JSONB,
        expires_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_salts_purpose ON encryption_salts(purpose);
      CREATE INDEX IF NOT EXISTS idx_salts_created_at ON encryption_salts(created_at);
      CREATE INDEX IF NOT EXISTS idx_salts_expires_at ON encryption_salts(expires_at);

      -- Automatic cleanup of expired salts
      CREATE OR REPLACE FUNCTION cleanup_expired_salts()
      RETURNS void AS $$
      BEGIN
        DELETE FROM encryption_salts
        WHERE expires_at IS NOT NULL AND expires_at < NOW();
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('✅ Salt storage database initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// API Key authentication middleware
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const validKey = process.env.SALT_API_KEY;

  if (!validKey) {
    return res.status(500).json({
      success: false,
      error: 'Server configuration error: API key not set'
    });
  }

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid API key'
    });
  }

  next();
}

/**
 * POST /api/salts/store
 * Store a salt securely on remote server
 *
 * Body: {
 *   salt: string (base64),
 *   purpose: 'newsletter' | 'questionnaire' | 'profile',
 *   metadata: object (optional),
 *   expiresInDays: number (optional)
 * }
 */
router.post('/store', requireApiKey, async (req, res) => {
  try {
    const { salt, purpose, metadata, expiresInDays } = req.body;

    if (!salt || !purpose) {
      return res.status(400).json({
        success: false,
        error: 'Salt and purpose are required'
      });
    }

    // Generate unique ID for this salt
    const saltId = crypto.randomUUID();

    // Calculate expiration if specified
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    await pool.query(
      `INSERT INTO encryption_salts (id, salt, purpose, metadata, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [saltId, salt, purpose, JSON.stringify(metadata || {}), expiresAt]
    );

    res.status(201).json({
      success: true,
      saltId,
      message: 'Salt stored successfully on remote server',
      expiresAt
    });

  } catch (error) {
    console.error('Salt storage error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store salt'
    });
  }
});

/**
 * GET /api/salts/:saltId
 * Retrieve a salt from remote storage
 */
router.get('/:saltId', requireApiKey, async (req, res) => {
  try {
    const { saltId } = req.params;

    const result = await pool.query(
      `UPDATE encryption_salts
       SET accessed_at = CURRENT_TIMESTAMP,
           access_count = access_count + 1
       WHERE id = $1 AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING salt, purpose, created_at, access_count`,
      [saltId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Salt not found or expired'
      });
    }

    const saltData = result.rows[0];

    res.json({
      success: true,
      salt: saltData.salt,
      purpose: saltData.purpose,
      metadata: {
        createdAt: saltData.created_at,
        accessCount: saltData.access_count
      }
    });

  } catch (error) {
    console.error('Salt retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve salt'
    });
  }
});

/**
 * DELETE /api/salts/:saltId
 * Delete a salt (for unsubscribe/data deletion)
 */
router.delete('/:saltId', requireApiKey, async (req, res) => {
  try {
    const { saltId } = req.params;

    const result = await pool.query(
      `DELETE FROM encryption_salts WHERE id = $1 RETURNING id`,
      [saltId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Salt not found'
      });
    }

    res.json({
      success: true,
      message: 'Salt deleted successfully'
    });

  } catch (error) {
    console.error('Salt deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete salt'
    });
  }
});

/**
 * POST /api/salts/cleanup
 * Manual trigger for expired salt cleanup
 */
router.post('/cleanup', requireApiKey, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM encryption_salts
       WHERE expires_at IS NOT NULL AND expires_at < NOW()
       RETURNING id`
    );

    res.json({
      success: true,
      deletedCount: result.rows.length,
      message: `Cleaned up ${result.rows.length} expired salts`
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup expired salts'
    });
  }
});

/**
 * GET /api/salts/stats
 * Get statistics about salt storage (admin endpoint)
 */
router.get('/stats', requireApiKey, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        purpose,
        COUNT(*) as total,
        SUM(access_count) as total_accesses,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM encryption_salts
      WHERE expires_at IS NULL OR expires_at > NOW()
      GROUP BY purpose
    `);

    res.json({
      success: true,
      stats: result.rows
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  pool.query('SELECT NOW()', (err) => {
    if (err) {
      return res.status(503).json({
        success: false,
        error: 'Database connection failed'
      });
    }

    res.json({
      success: true,
      message: 'Salt storage API healthy',
      server: process.env.SERVER_NAME || 'remote',
      timestamp: new Date().toISOString()
    });
  });
});

// Initialize database on module load
initializeDatabase().catch(console.error);

module.exports = router;
