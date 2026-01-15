/**
 * கருப்பசாமி கேள்வித்தாள் (Karuppacāmi kēḷvittāḷ) - Telegram Bot
 * a formulation of truth - Proust Questionnaire Bot
 *
 * Thirty-five questions invite upon the respondent reflective states of awareness.
 */

import TelegramBot from 'node-telegram-bot-api';
import crypto from 'crypto';
import fs from 'fs';
import { fisherYatesShuffle } from '../utils/fisherYates_shuffle.js';
import PDFGenerator from '../utils/pdf-generator.js';

// Proust Questionnaire questions
const questions = [
  "What is your idea of perfect happiness?",
  "What is your greatest fear?",
  "What is the trait you most deplore in yourself?",
  "What is the trait you most deplore in others?",
  "Which living person do you most admire?",
  "What is your greatest extravagance?",
  "What is your current state of mind?",
  "What do you consider the most overrated virtue?",
  "On what occasion do you lie?",
  "What do you most dislike about your appearance?",
  "Which living person do you most despise?",
  "What is the quality you most like in a man?",
  "What is the quality you most like in a woman?",
  "Which words or phrases do you most overuse?",
  "What or who is the greatest love of your life?",
  "When and where were you happiest?",
  "Which talent would you most like to have?",
  "If you could change one thing about yourself, what would it be?",
  "What do you consider your greatest achievement?",
  "If you were to die and come back as a person or a thing, what would it be?",
  "Where would you most like to live?",
  "What is your most treasured possession?",
  "What do you regard as the lowest depth of misery?",
  "What is your favorite occupation?",
  "What is your most marked characteristic?",
  "What do you most value in your friends?",
  "Who are your favorite writers?",
  "Who is your hero of fiction?",
  "Which historical figure do you most identify with?",
  "Who are your heroes in real life?",
  "What are your favorite names?",
  "What is it that you most dislike?",
  "What is your greatest regret?",
  "How would you like to die?",
  "What is your motto?"
];

class KaruppasāmiBot {
  constructor(token, dbClient) {
    this.bot = new TelegramBot(token, { polling: true });
    this.db = dbClient;
    this.userStates = new Map();
    this.pdfGenerator = new PDFGenerator();

    this.setupHandlers();
    console.log('👹 கருப்பசாமி awakens...');
  }

