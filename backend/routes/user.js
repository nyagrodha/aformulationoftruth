// routes/user.js
import express from 'express';
import { verifyToken } from '../middleware/auth.js';
const router = express.Router();

let dbClient = null;

export function setDatabaseClient(client) {
  dbClient = client;
}

// Get current user info - requires authentication
router.get('/me', verifyToken, async (req, res) => {
  try {
    const email = req.user.email;

    if (!email) {
      return res.status(400).json({ error: 'Email not found in token' });
    }

    // Get user from database
    if (dbClient) {
      const result = await dbClient.query(
        'SELECT id, email, username, display_name, created_at, is_admin FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0];
        return res.json({
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.display_name || user.username,
          isAdmin: user.is_admin || false,
          createdAt: user.created_at
        });
      }
    }

    // If user not in database, return minimal info from token
    res.json({
      email: email,
      username: email.split('@')[0],
      displayName: email.split('@')[0]
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    res.status(500).json({ error: 'Failed to get user information' });
  }
});

export default router;
