const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Serve the actual questionnaire from client build
const buildPath = path.join(__dirname, '../client/dist'); // or '../client/build'
console.log('🚀 Serving questionnaire from:', buildPath);
app.use(express.static(buildPath));

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');
  res.sendFile(indexPath);
});

app.listen(port, () => {
  console.log(`🚀 Questionnaire running at http://localhost:${port}`);
});