  setupHandlers() {
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
    this.bot.onText(/\/next|\/onward/, (msg) => this.handleNext(msg));
    this.bot.onText(/\/status/, (msg) => this.handleStatus(msg));
    this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));
    this.bot.onText(/\/pause/, (msg) => this.handlePause(msg));
    this.bot.onText(/\/export/, (msg) => this.handleExport(msg));

    this.bot.on('message', (msg) => this.handleMessage(msg));
    this.bot.on('callback_query', (query) => this.handleCallback(query));
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name || 'Seeker';

    try {
      const existingSession = await this.getSession(chatId);

      if (existingSession && !existingSession.completed) {
        const remaining = 35 - (existingSession.answered_count || 0);
        const answered = existingSession.answered_count || 0;

        await this.bot.sendMessage(chatId,
          `வணக்கம் (vaṇakkam) 👹👹👹\n\n` +
          `Welcome back.\n\n` +
          `You have *${remaining} questions remaining*.\n\n` +
          `35 கேள்விகளில் ${answered} க்கு தயவுசெய்து பதிலளித்தேன்.\n` +
          `நீங்கள் முடிக்கும் வரை ${remaining} உங்களிடம் உள்ளது.\n\n` +
          `Enjoy!\n\n` +
          `Type /next to continue.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Create new session
      const email = `telegram_${chatId}@aformulationoftruth.com`;
      const sessionHash = crypto.createHash('sha256')
        .update(`${chatId}_${Date.now()}`)
        .digest('hex');

      const result = await this.db.query(
        `INSERT INTO questionnaire_sessions (email, session_hash, platform, platform_user_id, platform_username)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [email, sessionHash, 'telegram', chatId.toString(), username]
      );

      const sessionId = result.rows[0].id;

      // Initialize shuffled questions for this session
      await this.initializeSessionQuestions(sessionId);

      this.userStates.set(chatId, {
        sessionId,
        email,
        waitingForAnswer: false,
        currentQuestion: null
      });

      await this.bot.sendMessage(chatId,
        `What follows is a Proust Questionnaire dba *கருப்பசாமி கேள்வித்தாள்* ` +
        `(Karuppacāmi kēḷvittāḷ) — this bot's namesake.\n\n` +
        `Thirty-five questions invite upon the respondent reflective states of awareness. ` +
        `Your thoughtful yet spontaneous responses likely reveal delight to be discovered ` +
        `b/c happiness is our nature.\n\n` +
        `Nonetheless, nothing of this world is universal; perhaps may be some nightmares ` +
        `in here, too. ;0) 👹👹👹\n\n` +
        `வணக்கம் (vaṇakkam)\n` +
        `நாம் தொடங்கலாமா? (Nām toṭaṅkalāmā?)\n\n` +
        `_Shall we begin?_`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✨ Begin the Journey', callback_data: 'begin' },
              { text: 'தொடங்கு', callback_data: 'begin' }
            ], [
              { text: '📖 Learn More', callback_data: 'learn_more' }
            ]]
          }
        }
      );

    } catch (error) {
      console.error('Error in /start:', error);
      await this.bot.sendMessage(chatId, 'An error occurred. Please try /start again.');
    }
  }

  async handleNext(msg) {
    const chatId = msg.chat.id;

    try {
      const state = this.userStates.get(chatId);
      if (!state) {
        await this.bot.sendMessage(chatId, 'Please use /start to begin your journey.');
        return;
      }

      // Allow skipping if currently waiting for answer
      if (state.waitingForAnswer && state.currentQuestion) {
        // Save null answer
        await this.saveAnswer(chatId, state, null, true);
      }

      await this.sendNextQuestion(chatId, state);

    } catch (error) {
      console.error('Error in /next:', error);
      await this.bot.sendMessage(chatId, 'An error occurred. Please try again.');
    }
  }

  async handleStatus(msg) {
    const chatId = msg.chat.id;

    try {
      const session = await this.getSession(chatId);
      if (!session) {
        await this.bot.sendMessage(chatId, 'No active session. Use /start to begin.');
        return;
      }

      const answered = session.answered_count || 0;
      const total = 35;
      const remaining = total - answered;
      const percentage = Math.round((answered / total) * 100);
      const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));

      let message = `📊 *progress made:*\n\n` +
        `Progress: ${bar} ${percentage}%\n\n` +
        `Questions answered: ${answered}/${total}\n` +
        `Questions remaining: ${remaining}\n\n`;

      if (answered === total) {
        message += `*Journey complete!*\n\n` +
          `Type /export to have the code print your responses.\n` +
          `Kindly indicate whether you'd like the .pdf document ` +
          `emailed to you or mailed to you.`;
      } else {
        message += `Type /next for your next question.`;
      }

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in /status:', error);
      await this.bot.sendMessage(chatId, 'Error fetching status.');
    }
  }

  async handleHelp(msg) {
    const chatId = msg.chat.id;

    await this.bot.sendMessage(chatId,
      `*Commands:*\n\n` +
      `/start – Begin or continue\n` +
      `/next – Next question (or skip)\n` +
      `/status – View progress\n` +
      `/export – Download your responses as PDF\n` +
      `/pause – Pause session\n` +
      `/help – Show this help\n\n` +
      `*About the project:*\n\n` +
      `This is the Proust Questionnaire: 35 personal questions ` +
      `intended for reflection.\n\n` +
      `Visit: aformulationoftruth.com`,
      { parse_mode: 'Markdown' }
    );
  }

  async handlePause(msg) {
    const chatId = msg.chat.id;

    await this.bot.sendMessage(chatId,
      `⏸️ *paused.*\n\n` +
      `The கருப்பசாமி கேள்வித்தாள் bot has saved the progress you've made, ` +
      `and your responses heretofore saved.\n\n` +
      `Type /next or /onward when ready.`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleExport(msg) {
    const chatId = msg.chat.id;
    const username = msg.from.username || msg.from.first_name || 'Seeker';

    try {
      // Get session and check if any responses exist
      const session = await this.getSession(chatId);
      if (!session) {
        await this.bot.sendMessage(chatId,
          `No questionnaire session found.\n\nUse /start to begin your journey.`
        );
        return;
      }

      // Fetch all responses for this session
      const responses = await this.getUserResponses(chatId);

      if (responses.length === 0) {
        await this.bot.sendMessage(chatId,
          `No responses found yet.\n\nUse /next to answer questions first.`
        );
        return;
      }

      // Send "generating" message
      const statusMsg = await this.bot.sendMessage(chatId,
        `📄 *Generating your PDF...*\n\n` +
        `Please wait while I compile your ${responses.length} responses.`,
        { parse_mode: 'Markdown' }
      );

      // Generate PDF
      const pdfResult = await this.pdfGenerator.generateQuestionnairePDF(
        responses,
        `@${username} (Telegram)`
      );

      if (!pdfResult.success) {
        await this.bot.editMessageText(
          `❌ *PDF Generation Failed*\n\n` +
          `Error: ${pdfResult.error}\n\n` +
          `Your responses are still safe. You can view them at:\n` +
          `https://aformulationoftruth.com/responsivousplay`,
          { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
        );
        return;
      }

      // Delete the "generating" message
      await this.bot.deleteMessage(chatId, statusMsg.message_id);

      // Send the PDF document
      await this.bot.sendDocument(chatId, pdfResult.filepath, {
        caption: `📜 *Your Proust Questionnaire*\n\n` +
          `${responses.length} responses compiled.\n` +
          `Generated: ${new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
          })}\n\n` +
          `_a formulation of truth_`,
        parse_mode: 'Markdown'
      });

      // Clean up the PDF file after sending (delay to ensure upload completes)
      setTimeout(() => {
        try {
          fs.unlinkSync(pdfResult.filepath);
          console.log(`✅ Cleaned up PDF: ${pdfResult.filename}`);
        } catch (err) {
          console.error('Error cleaning up PDF:', err);
        }
      }, 5000);

      console.log(`📄 PDF delivered to @${username} (chat ${chatId})`);

    } catch (error) {
      console.error('Error in /export:', error);
      await this.bot.sendMessage(chatId,
        `❌ An error occurred while generating your PDF.\n\n` +
        `Your responses are still safe. You can view them at:\n` +
        `https://aformulationoftruth.com/responsivousplay`
      );
    }
  }

  /**
   * Fetch all user responses for PDF generation
   */
  async getUserResponses(chatId) {
    try {
      const result = await this.db.query(
        `SELECT
          qo.question_text as question,
          ua.answer_text as answer,
          qo.question_position
         FROM questionnaire_sessions s
         JOIN questionnaire_question_order qo ON qo.session_id = s.id
         LEFT JOIN user_answers ua ON ua.session_id = s.id
           AND ua.question_id = qo.question_id
         WHERE s.platform_user_id = $1
           AND s.platform = 'telegram'
           AND qo.answered = TRUE
         ORDER BY qo.question_position ASC`,
        [chatId.toString()]
      );

      return result.rows.map(row => ({
        question: row.question,
        answer: row.answer || null
      }));
    } catch (error) {
      console.error('Error fetching user responses:', error);
      return [];
    }
  }

  async handleMessage(msg) {
    if (msg.text?.startsWith('/')) return;

    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.trim().length === 0) return;

    try {
      const state = this.userStates.get(chatId);

      if (!state) {
        await this.bot.sendMessage(chatId, 'Use /start to begin.');
        return;
      }

      if (!state.waitingForAnswer || !state.currentQuestion) {
        await this.bot.sendMessage(chatId, 'Type /next to receive a question.');
        return;
      }

      await this.saveAnswer(chatId, state, text, false);

    } catch (error) {
      console.error('Error handling message:', error);
      await this.bot.sendMessage(chatId, 'Error saving your answer. Please try again.');
    }
  }

  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    await this.bot.answerCallbackQuery(query.id);

    if (data === 'begin') {
      await this.handleNext(query.message);
    } else if (data === 'learn_more') {
      await this.bot.sendMessage(chatId,
        `📖 *LEARN MORE*\n\n` +
        `*About the Proust Questionnaire:*\n\n` +
        `Marcel Proust answered these questions in the late 19th century.\n` +
        `They are intended to reveal personality and values.\n\n` +
        `Your answers are:\n` +
        `• Private\n` +
        `• Saved in order\n` +
        `• Stored securely\n\n` +
        `Type /next to begin.`,
        { parse_mode: 'Markdown' }
      );
    } else if (data === 'export_pdf') {
      // Trigger PDF export via the handleExport method
      await this.handleExport({ ...query.message, from: query.from });
    }
  }

  async sendNextQuestion(chatId, state) {
    try {
      // Ensure questions are initialized for this session
      await this.initializeSessionQuestions(state.sessionId);

      const result = await this.db.query(
        `SELECT id, question_id, question_text, question_position
         FROM questionnaire_question_order
         WHERE session_id = $1 AND answered = FALSE
         ORDER BY question_position ASC
         LIMIT 1`,
        [state.sessionId]
      );

      if (result.rows.length === 0) {
        await this.handleCompletion(chatId, state);
        return;
      }

      const questionData = result.rows[0];
      const position = questionData.question_position + 1;
      const percentage = Math.round((position / 35) * 100);
      const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));

      state.currentQuestion = {
        id: questionData.question_id,
        text: questionData.question_text,
        dbId: questionData.id,
        position: position
      };
      state.waitingForAnswer = true;
      this.userStates.set(chatId, state);

      await this.bot.sendMessage(chatId,
        `*NEXT QUESTION*\n\n` +
        `You're responding to question *${position} of 35*\n\n` +
        `${bar} ${percentage}%\n\n` +
        `_${questionData.question_text}_\n\n` +
        `Take your time.\n\n` +
        `(Type /next to skip)`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Error sending question:', error);
      throw error;
    }
  }

  async saveAnswer(chatId, state, answerText, isSkipped) {
    try {
      const result = await this.db.query(
        'SELECT id FROM users WHERE email = $1',
        [state.email]
      );

      let userId;
      if (result.rows.length === 0) {
        const newUser = await this.db.query(
          `INSERT INTO users (email, username, display_name, auth_method)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [state.email, `telegram_${chatId}`, `Telegram User`, 'telegram']
        );
        userId = newUser.rows[0].id;
      } else {
        userId = result.rows[0].id;
      }

      const seqResult = await this.db.query(
        'SELECT COALESCE(MAX(answer_sequence), 0) + 1 as seq FROM user_answers WHERE user_id = $1',
        [userId]
      );
      const sequence = seqResult.rows[0].seq;

      // Save answer (null if skipped)
      await this.db.query(
        `INSERT INTO user_answers
         (user_id, question_id, question_index, answer_text, session_id, answer_sequence, platform, skipped)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          state.currentQuestion.id,
          state.currentQuestion.position - 1, // 0-based index for order asked
          answerText,
          state.sessionId,
          sequence,
          'telegram',
          isSkipped
        ]
      );

      await this.db.query(
        'UPDATE questionnaire_question_order SET answered = TRUE WHERE id = $1',
        [state.currentQuestion.dbId]
      );

      state.waitingForAnswer = false;
      state.currentQuestion = null;
      this.userStates.set(chatId, state);

      if (isSkipped) {
        await this.bot.sendMessage(chatId,
          `⏭️ Question skipped.\n\nType /next or /onward to continue.`
        );
      } else {
        await this.bot.sendMessage(chatId,
          `*ANSWER SAVED*\n\n` +
          `encrypted answer posted to Iceland database.\n\n` +
          `Type /next or /onward to continue.`,
          { parse_mode: 'Markdown' }
        );
      }

    } catch (error) {
      console.error('Error saving answer:', error);
      throw error;
    }
  }

  async handleCompletion(chatId, state) {
    try {
      await this.db.query(
        'UPDATE questionnaire_sessions SET completed = TRUE, completed_at = NOW() WHERE id = $1',
        [state.sessionId]
      );

      await this.bot.sendMessage(chatId,
        `🌟 *COMPLETION* 🌟\n\n` +
        `முடிந்தது! (Muṭintatu!) — The questionnaire is complete.\n\n` +
        `You have answered all 35 questions.\n\n` +
        `Your answers can be viewed at:\n` +
        `https://aformulationoftruth.com/responsivousplay`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '📄 Download PDF', callback_data: 'export_pdf' },
              { text: '🌐 View Online', url: 'https://aformulationoftruth.com/responsivousplay' }
            ]]
          }
        }
      );

      this.userStates.delete(chatId);

    } catch (error) {
      console.error('Error in completion:', error);
      throw error;
    }
  }

  async getSession(chatId) {
    try {
      const result = await this.db.query(
        `SELECT
          s.*,
          (SELECT COUNT(*) FROM questionnaire_question_order
           WHERE session_id = s.id AND answered = TRUE) as answered_count
         FROM questionnaire_sessions s
         WHERE platform_user_id = $1 AND platform = 'telegram'
         ORDER BY created_at DESC
         LIMIT 1`,
        [chatId.toString()]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  /**
   * Initialize shuffled question order for a session
   * Uses Fischer-Yates algorithm for uniform distribution
   */
  async initializeSessionQuestions(sessionId) {
    try {
      // Check if questions already initialized for this session
      const existing = await this.db.query(
        'SELECT COUNT(*) FROM questionnaire_question_order WHERE session_id = $1',
        [sessionId]
      );

      if (existing.rows[0].count > 0) {
        console.log(`Session ${sessionId} already has shuffled questions`);
        return;
      }

      // Generate shuffled array of question indices using Fischer-Yates
      const shuffledIndices = fisherYatesShuffle([...Array(questions.length).keys()]);

      // Insert all 35 questions in shuffled order
      const insertPromises = shuffledIndices.map((questionId, position) =>
        this.db.query(
          `INSERT INTO questionnaire_question_order
           (session_id, question_position, question_id, question_text)
           VALUES ($1, $2, $3, $4)`,
          [sessionId, position, questionId, questions[questionId]]
        )
      );

      await Promise.all(insertPromises);
      console.log(`✅ Initialized ${questions.length} shuffled questions for session ${sessionId}`);
    } catch (error) {
      console.error('Error initializing session questions:', error);
      throw error;
    }
  }
}

export default KaruppasāmiBot;
