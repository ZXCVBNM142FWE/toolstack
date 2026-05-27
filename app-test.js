const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Hello Railway!'));
app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => console.log('Running on', PORT));
