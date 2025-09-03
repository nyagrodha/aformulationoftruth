// app.js or your main server file
const express = require('express');
const session = require('express-session');
const Keycloak = require('keycloak-connect');

const app = express();

// Session store (required for Keycloak)
const memoryStore = new session.MemoryStore();
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
}));

// Keycloak configuration
const kcConfig = {
  clientId: 'your-client-id',
  bearerOnly: false,
  serverUrl: 'http://aformulationoftruth.com:8080',
  realm: 'your-realm-name',
  credentials: {
    secret: 'your-client-secret' // if using confidential client
  }
};

const keycloak = new Keycloak({ store: memoryStore }, kcConfig);
app.use(keycloak.middleware());

// Routes
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>A Formulation of Truth</title></head>
    <body>
      <div>அருவமே உருவம், உருவமே அருவம்</div>
      <div>அருவமே உருவம் உருவமே அருவம்</div>
      <a href="/questionnaire">begin the questionnaire</a><br>
      <a href="/questionnaire">enter the truth</a><br>
      <a href="/questionnaire">proceed into the questions</a>
    </body>
    </html>
  `);
});

// Protected questionnaire route
app.get('/questionnaire', keycloak.protect(), (req, res) => {
  const userEmail = req.kauth.grant.access_token.content.email;
  const userName = req.kauth.grant.access_token.content.name;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Questionnaire - A Formulation of Truth</title></head>
    <body>
      <h1>Welcome, ${userName}</h1>
      <p>Email: ${userEmail}</p>
      <form method="POST" action="/submit-questionnaire">
        <h2>Truth Questionnaire</h2>
        
        <label>Question 1: What is the nature of consciousness?</label><br>
        <textarea name="q1" rows="4" cols="50"></textarea><br><br>
        
        <label>Question 2: How do you perceive the relationship between form and formlessness?</label><br>
        <textarea name="q2" rows="4" cols="50"></textarea><br><br>
        
        <label>Question 3: What role does direct experience play in understanding truth?</label><br>
        <textarea name="q3" rows="4" cols="50"></textarea><br><br>
        
        <input type="hidden" name="email" value="${userEmail}">
        <button type="submit">Submit Responses</button>
      </form>
      
      <br><a href="/logout">Logout</a>
    </body>
    </html>
  `);
});

// Handle questionnaire submission
app.post('/submit-questionnaire', keycloak.protect(), express.urlencoded({ extended: true }), (req, res) => {
  const { q1, q2, q3, email } = req.body;
  
  // Store responses in database or file
  console.log('Questionnaire submission:', { email, q1, q2, q3 });
  
  res.send(`
    <h1>Thank you for your responses!</h1>
    <p>Your insights have been recorded.</p>
    <a href="/questionnaire">Submit another response</a> | 
    <a href="/logout">Logout</a>
  `);
});

// Logout route
app.get('/logout', (req, res) => {
  req.kauth.logout();
  res.redirect('/');
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
