// Configuration sécurisée pour le leaderboard
// Ce fichier devrait idéalement être sur un serveur backend

const GameConfig = {
    // Protection anti-triche
    antiCheat: {
        maxScoresPerHour: 10,
        minGameDuration: 5000, // 5 secondes minimum
        maxScorePerLevel: 5000,
        maxLevel: 50
    },
    
    // Validation des scores
    validateScore: function(score, level, duration) {
        // Vérifier que le jeu a duré assez longtemps
        if (duration < this.antiCheat.minGameDuration) {
            console.warn('Game too short, possible cheat');
            return false;
        }
        
        // Vérifier que le score n'est pas trop élevé pour le niveau
        if (score > level * this.antiCheat.maxScorePerLevel) {
            console.warn('Score too high for level, possible cheat');
            return false;
        }
        
        // Vérifier que le niveau n'est pas trop élevé
        if (level > this.antiCheat.maxLevel) {
            console.warn('Level too high, possible cheat');
            return false;
        }
        
        return true;
    },
    
    // Encoder le score avec un hash simple (pas parfait mais mieux que rien)
    encodeScore: function(score, name, timestamp) {
        const data = score + '|' + name + '|' + timestamp;
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
};

// Proxy pour les requêtes JSONBin (optionnel - nécessite un backend)
// Cela permettrait de cacher complètement la clé API
const SecureAPI = {
    saveScore: async function(scoreData) {
        // Dans l'idéal, ceci devrait appeler ton propre backend
        // qui validerait et sauvegarderait le score
        // return fetch('https://ton-backend.com/api/save-score', {
        //     method: 'POST',
        //     body: JSON.stringify(scoreData)
        // });
        
        // Pour l'instant, on utilise JSONBin directement
        // mais avec validation
        if (!GameConfig.validateScore(scoreData.score, scoreData.level, scoreData.duration)) {
            throw new Error('Invalid score detected');
        }
        
        // Ajouter un hash de vérification
        scoreData.hash = GameConfig.encodeScore(
            scoreData.score, 
            scoreData.name, 
            scoreData.timestamp
        );
        
        return scoreData;
    }
};