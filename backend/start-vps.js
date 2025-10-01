const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.VPS_PORT || 3001;
const SECURE_DIR = '/secure/responses';

// Ensure directories exist
async function initializeDirectories() {
  try {
    await fs.access(SECURE_DIR);
    console.log('Secure directory accessible');
  } catch (error) {
    console.error('Cannot access secure directory:', error.message);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'vps-storage'
  });
});

// Storage endpoint
app.post('/api/store-response', async (req, res) => {
  try {
    const { data, userId } = req.body;
    const filename = `response_${userId}_${Date.now()}.enc`;
    const filepath = path.join(SECURE_DIR, filename);
    
    // Encrypt data (implement your encryption logic)
    const encrypted = encryptData(data);
    await fs.writeFile(filepath, encrypted);
    
    console.log(`Stored encrypted response: ${filename}`);
    res.json({ success: true, filename });
  } catch (error) {
    console.error('Storage error:', error);
    res.status(500).json({ error: 'Storage failed' });
  }
});

// Graceful startup with error handling
async function startServer() {
  try {
    await initializeDirectories();
    
    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`VPS storage server listening on port ${PORT}`);
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} in use, retrying in 5 seconds...`);
        setTimeout(() => startServer(), 5000);
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
    });
    
  } catch (error) {
    console.error('Startup error:', error);
    process.exit(1);
  }
}

function encryptData(data) {
  // Implement your encryption logic here
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key, iv);
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return Buffer.from(iv.toString('hex') + ':' + encrypted);
}

startServer();
