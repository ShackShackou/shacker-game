// Backend API pour gérer les scores de manière sécurisée
// La clé API est cachée côté serveur

exports.handler = async (event, context) => {
    // Configuration (ces variables seront dans les variables d'environnement Netlify)
    const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID || '68b08a1fd0ea881f40696e32';
    const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '$2a$10$WLrKiYdlm2jsQ8vUCP10s.ePgcFudhnEDitHpJwKWQPh2cY0k8L1O';
    
    // Headers CORS pour permettre l'accès depuis le jeu
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    
    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }
    
    try {
        // GET - Récupérer les scores
        if (event.httpMethod === 'GET') {
            const response = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
                headers: {
                    'X-Access-Key': JSONBIN_API_KEY
                }
            });
            
            const data = await response.json();
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(data.record || [])
            };
        }
        
        // POST - Sauvegarder un nouveau score
        if (event.httpMethod === 'POST') {
            const newScore = JSON.parse(event.body);
            
            // Validation basique
            if (!newScore.name || !newScore.score || typeof newScore.score !== 'number') {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Invalid score data' })
                };
            }
            
            // Récupérer les scores existants
            const getResponse = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
                headers: {
                    'X-Access-Key': JSONBIN_API_KEY
                }
            });
            
            const data = await getResponse.json();
            let scores = data.record || [];
            
            // Ajouter le nouveau score
            scores.push({
                name: newScore.name.substring(0, 20), // Limite à 20 caractères
                score: Math.floor(newScore.score), // Assure que c'est un entier
                level: newScore.level || 1,
                date: new Date().toISOString()
            });
            
            // Trier et garder le top 100
            scores.sort((a, b) => b.score - a.score);
            scores = scores.slice(0, 100);
            
            // Sauvegarder
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
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, rank: scores.findIndex(s => s.score === newScore.score) + 1 })
            };
        }
        
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Server error' })
        };
    }
};