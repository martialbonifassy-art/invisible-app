require('dotenv').config();

const express = require('express');
const app = express();
const port = process.env.PORT || 5000;

app.get('/', (req, res) => {
  res.send('API fonctionne !');
});

app.listen(port, () => {
  console.log(`Serveur lancé à http://localhost:${port}`);
});

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Exporter supabase si d'autres modules doivent l'utiliser
module.exports = { app, supabase };
