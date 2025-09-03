// debug-mail.js
import 'dotenv/config'; // Loads variables from .env file

// Use modern ESM import to correctly access named exports
import { debugSmtpConnection, debugRenderEmail } from './backend/src/lib/authMail.js';

async function run() {
  const command = process.argv[2]; // Get the command-line argument (e.g., 'connect')

  console.log(`Running debug command: ${command}\n`);

  if (command === 'connect') {
    await debugSmtpConnection();
  } else if (command === 'render') {
    await debugRenderEmail();
  } else {
    console.error("Error: Please provide a command.");
    console.error("Usage: node debug-mail.js <command>");
    console.error("Available commands: connect, render");
  }
}

run();
