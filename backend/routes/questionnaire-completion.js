// routes/questionnaire-completion.js

import express from 'express';
import PDFGenerator from '../utils/pdf-generator.js';
import { sendQuestionnairePDF } from '../utils/mailer.js';
import { decryptGeolocation } from '../utils/crypto.js';

const router = express.Router();

let dbClient = null;
let pdfGenerator = null;

export const setDatabaseClient = (client) => {
  dbClient = client;
};

export const setPDFGenerator = (generator) => {
  pdfGenerator = generator;
};

// Initialize PDF generator if not provided
if (!pdfGenerator) {
  pdfGenerator = new PDFGenerator();
}

/**
 * Complete questionnaire and send PDF
 * POST /api/questionnaire/complete
 *
 * Supports both web users (JWT auth) and Telegram users (platform detection)
 */
router.post('/complete', async (req, res) => {
  if (!dbClient) {
    return res.status(500).json({ error: 'Database not connected' });
  }

  try {
    // Get user info from authenticated JWT token
    const email = req.user?.email;

    if (!email) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid authentication token required'
      });
    }

    console.log(`\n📋 Processing questionnaire completion for: ${email}`);

    // Get user from database
    const userResult = await dbClient.query(
      'SELECT id, email, username, display_name FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check if questionnaire is actually complete (all 35 questions answered)
    const answersResult = await dbClient.query(
      'SELECT COUNT(*) as count FROM user_answers WHERE user_id = $1',
      [user.id]
    );

    const answerCount = parseInt(answersResult.rows[0].count, 10);

    if (answerCount < 35) {
      return res.status(400).json({
        error: 'Questionnaire incomplete',
        message: `Only ${answerCount} of 35 questions answered`,
        answersCount: answerCount,
        totalQuestions: 35
      });
    }

    console.log(`✓ Verified all 35 questions answered for user ${user.id}`);

    // Get all questions with their text
    const questionsResult = await dbClient.query(`
      SELECT question_id, question_text
      FROM questionnaire_question_order
      WHERE session_id = $1
      ORDER BY question_position ASC
    `, [email]);

    // Get all user answers (encrypted)
    const answersDbResult = await dbClient.query(
      `SELECT question_id, question_index, answer_text, created_at
       FROM user_answers
       WHERE user_id = $1
       ORDER BY answer_sequence ASC`,
      [user.id]
    );

    // Get JWT token from request header for decryption
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      return res.status(401).json({
        error: 'Token required for decryption',
        message: 'Authorization bearer token needed to decrypt answers'
      });
    }

    // Decrypt answers and match with questions
    const responses = [];
    const questionMap = new Map();

    questionsResult.rows.forEach(q => {
      questionMap.set(q.question_id, q.question_text);
    });

    for (const answerRow of answersDbResult.rows) {
      try {
        const decryptedAnswer = decryptGeolocation(answerRow.answer_text, token);
        const questionText = questionMap.get(answerRow.question_id) || `Question ${answerRow.question_id + 1}`;

        responses.push({
          question: questionText,
          answer: decryptedAnswer
        });
      } catch (decryptError) {
        console.error(`Failed to decrypt answer for question ${answerRow.question_id}:`, decryptError.message);
        // Use encrypted version as fallback
        responses.push({
          question: questionMap.get(answerRow.question_id) || `Question ${answerRow.question_id + 1}`,
          answer: '[Encrypted - decryption failed]'
        });
      }
    }

    console.log(`✓ Decrypted ${responses.length} answers`);

    // Generate PDF
    console.log('📄 Generating PDF...');
    const pdfResult = await pdfGenerator.generateQuestionnairePDF(responses, email);

    if (!pdfResult.success) {
      console.error('PDF generation failed:', pdfResult.error);
      return res.status(500).json({
        error: 'PDF generation failed',
        details: pdfResult.error
      });
    }

    console.log(`✓ PDF generated: ${pdfResult.filepath}`);

    // Determine platform and delivery method
    const sessionResult = await dbClient.query(
      'SELECT platform, platform_username FROM questionnaire_sessions WHERE email = $1',
      [email]
    );

    const platform = sessionResult.rows[0]?.platform || 'web';
    const platformUsername = sessionResult.rows[0]?.platform_username;

    console.log(`📱 Platform: ${platform}`);

    // Send PDF via appropriate channel
    let deliveryResult;

    if (platform === 'telegram' && platformUsername) {
      // Send via Telegram bot
      console.log(`📲 Sending PDF via Telegram to: ${platformUsername}`);
      try {
        // Import Telegram bot dynamically
        const { default: KaruppasāmiBot } = await import('../bots/karuppasami-telegram.js');
        const telegramBot = new KaruppasāmiBot();

        await telegramBot.sendPDF(platformUsername, pdfResult.filepath,
          'Your Proust Questionnaire responses are ready! 🎉\n\nThank you for your introspection.');

        deliveryResult = {
          success: true,
          method: 'telegram',
          recipient: platformUsername
        };
        console.log(`✓ PDF sent via Telegram to ${platformUsername}`);
      } catch (telegramError) {
        console.error('Telegram delivery failed:', telegramError.message);
        // Fallback to email if Telegram fails
        console.log('Falling back to email delivery...');
        deliveryResult = await sendQuestionnairePDF(email, pdfResult.filepath, user.username || email.split('@')[0]);
        deliveryResult.method = 'email_fallback';
      }
    } else {
      // Send via email (web users or fallback)
      console.log(`📧 Sending PDF via email to: ${email}`);
      deliveryResult = await sendQuestionnairePDF(email, pdfResult.filepath, user.username || email.split('@')[0]);
      deliveryResult.method = 'email';
    }

    // Mark session as completed
    await dbClient.query(
      `UPDATE questionnaire_sessions
       SET completed = TRUE, completed_at = NOW()
       WHERE email = $1`,
      [email]
    );

    console.log(`✅ Questionnaire completion processed successfully for ${email}\n`);

    // Return success response
    res.json({
      success: true,
      message: 'Questionnaire completed successfully',
      pdf: {
        generated: true,
        filename: pdfResult.filename
      },
      delivery: {
        method: deliveryResult.method,
        success: deliveryResult.success,
        recipient: deliveryResult.recipient || email,
        timestamp: deliveryResult.timestamp
      },
      questionnaire: {
        totalQuestions: 35,
        answersCount: responses.length,
        completedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error processing questionnaire completion:', error);
    res.status(500).json({
      error: 'Failed to process completion',
      details: error.message
    });
  }
});

export default router;
