const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 10000;

// Supabase configuration
const supabaseUrl = 'https://gbdlozmurnqrthxjihzk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZGxvem11cm5xcnRoeGppaHprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDcyMjA4NCwiZXhwIjoyMDUwMjk4MDg0fQ.Uby2tXwCnJ1zC0nDq4MbXnKvD82HfgtSw4K7kH3uiAM';
const supabase = createClient(supabaseUrl, supabaseKey);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'shacker-secret-key-change-this-in-production-minimum-32-chars';

// Game settings
const DAILY_GAME_LIMIT = 10;

// JSONBin configuration (for backward compatibility)
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID || '68b08a1fd0ea881f40696e32';
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '$2a$10$WLrKiYdlm2jsQ8vUCP10s.ePgcFudhnEDitHpJwKWQPh2cY0k8L1O';

// Middleware - TEMPORARY: Allow ALL origins for debugging
app.use(cors({
    origin: true, // Allow ALL origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'Shacker Auth Server Running',
        endpoints: ['/register', '/login', '/can-play', '/scores', '/profile']
    });
});

// REGISTER endpoint
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    try {
        // Check if username exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();
        
        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        
        // Check if email exists
        const { data: existingEmail } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();
        
        if (existingEmail) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const { data: newUser, error } = await supabase
            .from('users')
            .insert({
                username,
                email,
                password_hash: hashedPassword,
                games_today: 0,
                total_games: 0,
                best_score: 0,
                is_banned: false
            })
            .select()
            .single();
        
        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
        // Create JWT token
        const token = jwt.sign(
            { id: newUser.id, username: newUser.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({ 
            success: true, 
            token,
            username: newUser.username,
            gamesLeft: DAILY_GAME_LIMIT
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// LOGIN endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Missing credentials' });
    }
    
    try {
        // Find user
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (!user || error) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check if banned
        if (user.is_banned) {
            return res.status(403).json({ error: 'Account banned' });
        }
        
        // Reset games_today if new day
        const today = new Date().toDateString();
        const lastGame = user.last_game_date ? new Date(user.last_game_date).toDateString() : '';
        
        if (today !== lastGame) {
            await supabase
                .from('users')
                .update({ games_today: 0 })
                .eq('id', user.id);
            user.games_today = 0;
        }
        
        // Create JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({ 
            success: true, 
            token,
            username: user.username,
            gamesLeft: DAILY_GAME_LIMIT - user.games_today
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

// CHECK if can play
app.get('/can-play', authenticateToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('games_today, last_game_date')
            .eq('id', req.user.id)
            .single();
        
        if (error) throw error;
        
        // Reset if new day
        const today = new Date().toDateString();
        const lastGame = user.last_game_date ? new Date(user.last_game_date).toDateString() : '';
        
        if (today !== lastGame) {
            await supabase
                .from('users')
                .update({ 
                    games_today: 0,
                    last_game_date: new Date().toISOString()
                })
                .eq('id', req.user.id);
            
            user.games_today = 0;
        }
        
        const canPlay = user.games_today < DAILY_GAME_LIMIT;
        const gamesLeft = DAILY_GAME_LIMIT - user.games_today;
        
        res.json({ 
            canPlay, 
            gamesLeft,
            limit: DAILY_GAME_LIMIT
        });
        
    } catch (error) {
        console.error('Can play check error:', error);
        res.status(500).json({ error: 'Failed to check play status' });
    }
});

// GET scores (public endpoint for backward compatibility)
app.get('/scores', async (req, res) => {
    try {
        // Get from JSONBin for now (will migrate to Supabase later)
        const response = await axios.get(
            `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`,
            {
                headers: {
                    'X-Access-Key': JSONBIN_API_KEY
                }
            }
        );
        
        const scores = response.data.record || [];
        res.json(scores);
        
    } catch (error) {
        console.error('Error fetching scores:', error);
        res.status(500).json({ error: 'Failed to fetch scores' });
    }
});

// POST score (requires authentication)
app.post('/scores', authenticateToken, async (req, res) => {
    const { score, level } = req.body;
    
    try {
        // Get user data
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.user.id)
            .single();
        
        if (userError) throw userError;
        
        // Check daily limit
        const today = new Date().toDateString();
        const lastGame = user.last_game_date ? new Date(user.last_game_date).toDateString() : '';
        
        if (today !== lastGame) {
            user.games_today = 0;
        }
        
        if (user.games_today >= DAILY_GAME_LIMIT) {
            return res.status(429).json({ 
                error: 'Daily limit reached',
                gamesLeft: 0 
            });
        }
        
        // Save game session
        const { error: sessionError } = await supabase
            .from('game_sessions')
            .insert({
                user_id: req.user.id,
                score,
                level
            });
        
        if (sessionError) throw sessionError;
        
        // Update user stats
        const { error: updateError } = await supabase
            .from('users')
            .update({
                games_today: user.games_today + 1,
                total_games: user.total_games + 1,
                best_score: Math.max(user.best_score || 0, score),
                last_game_date: new Date().toISOString()
            })
            .eq('id', req.user.id);
        
        if (updateError) throw updateError;
        
        // Also save to JSONBin for backward compatibility
        try {
            // Get existing scores
            const getResponse = await axios.get(
                `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`,
                {
                    headers: {
                        'X-Access-Key': JSONBIN_API_KEY
                    }
                }
            );
            
            let scores = getResponse.data.record || [];
            
            // Add new score
            scores.push({
                name: req.user.username,
                score,
                level,
                date: new Date().toISOString()
            });
            
            // Sort and limit
            scores.sort((a, b) => b.score - a.score);
            scores = scores.slice(0, 100);
            
            // Save back
            await axios.put(
                `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`,
                scores,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Access-Key': JSONBIN_API_KEY
                    }
                }
            );
        } catch (jsonBinError) {
            console.error('JSONBin update failed:', jsonBinError);
            // Continue anyway
        }
        
        res.json({ 
            success: true,
            gamesLeft: DAILY_GAME_LIMIT - user.games_today - 1
        });
        
    } catch (error) {
        console.error('Save score error:', error);
        res.status(500).json({ error: 'Failed to save score' });
    }
});

// POST score without auth (for backward compatibility)
app.post('/scores-public', async (req, res) => {
    const { name, score, level } = req.body;
    
    try {
        // Get existing scores
        const getResponse = await axios.get(
            `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`,
            {
                headers: {
                    'X-Access-Key': JSONBIN_API_KEY
                }
            }
        );
        
        let scores = getResponse.data.record || [];
        
        // Add new score
        scores.push({
            name: name || 'Anonymous',
            score,
            level,
            date: new Date().toISOString()
        });
        
        // Sort and limit
        scores.sort((a, b) => b.score - a.score);
        scores = scores.slice(0, 100);
        
        // Save back
        await axios.put(
            `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`,
            scores,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Access-Key': JSONBIN_API_KEY
                }
            }
        );
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error saving public score:', error);
        res.status(500).json({ error: 'Failed to save score' });
    }
});

// GET user profile
app.get('/profile', authenticateToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('username, email, created_at, total_games, best_score, games_today')
            .eq('id', req.user.id)
            .single();
        
        if (error) throw error;
        
        res.json(user);
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Shacker Auth Server running on port ${PORT}`);
    console.log(`📊 Supabase connected to: ${supabaseUrl}`);
    console.log(`🔐 Auth system enabled with ${DAILY_GAME_LIMIT} games/day limit`);
});