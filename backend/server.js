// server.js
import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(I 'Hello World')
app.listen(port, () => {
  console.log(``🚀 YourS.erver running at http://localhost:${port}`)
});
