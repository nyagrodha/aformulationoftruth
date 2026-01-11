import express from 'express';
import crypto from 'crypto';

const router = express.Router();

// PostgreSQL client - will be set by server.js
let dbClient = null;

export function setDatabaseClient(client) {
  dbClient = client;
}

// Generate unique profile slug from email/username
function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

// POST /api/profile/create - Create a public profile
router.post('/create', async (req, res) => {
  const { email, profileSlug, bio, visibility = 'public' } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Check if user exists and has phone verification
    const userResult = await dbClient.query(
      `SELECT id, username, email, phone_verified, profile_slug
       FROM users WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Require phone verification before profile creation
    if (!user.phone_verified) {
      return res.status(403).json({
        error: 'Phone verification required before creating a public profile',
        requiresPhoneVerification: true
      });
    }

    // Check if user already has a profile
    if (user.profile_slug) {
      return res.status(409).json({
        error: 'Profile already exists',
        profileSlug: user.profile_slug
      });
    }

    // Generate or validate profile slug
    let finalSlug = profileSlug || generateSlug(user.username || user.email);

    // Ensure slug is unique
    const slugCheck = await dbClient.query(
      'SELECT id FROM users WHERE profile_slug = $1',
      [finalSlug]
    );

    if (slugCheck.rows.length > 0) {
      // Add random suffix to make it unique
      const randomSuffix = crypto.randomBytes(3).toString('hex');
      finalSlug = `${finalSlug}-${randomSuffix}`;
    }

    // Validate slug format (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(finalSlug)) {
      return res.status(400).json({
        error: 'Invalid slug format. Use only lowercase letters, numbers, and hyphens.'
      });
    }

    // Update user with profile info
    await dbClient.query(
      `UPDATE users
       SET profile_slug = $1, bio = $2, profile_visibility = $3
       WHERE id = $4`,
      [finalSlug, bio || null, visibility, user.id]
    );

    console.log(`✓ Profile created for ${email}: /u/${finalSlug}`);

    res.json({
      message: 'Profile created successfully',
      profileSlug: finalSlug,
      profileUrl: `/u/${finalSlug}`,
      visibility: visibility
    });

  } catch (error) {
    console.error('Error creating profile:', error);
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

// GET /api/profile/:slug - Get public profile by slug
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    // Get user profile
    const result = await dbClient.query(
      `SELECT
         u.username,
         u.email,
         u.profile_slug,
         u.bio,
         u.profile_visibility,
         u.created_at
       FROM users u
       WHERE u.profile_slug = $1`,
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profile = result.rows[0];

    // Check visibility
    if (profile.profile_visibility === 'private') {
      return res.status(403).json({ error: 'This profile is private' });
    }

    // Get user ID first
    const userIdResult = await dbClient.query(
      `SELECT id FROM users WHERE email = $1`,
      [profile.email]
    );

    let answers = {};

    if (userIdResult.rows.length > 0) {
      const userId = userIdResult.rows[0].id;

      // Get questionnaire responses for this user
      const answersResult = await dbClient.query(
        `SELECT question_index, answer_text
         FROM user_answers
         WHERE user_id = $1
         ORDER BY question_index`,
        [userId]
      );

      answersResult.rows.forEach(row => {
        answers[row.question_index] = row.answer_text;
      });
    }

    res.json({
      username: profile.username,
      slug: profile.profile_slug,
      bio: profile.bio,
      memberSince: profile.created_at,
      answers: answers,
      answeredQuestions: Object.keys(answers).length
    });

  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PATCH /api/profile/update - Update profile
router.patch('/update', async (req, res) => {
  const { email, bio, visibility } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Check if user exists
    const userResult = await dbClient.query(
      'SELECT id, profile_slug FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (!user.profile_slug) {
      return res.status(404).json({ error: 'No profile exists for this user' });
    }

    // Build update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (bio !== undefined) {
      updates.push(`bio = $${paramCount}`);
      values.push(bio);
      paramCount++;
    }

    if (visibility !== undefined) {
      if (!['public', 'private'].includes(visibility)) {
        return res.status(400).json({ error: 'Invalid visibility. Use "public" or "private".' });
      }
      updates.push(`profile_visibility = $${paramCount}`);
      values.push(visibility);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(user.id);

    await dbClient.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    console.log(`✓ Profile updated for ${email}`);

    res.json({
      message: 'Profile updated successfully',
      profileSlug: user.profile_slug
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// DELETE /api/profile/delete - Delete profile (makes private, keeps data)
router.delete('/delete', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const result = await dbClient.query(
      `UPDATE users
       SET profile_slug = NULL, profile_visibility = 'private', bio = NULL
       WHERE email = $1
       RETURNING id`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✓ Profile deleted for ${email}`);

    res.json({
      message: 'Profile deleted successfully. Your questionnaire data has been preserved.'
    });

  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// GET /api/profile/check - Check if user can create profile
router.get('/check', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const result = await dbClient.query(
      `SELECT phone_verified, profile_slug
       FROM users WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      canCreateProfile: user.phone_verified && !user.profile_slug,
      phoneVerified: user.phone_verified || false,
      hasProfile: !!user.profile_slug,
      profileSlug: user.profile_slug
    });

  } catch (error) {
    console.error('Error checking profile eligibility:', error);
    res.status(500).json({ error: 'Failed to check profile status' });
  }
});

export default router;
