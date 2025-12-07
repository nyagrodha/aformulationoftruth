# கருப்பசாமி கேள்வித்தாள் (Karuppacāmi kēḷvittāḷ) - Telegram Bot

## Bot Information

- **Name**: கருப்பசாமி கேள்வித்தாள் (Karuppacāmi kēḷvittāḷ)
- **Username**: @kevli_tal
- **Brand**: a formulation of truth
- **Purpose**: Proust Questionnaire delivery via Telegram

## Features

### Core Functionality
- ✅ 35 Proust Questionnaire questions (Fischer-Yates shuffled per session)
- ✅ Bilingual support (Tamil/English)
- ✅ Cross-platform sessions (start on web, finish on Telegram or vice versa)
- ✅ Question skipping (null answers allowed)
- ✅ Progress tracking with visual progress bars
- ✅ Session resumption
- ✅ Answer encryption (stored securely in Iceland database)

### Available Commands

| Command | Description |
|---------|-------------|
| `/start` | Begin or continue questionnaire |
| `/next` or `/onward` | Get next question (or skip current) |
| `/status` | View progress (answered/remaining) |
| `/pause` | Pause session |
| `/help` | Display help information |
| `/export` | Export responses (email/mail options) |

## Configuration

### Environment Variables

Required in `.env`:
```bash
TELEGRAM_BOT_TOKEN=7318854818:AAE71YagfX9gP7C5jlFnw1RgGCAN1VuZ0_g
DATABASE_URL=postgresql://a4m_app:jsT%40sA2nd1nsd3cl2y0@10.99.0.1:5432/a4m_db
```

### Database Schema

**Tables Used:**
- `questionnaire_sessions` - Session tracking with platform support
- `questionnaire_question_order` - Shuffled question order per session
- `user_answers` - User responses with platform tracking
- `users` - User accounts

**Cross-Platform Columns:**
- `platform` - 'telegram', 'web', 'whatsapp'
- `platform_user_id` - Telegram chat ID
- `platform_username` - Telegram username
- `skipped` - Whether question was skipped

## Bot Messages

### Start Message (New User)
```
What follows is a Proust Questionnaire dba கருப்பசாமி கேள்வித்தாள்
(Karuppacāmi kēḷvittāḷ) — this bot's namesake.

Thirty-five questions invite upon the respondent reflective states of awareness.
Your thoughtful yet spontaneous responses likely reveal delight to be discovered
b/c happiness is our nature.

Nonetheless, nothing of this world is universal; perhaps may be some nightmares
in here, too. ;0) 👹👹👹

வணக்கம் (vaṇakkam)
நாம் தொடங்கலாமா? (Nām toṭaṅkalāmā?)

Shall we begin?
```

### Returning User Message
```
வணக்கம் (vaṇakkam) 👹👹👹

Welcome back.

You have X questions remaining.

35 கேள்விகளில் Y க்கு தயவுசெய்து பதிலளித்தேன்.
நீங்கள் முடிக்கும் வரை X உங்களிடம் உள்ளது.

Enjoy!

Type /next to continue.
```

### Answer Saved
```
*ANSWER SAVED*

encrypted answer posted to Iceland database.

Type /next or /onward to continue.
```

### Completion Message
```
🌟 *COMPLETION* 🌟

The questionnaire is complete.

You have answered all 35 questions.

Your answers can be viewed at:
https://aformulationoftruth.com/responsivousplay

Type /export for more options.
```

## Testing

### Manual Testing
1. Open Telegram and search for `@kevli_tal`
2. Send `/start`
3. Verify bilingual welcome message
4. Send `/next` to get first question
5. Answer question or skip with `/next`
6. Check `/status` for progress
7. Complete all 35 questions
8. Verify completion message

### Cross-Platform Testing
1. Start questionnaire on web (aformulationoftruth.com)
2. Answer 5-10 questions
3. Switch to Telegram bot
4. Send `/start` - should resume from web session
5. Continue answering on Telegram
6. Verify all answers saved to same session

## Production Deployment

### Using PM2
```bash
cd /home/marcel/aformulationoftruth/backend
pm2 start dist/server.js --name "a4m-backend"
pm2 save
pm2 startup
```

### Using systemd
```bash
sudo systemctl enable a4m-backend
sudo systemctl start a4m-backend
sudo systemctl status a4m-backend
```

## Monitoring

### Check Bot Status
```bash
# View logs
pm2 logs a4m-backend

# Check if bot is responding
curl -s "https://api.telegram.org/bot7318854818:AAE71YagfX9gP7C5jlFnw1RgGCAN1VuZ0_g/getMe"
```

### Database Queries
```sql
-- Check active sessions
SELECT COUNT(*) FROM questionnaire_sessions
WHERE platform = 'telegram' AND completed = FALSE;

-- Check answers from Telegram
SELECT COUNT(*) FROM user_answers WHERE platform = 'telegram';

-- View recent Telegram activity
SELECT * FROM questionnaire_sessions
WHERE platform = 'telegram'
ORDER BY created_at DESC LIMIT 10;
```

## Troubleshooting

### Bot Not Responding
1. Check if server is running: `ps aux | grep node`
2. Verify token: `grep TELEGRAM_BOT_TOKEN /home/marcel/aformulationoftruth/backend/.env`
3. Check logs: `pm2 logs` or `journalctl -u a4m-backend`
4. Test webhook: `curl https://api.telegram.org/bot<TOKEN>/getMe`

### Database Connection Issues
1. Check database is accessible: `PGPASSWORD='jsT@sA2nd1nsd3cl2y0' psql -h 10.99.0.1 -U a4m_app -d a4m_db -c "SELECT 1;"`
2. Verify migrations ran: `SELECT * FROM questionnaire_sessions LIMIT 1;`
3. Check platform columns exist: `\d questionnaire_sessions`

### Session Not Resuming
1. Verify session exists: `SELECT * FROM questionnaire_sessions WHERE platform_user_id = '<chat_id>';`
2. Check question order initialized: `SELECT COUNT(*) FROM questionnaire_question_order WHERE session_id = <id>;`
3. Verify answers linked to session: `SELECT * FROM user_answers WHERE session_id = <id>;`

## Future Enhancements

- [ ] Historical responses (Proust, Marx, Poehler, Hackman)
- [ ] Duplicate answer detection across questions
- [ ] WhatsApp bot integration
- [ ] PDF export via bot
- [ ] Analytics dashboard
- [ ] Multi-language support (beyond Tamil/English)
