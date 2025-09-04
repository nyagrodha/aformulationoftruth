@tailwind base;
@tailwind components;
@tailwind utilities;

/* ... existing root variables ... */

/* Light Theme Adjustments */
.light {
  --background: hsl(210, 20%, 98%);
  --foreground: hsl(210, 11%, 15%);
  --card: hsl(0, 0%, 100%);
  --card-foreground: hsl(210, 11%, 15%);
  --border: hsl(214, 32%, 91%);
  /* ... other light theme variables ... */
}

/* Dark Theme (already defined) */
.dark {
  --background: hsl(210, 11%, 6%);
  --foreground: hsl(0, 0%, 98%);
  --card: hsl(210, 11%, 13%);
  --card-foreground: hsl(0, 0%, 98%);
  --border: hsl(210, 11%, 21%);
   /* ... other dark theme variables ... */
}

/* Neon Theme Specifics */
.neon .question-card {
  background-color: rgba(10, 0, 30, 0.75);
  backdrop-filter: blur(12px);
  border: 2px solid #00ffff;
  box-shadow: 0 0 15px #00ffff, inset 0 0 10px #ff00ff;
}

.neon .question-card h2, .neon .question-card label {
  color: #f0e6ff;
  text-shadow: 0 0 5px #f0e6ff;
}

.neon .question-card textarea {
  background-color: rgba(0,0,0,0.4);
  color: #e0d1ff;
  border-color: #ff00ff;
}

.neon-container {
  color: white; /* High contrast default text color */
}
