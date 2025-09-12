const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 10000;

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://gbdlozmurnqrthxjihzk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // REQUIRED - Must be set in environment
if (!supabaseKey) {
    console.error('CRITICAL: SUPABASE_SERVICE_KEY not set in environment!');
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'shacker-secret-key-change-this-in-production-minimum-32-chars';

// For wallet verification
const { ethers } = require('ethers');

// Game settings
const DAILY_GAME_LIMIT = 10;

// JSONBin configuration (for backward compatibility)
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID || '68b08a1fd0ea881f40696e32';
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY; // Must be set in environment

// Middleware - Allow all Vercel deployments
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Allow all origins for now (including Vercel preview URLs)
        callback(null, true);
    },
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
            { expiresIn: '100y' } // Extended to 100 years
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
            { expiresIn: '100y' } // Extended to 100 years
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

// GET scores - ALL PLAYERS LEADERBOARD
app.get('/scores', async (req, res) => {
    try {
        // Get ALL players scores (not just NFT holders)
        const { data: topScores, error } = await supabase
            .from('users')
            .select('username, best_score, wallet_address')
            // Removed wallet filter - show everyone
            .gt('best_score', 0)
            .order('best_score', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        // Format for frontend
        const scores = topScores.map(user => ({
            name: user.username,
            score: user.best_score,
            level: Math.floor(user.best_score / 1000) + 1,
            hasWallet: !!user.wallet_address // Show if they have wallet
        }));
        
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
            .select('username, email, created_at, total_games, best_score, games_today, wallet_address')
            .eq('id', req.user.id)
            .single();
        
        if (error) throw error;
        
        // Check if can play today
        const today = new Date().toDateString();
        const lastGame = user.last_game_date ? new Date(user.last_game_date).toDateString() : '';
        
        if (today !== lastGame) {
            user.games_today = 0;
        }
        
        user.canPlay = user.games_today < DAILY_GAME_LIMIT;
        user.gamesLeft = DAILY_GAME_LIMIT - user.games_today;
        
        res.json(user);
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Link wallet to existing account (WITH SIGNATURE VERIFICATION)
app.post('/wallet/link', authenticateToken, async (req, res) => {
    const { wallet_address, signature, message } = req.body;
    
    if (!wallet_address || !signature || !message) {
        return res.status(400).json({ error: 'Wallet address, signature and message required' });
    }
    
    try {
        // CRITICAL: Check if wallet is already linked to ANOTHER account
        const { data: existingWalletUser } = await supabase
            .from('users')
            .select('username, id')
            .eq('wallet_address', wallet_address.toLowerCase())
            .single();
        
        if (existingWalletUser && existingWalletUser.id !== req.user.id) {
            return res.status(400).json({ 
                error: `This wallet is already linked to account: ${existingWalletUser.username}. One wallet can only be linked to one account.` 
            });
        }
        // Extract timestamp from message for validation
        const timestampMatch = message.match(/Timestamp: (.+)/);
        if (!timestampMatch) {
            return res.status(400).json({ error: 'Invalid message format' });
        }
        
        // Recreate the exact message that should have been signed
        const expectedMessage = `Link wallet to Shacker account: ${req.user.username}\nWallet: ${wallet_address}\nTimestamp: ${timestampMatch[1]}`;
        
        // Verify the message matches
        if (message !== expectedMessage) {
            return res.status(400).json({ error: 'Message mismatch' });
        }
        
        // Verify signature using ethers
        const recoveredAddress = ethers.utils.verifyMessage(message, signature);
        
        if (recoveredAddress.toLowerCase() !== wallet_address.toLowerCase()) {
            return res.status(401).json({ error: 'Invalid signature - you do not own this wallet!' });
        }
        
        // Check if wallet already linked to another account
        const { data: existingUser } = await supabase
            .from('users')
            .select('id, username')
            .eq('wallet_address', wallet_address)
            .single();
        
        if (existingUser && existingUser.id !== req.user.id) {
            return res.status(400).json({ error: 'Wallet already linked to another account' });
        }
        
        // Update user with wallet address
        const { data: updatedUser, error } = await supabase
            .from('users')
            .update({ wallet_address })
            .eq('id', req.user.id)
            .select()
            .single();
        
        if (error) throw error;
        
        res.json({
            success: true,
            message: 'Wallet linked successfully',
            wallet: wallet_address
        });
        
    } catch (error) {
        console.error('Wallet linking error:', error);
        res.status(500).json({ error: error.message || 'Failed to link wallet' });
    }
});

// Store wallet linking sessions
const linkSessions = new Map();

// Create wallet linking session
app.post('/wallet/create-session', authenticateToken, async (req, res) => {
    // Generate unique session ID
    const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Store session info
    linkSessions.set(sessionId, {
        userId: req.user.id,
        username: req.user.username,
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
        status: 'pending'
    });
    
    // Clean expired sessions
    for (const [key, value] of linkSessions.entries()) {
        if (Date.now() > value.expiresAt) {
            linkSessions.delete(key);
        }
    }
    
    res.json({ 
        success: true, 
        sessionId,
        linkUrl: `https://shacker-game.vercel.app/wallet-auto-link.html?session=${sessionId}&user=${req.user.username}`
    });
});

// Check session status
app.get('/wallet/check-session', async (req, res) => {
    const { id } = req.query;
    
    if (!id) {
        return res.status(400).json({ valid: false, error: 'No session ID provided' });
    }
    
    const session = linkSessions.get(id);
    
    if (!session || Date.now() > session.expiresAt) {
        return res.status(404).json({ valid: false, error: 'Session expired or not found' });
    }
    
    res.json({ 
        valid: true,
        status: session.status,
        username: session.username,
        walletAddress: session.walletAddress
    });
});

// Link wallet with session
app.post('/wallet/link-session', async (req, res) => {
    const { sessionId, walletAddress, signature, message } = req.body;
    
    if (!sessionId || !walletAddress || !signature || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get session
    const session = linkSessions.get(sessionId);
    if (!session || Date.now() > session.expiresAt) {
        return res.status(404).json({ error: 'Session expired or not found' });
    }
    
    try {
        // CRITICAL: Check if wallet is already linked to ANOTHER account
        const { data: existingWalletUser } = await supabase
            .from('users')
            .select('username, id')
            .eq('wallet_address', walletAddress.toLowerCase())
            .single();
        
        if (existingWalletUser && existingWalletUser.id !== session.userId) {
            return res.status(400).json({ 
                error: `This wallet is already linked to account: ${existingWalletUser.username}. One wallet can only be linked to one account.` 
            });
        }
        // Verify signature
        const { ethers } = require('ethers');
        const recoveredAddress = ethers.utils.verifyMessage(message, signature);
        
        if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        
        // Update user with wallet
        const { data: updatedUser, error } = await supabase
            .from('users')
            .update({ wallet_address: walletAddress })
            .eq('id', session.userId)
            .select()
            .single();
        
        if (error) throw error;
        
        // Update session
        session.status = 'completed';
        session.walletAddress = walletAddress;
        linkSessions.set(sessionId, session);
        
        res.json({
            success: true,
            message: 'Wallet linked successfully!',
            wallet: walletAddress,
            username: session.username
        });
        
    } catch (error) {
        console.error('Session wallet linking error:', error);
        res.status(500).json({ error: error.message || 'Failed to link wallet' });
    }
});

// Poll session status (for game to check)
app.get('/wallet/session-status', authenticateToken, async (req, res) => {
    const { sessionId } = req.query;
    
    if (!sessionId) {
        return res.status(400).json({ error: 'No session ID' });
    }
    
    const session = linkSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.userId !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    res.json({
        status: session.status,
        walletAddress: session.walletAddress,
        completed: session.status === 'completed'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Shacker Auth Server v2.0 running on port ${PORT}`);
    console.log(`📊 Supabase connected to: ${supabaseUrl}`);
    console.log(`🔐 Auth system enabled with ${DAILY_GAME_LIMIT} games/day limit`);
    console.log(`🦊 MetaMask wallet auth enabled`);
    console.log(`✅ Session-based wallet linking enabled`);
});