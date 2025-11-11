// keybase-bot.js
import Bot from 'keybase-bot';
import crypto from 'crypto';
import { Client } from 'pg';

class KeybaseAuthBot {
  constructor() {
    this.bot = new Bot();
    this.activeTokens = new Map(); // Store active magic codes temporarily
    this.client = null;
  }

  async initialize() {
    try {
      // Initialize PostgreSQL connection
      this.client = new Client({
        connectionString: process.env.DATABASE_URL
      });

      await this.client.connect();
      console.log('Keybase bot: Connected to PostgreSQL database');

      // Create keybase_users table if it doesn't exist
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS keybase_users (
          id SERIAL PRIMARY KEY,
          keybase_username TEXT UNIQUE NOT NULL,
          email TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP,
          is_eligible_for_swap BOOLEAN DEFAULT false
        )
      `);

      // Create magic_codes table for temporary token storage
      await this.client.query(`
        CREATE TABLE IF NOT EXISTS magic_codes (
          id SERIAL PRIMARY KEY,
          keybase_username TEXT NOT NULL,
          magic_code TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          used BOOLEAN DEFAULT false
        )
      `);

      // Initialize Keybase bot
      await this.bot.init(process.env.KEYBASE_USERNAME, process.env.KEYBASE_PAPER_KEY, {
        verbose: false,
        botLite: false
      });

      console.log('Keybase bot initialized successfully');

      // Set up message listeners
      this.setupMessageListeners();

      return true;
    } catch (error) {
      console.error('Error initializing Keybase bot:', error);
      throw error;
    }
  }

  setupMessageListeners() {
    // Listen for direct messages
    this.bot.chat.watchAllChannelsForNewMessages(async (message) => {
      try {
        if (message.content.type !== 'text') return;
        if (!message.content.text || !message.content.text.body) return;

        const messageText = message.content.text.body.trim();
        const username = message.sender.username;

      // Handle !login command - request magic link
      if (messageText.startsWith('!login')) {
        await this.handleLoginCommand(username, messageText);
        return;
      }

      // Handle !meetup command
      if (messageText === '!meetup') {
        await this.handleMeetupCommand(username);
        return;
      }

      // Handle !help command
      if (messageText === '!help') {
        await this.handleHelpCommand(username);
        return;
      }
      } catch (error) {
        console.error('Error handling Keybase message:', error);
      }
    });
  }

  // Generate a 6-digit magic code
  generateMagicCode() {
    return crypto.randomInt(100000, 999999).toString();
  }

  // Send magic code to user
  async sendMagicCode(keybaseUsername) {
    try {
      const magicCode = this.generateMagicCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      // Store in database
      await this.client.query(`
        INSERT INTO magic_codes (keybase_username, magic_code, expires_at)
        VALUES ($1, $2, $3)
      `, [keybaseUsername, magicCode, expiresAt]);

      // Send DM to user
      const message = `🔐 **Marcel here!** Your magic code for aformulationoftruth.com is: **${magicCode}**\n\nThis code expires in 10 minutes. Enter it on the website to complete your login.`;

      await this.bot.chat.send({
        to: keybaseUsername,
        message: { body: message }
      });

      console.log(`Magic code sent to ${keybaseUsername}: ${magicCode}`);
      return { success: true, code: magicCode };
    } catch (error) {
      console.error('Error sending magic code:', error);
      return { success: false, error: error.message };
    }
  }

  // Verify magic code
  async verifyMagicCode(keybaseUsername, providedCode) {
    try {
      const result = await this.client.query(`
        SELECT * FROM magic_codes
        WHERE keybase_username = $1 AND magic_code = $2 AND used = false AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      `, [keybaseUsername, providedCode]);

      if (result.rows.length === 0) {
        return { valid: false, message: 'Invalid or expired code' };
      }

      // Mark code as used
      await this.client.query(`
        UPDATE magic_codes SET used = true WHERE id = $1
      `, [result.rows[0].id]);

      // Create or update user record
      await this.client.query(`
        INSERT INTO keybase_users (keybase_username, last_login)
        VALUES ($1, NOW())
        ON CONFLICT (keybase_username)
        DO UPDATE SET last_login = NOW()
      `, [keybaseUsername]);

      return { valid: true, message: 'Login successful' };
    } catch (error) {
      console.error('Error verifying magic code:', error);
      return { valid: false, message: 'Verification error' };
    }
  }

  // Handle meetup command
  async handleMeetupCommand(username) {
    try {
      // Check if user is eligible (has logged in and joined team)
      const eligibilityCheck = await this.checkEligibilityForSwap(username);

      if (!eligibilityCheck.eligible) {
        await this.bot.chat.send({
          to: username,
          message: { body: eligibilityCheck.message }
        });
        return;
      }

      // Get another eligible user
      const matchedUser = await this.findSwapPartner(username);

      if (!matchedUser) {
        await this.bot.chat.send({
          to: username,
          message: { body: "Sorry, no other eligible users are available for a swap right now. Try again later!" }
        });
        return;
      }

      // Perform the swap
      await this.performQuestionnaireSwap(username, matchedUser);

    } catch (error) {
      console.error('Error handling meetup command:', error);
      await this.bot.chat.send({
        to: username,
        message: { body: "Sorry, there was an error processing your meetup request. Please try again later." }
      });
    }
  }

  // Check if user is eligible for swap
  async checkEligibilityForSwap(username) {
    try {
      // Check if user exists in our system
      const userResult = await this.client.query(`
        SELECT * FROM keybase_users WHERE keybase_username = $1
      `, [username]);

      if (userResult.rows.length === 0) {
        return {
          eligible: false,
          message: "You need to log into aformulationoftruth.com using your Keybase identity first!"
        };
      }

      // Check if user is in the team (this would need to be implemented based on Keybase team API)
      // For now, we'll mark users as eligible when they first use the bot
      await this.client.query(`
        UPDATE keybase_users SET is_eligible_for_swap = true WHERE keybase_username = $1
      `, [username]);

      return { eligible: true };
    } catch (error) {
      console.error('Error checking eligibility:', error);
      return {
        eligible: false,
        message: "Error checking eligibility. Please try again later."
      };
    }
  }

  // Find a swap partner
  async findSwapPartner(username) {
    try {
      const result = await this.client.query(`
        SELECT keybase_username FROM keybase_users
        WHERE is_eligible_for_swap = true
        AND keybase_username != $1
        ORDER BY RANDOM()
        LIMIT 1
      `, [username]);

      return result.rows.length > 0 ? result.rows[0].keybase_username : null;
    } catch (error) {
      console.error('Error finding swap partner:', error);
      return null;
    }
  }

  // Perform questionnaire swap
  async performQuestionnaireSwap(user1, user2) {
    try {
      // Fetch questionnaire data for both users
      const [responses1, responses2] = await Promise.all([
        this.fetchUserQuestionnaire(user1),
        this.fetchUserQuestionnaire(user2)
      ]);

      if (!responses1 || !responses2) {
        const errorMessage = "Sorry, one or both users haven't completed their questionnaires yet. Both participants need to have submitted their responses for a swap to occur.";

        await Promise.all([
          this.bot.chat.send({ to: user1, message: { body: errorMessage } }),
          this.bot.chat.send({ to: user2, message: { body: errorMessage } })
        ]);
        return;
      }

      // Format questionnaire content for each user
      const formattedQuestionnaire1 = this.formatQuestionnaireForMessage(responses1);
      const formattedQuestionnaire2 = this.formatQuestionnaireForMessage(responses2);

      const message1 = `🤝 **Marcel here with a Proust Questionnaire Swap!**\n\nYou've been randomly matched with another member for a questionnaire exchange. Here are their thoughts:\n\n${formattedQuestionnaire2}\n\n*Enjoy this glimpse into another soul's reflections!*`;

      const message2 = `🤝 **Marcel here with a Proust Questionnaire Swap!**\n\nYou've been randomly matched with another member for a questionnaire exchange. Here are their thoughts:\n\n${formattedQuestionnaire1}\n\n*Enjoy this glimpse into another soul's reflections!*`;

      await Promise.all([
        this.bot.chat.send({ to: user1, message: { body: message1 } }),
        this.bot.chat.send({ to: user2, message: { body: message2 } })
      ]);

      console.log(`Questionnaire swap completed between ${user1} and ${user2}`);
    } catch (error) {
      console.error('Error performing questionnaire swap:', error);
    }
  }

  // Fetch user's questionnaire responses from database
  async fetchUserQuestionnaire(keybaseUsername) {
    try {
      const result = await this.client.query(`
        SELECT r.question, r.answer
        FROM responses r
        JOIN keybase_users ku ON ku.id = r.user_id
        WHERE ku.keybase_username = $1
        ORDER BY r.id
      `, [keybaseUsername]);

      return result.rows.length > 0 ? result.rows : null;
    } catch (error) {
      console.error('Error fetching questionnaire:', error);
      return null;
    }
  }

  // Format questionnaire responses for Keybase message
  formatQuestionnaireForMessage(responses) {
    return responses.slice(0, 5) // Show first 5 responses to keep message manageable
      .map((response, index) => {
        const answer = response.answer || '*No response provided*';
        return `**Q${index + 1}:** ${response.question}\n**A:** ${answer}\n`;
      }).join('\n') + `\n*[Showing first 5 of ${responses.length} responses]*`;
  }

  // Send PDF to user
  async sendProustPDF(username, pdfPath) {
    try {
      const message = "📄 **Marcel here - Thank you for your submission!**\n\nYour formatted Proust Questionnaire is attached below. This document contains your personal responses and is delivered securely via Keybase's end-to-end encryption.";

      await this.bot.chat.attach({
        to: username,
        filename: pdfPath,
        title: message
      });

      console.log(`PDF sent to ${username}: ${pdfPath}`);
      return { success: true };
    } catch (error) {
      console.error('Error sending PDF:', error);
      return { success: false, error: error.message };
    }
  }

  // Cleanup expired magic codes
  async cleanupExpiredCodes() {
    try {
      await this.client.query(`
        DELETE FROM magic_codes WHERE expires_at < NOW()
      `);
    } catch (error) {
      console.error('Error cleaning up expired codes:', error);
    }
  }

  // Handle !login command - send magic link via Keybase
  async handleLoginCommand(username, messageText) {
    try {
      // Parse email from command: !login email@example.com
      const parts = messageText.split(/\s+/);

      if (parts.length < 2) {
        await this.bot.chat.send({
          to: username,
          message: {
            body: `🔐 **Marcel here!**\n\nTo get a magic link, use:\n\`!login your.email@example.com\`\n\nI'll send you a clickable link to access the questionnaire.`
          }
        });
        return;
      }

      const email = parts[1].trim();

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        await this.bot.chat.send({
          to: username,
          message: {
            body: `❌ Invalid email format: ${email}\n\nPlease use: \`!login your.email@example.com\``
          }
        });
        return;
      }

      // Generate magic link token (using the same function from utils/db.js)
      const { generateToken, saveMagicLinkToken } = await import('./utils/db.js');
      const token = generateToken();

      // Save token to database
      await saveMagicLinkToken(email, token);

      // Create magic link
      const magicLink = `${process.env.BASE_URL}/auth/verify?token=${token}`;

      // Store association between Keybase username and email
      await this.client.query(`
        INSERT INTO keybase_users (keybase_username, email, last_login)
        VALUES ($1, $2, NOW())
        ON CONFLICT (keybase_username)
        DO UPDATE SET email = $2, last_login = NOW()
      `, [username, email]);

      // Send magic link via Keybase DM
      const message = `🔐 **Marcel here with your magic link!**\n\n✨ Click here to access the questionnaire:\n${magicLink}\n\n⏱️  This link expires in 10 minutes.\n📧 Associated with: ${email}\n\n*This secure link is delivered via Keybase's end-to-end encryption.*`;

      await this.bot.chat.send({
        to: username,
        message: { body: message }
      });

      console.log(`Magic link sent to ${username} via Keybase for email: ${email}`);

    } catch (error) {
      console.error('Error handling login command:', error);
      await this.bot.chat.send({
        to: username,
        message: {
          body: `❌ Sorry, there was an error generating your magic link. Please try again or contact support.\n\nError: ${error.message}`
        }
      });
    }
  }

  // Handle !help command - show available commands
  async handleHelpCommand(username) {
    const helpMessage = `🤖 **Marcel here - Available Commands**

**Authentication:**
\`!login your.email@example.com\` - Get a magic link to access the questionnaire

**Community:**
\`!meetup\` - Swap questionnaires with another random user

**Help:**
\`!help\` - Show this help message

*All interactions are secured with Keybase's end-to-end encryption.*`;

    await this.bot.chat.send({
      to: username,
      message: { body: helpMessage }
    });
  }
}

export default KeybaseAuthBot;