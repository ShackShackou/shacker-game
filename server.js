// Proxy CORS pour Shacker Game - Cache la clé API JSONBin
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration sécurisée
const JSONBIN_BIN_ID = '68b08a1fd0ea881f40696e32';
const JSONBIN_API_KEY = '$2a$10$WLrKiYdlm2jsQ8vUCP10s.ePgcFudhnEDitHpJwKWQPh2cY0k8L1O';

// Activer CORS pour TOUS les domaines (incluant OpenSea)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parser le JSON
app.use(express.json());

// Route de test
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: '🎮 Shacker Proxy API Running!',
        endpoints: {
            'GET /scores': 'Get all scores',
            'POST /scores': 'Save a new score'
        }
    });
});

// GET - Récupérer les scores
app.get('/scores', async (req, res) => {
    console.log('📥 Getting scores from JSONBin...');
    
    try {
        const response = await axios.get(
            `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`,
            {
                headers: {
                    'X-Access-Key': JSONBIN_API_KEY
                }
            }
        );
        
        const scores = response.data.record || [];
        console.log(`✅ Found ${scores.length} scores`);
        res.json(scores);
        
    } catch (error) {
        console.error('❌ Error getting scores:', error.message);
        res.status(500).json({ error: 'Failed to get scores' });
    }
});

// POST - Sauvegarder un nouveau score
app.post('/scores', async (req, res) => {
    console.log('💾 Saving new score...');
    
    const newScore = req.body;
    
    // Validation anti-triche
    if (!newScore.name || !newScore.score || typeof newScore.score !== 'number') {
        return res.status(400).json({ error: 'Invalid score data' });
    }
    
    if (newScore.score > 1000000) {
        return res.status(400).json({ error: 'Score too high - cheating detected!' });
    }
    
    try {
        // 1. Récupérer les scores existants
        const getResponse = await axios.get(
            `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`,
            {
                headers: {
                    'X-Access-Key': JSONBIN_API_KEY
                }
            }
        );
        
        let scores = getResponse.data.record || [];
        
        // 2. Ajouter le nouveau score avec date
        newScore.date = new Date().toISOString();
        scores.push(newScore);
        
        // 3. Trier et garder le top 100
        scores.sort((a, b) => b.score - a.score);
        scores = scores.slice(0, 100);
        
        // 4. Sauvegarder sur JSONBin
        const saveResponse = await axios.put(
            `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`,
            scores,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Access-Key': JSONBIN_API_KEY
                }
            }
        );
        
        // 5. Trouver le rang du joueur
        const rank = scores.findIndex(s => 
            s.name === newScore.name && s.score === newScore.score
        ) + 1;
        
        console.log(`✅ Score saved! Player ranked #${rank}`);
        res.json({ success: true, rank: rank });
        
    } catch (error) {
        console.error('❌ Error saving score:', error.message);
        res.status(500).json({ error: 'Failed to save score' });
    }
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Shacker Proxy running on port ${PORT}`);
    console.log('🔒 JSONBin API key is hidden');
    console.log('🌍 CORS enabled for all origins');
});