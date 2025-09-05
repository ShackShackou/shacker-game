// API sécurisée pour Vercel - Cache la clé JSONBin côté serveur
export default async function handler(req, res) {
    // Configuration sécurisée (la clé est cachée côté serveur)
    const JSONBIN_BIN_ID = '68b08a1fd0ea881f40696e32';
    const JSONBIN_API_KEY = '$2a$10$WLrKiYdlm2jsQ8vUCP10s.ePgcFudhnEDitHpJwKWQPh2cY0k8L1O';
    
    // CORS headers pour permettre l'accès depuis n'importe où
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        // GET - Récupérer les scores
        if (req.method === 'GET') {
            const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
                headers: {
                    'X-Access-Key': JSONBIN_API_KEY
                }
            });
            
            const data = await response.json();
            return res.status(200).json(data.record || []);
        }
        
        // POST - Sauvegarder un nouveau score
        if (req.method === 'POST') {
            const newScore = req.body;
            
            // Validation basique anti-triche
            if (!newScore.name || !newScore.score || typeof newScore.score !== 'number') {
                return res.status(400).json({ error: 'Invalid score data' });
            }
            
            // Limite le score maximum (anti-triche)
            if (newScore.score > 1000000) {
                return res.status(400).json({ error: 'Score too high - cheating detected!' });
            }
            
            // Récupérer les scores existants
            const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
                headers: {
                    'X-Access-Key': JSONBIN_API_KEY
                }
            });
            
            const data = await getResponse.json();
            let scores = data.record || [];
            
            // Ajouter le nouveau score avec timestamp
            scores.push({
                name: newScore.name.substring(0, 20),
                score: Math.floor(newScore.score),
                level: newScore.level || 1,
                date: new Date().toISOString()
            });
            
            // Trier et garder le top 100
            scores.sort((a, b) => b.score - a.score);
            scores = scores.slice(0, 100);
            
            // Sauvegarder sur JSONBin
            const saveResponse = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Access-Key': JSONBIN_API_KEY
                },
                body: JSON.stringify(scores)
            });
            
            if (!saveResponse.ok) {
                throw new Error('Failed to save scores');
            }
            
            return res.status(200).json({ 
                success: true, 
                rank: scores.findIndex(s => s.score === newScore.score) + 1 
            });
        }
        
        return res.status(405).json({ error: 'Method not allowed' });
        
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}