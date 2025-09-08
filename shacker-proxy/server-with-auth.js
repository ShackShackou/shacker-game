const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcrypt');
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

// Game settings
const DAILY_GAME_LIMIT = 10;

// JSONBin configuration (for backward compatibility)
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID || '68b08a1fd0ea881f40696e32';
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY; // Must be set in environment

// Middleware - Allow Vercel and other origins
app.use(cors({
    origin: function(origin, callback) {
        // Allow all origins for now to fix the issue
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
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
        
        // Create JWT token with longer expiry
        const token = jwt.sign(
            { id: newUser.id, username: newUser.username },
            JWT_SECRET,
            { expiresIn: '100y' } // Basically eternal (100 years)
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
        
        // Create JWT token with longer expiry
        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '100y' } // Eternal (100 years)
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

// GET scores for NFT holders only
app.get('/scores/holders', async (req, res) => {
    try {
        // Get only users with wallet addresses (NFT holders)
        const { data: holders, error } = await supabase
            .from('users')
            .select('username, best_score, wallet_address')
            .not('wallet_address', 'is', null)
            .gt('best_score', 0)
            .order('best_score', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        const scores = holders.map(user => ({
            name: user.username,
            score: user.best_score,
            wallet: user.wallet_address.slice(0, 6) + '...',
            level: Math.floor(user.best_score / 1000) + 1
        }));
        
        res.json(scores);
        
    } catch (error) {
        console.error('Error fetching holder scores:', error);
        res.status(500).json({ error: 'Failed to fetch holder scores' });
    }
});

// GET scores - ALL PLAYERS LEADERBOARD
app.get('/scores', async (req, res) => {
    try {
        // Get ALL players scores (everyone can appear on leaderboard)
        const { data: topScores, error } = await supabase
            .from('users')
            .select('username, best_score, wallet_address')
            // REMOVED wallet filter - show EVERYONE
            .gt('best_score', 0)
            .order('best_score', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        // Format for frontend
        const scores = topScores.map(user => ({
            name: user.username,
            score: user.best_score,
            level: Math.floor(user.best_score / 1000) + 1,
            hasWallet: !!user.wallet_address // Show who has wallet
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

// UPDATE username
app.post('/update-username', authenticateToken, async (req, res) => {
    const { newUsername } = req.body;
    
    if (!newUsername || newUsername.length < 3 || newUsername.length > 20) {
        return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    
    try {
        // Check if username already taken
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('username', newUsername)
            .single();
        
        if (existing) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        
        // Update username
        const { data: updated, error } = await supabase
            .from('users')
            .update({ username: newUsername })
            .eq('id', req.user.id)
            .select()
            .single();
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            username: updated.username 
        });
        
    } catch (error) {
        console.error('Username update error:', error);
        res.status(500).json({ error: 'Failed to update username' });
    }
});

// GET user profile
app.get('/profile', authenticateToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('username, email, created_at, total_games, best_score, games_today, wallet_address, has_nft')
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

// Import wallet auth module
const WalletAuth = require('./wallet-auth');
const walletAuth = new WalletAuth(supabase, JWT_SECRET);

// WALLET ROUTES

// Get nonce for wallet signature
app.post('/wallet/nonce', async (req, res) => {
    const { address } = req.body;
    
    if (!address) {
        return res.status(400).json({ error: 'Wallet address required' });
    }
    
    try {
        const nonce = walletAuth.generateNonce();
        await walletAuth.saveNonce(address, nonce);
        res.json({ nonce });
    } catch (error) {
        console.error('Nonce generation error:', error);
        res.status(500).json({ error: 'Failed to generate nonce' });
    }
});

// Verify wallet signature and authenticate
app.post('/wallet/verify', async (req, res) => {
    const { address, signature, nonce } = req.body;
    
    if (!address || !signature || !nonce) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        // Validate nonce
        const nonceValid = await walletAuth.validateNonce(address, nonce);
        if (!nonceValid) {
            return res.status(401).json({ error: 'Invalid or expired nonce' });
        }
        
        // Recreate the message that was signed
        const message = `🎮 Welcome to Shacker Game!\n\nSign this message to prove you own this wallet.\n\nWallet: ${address}\nNonce: ${nonce}\n\nThis won't cost any gas.`;
        
        // Verify signature
        const isValid = walletAuth.verifySignature(message, signature, address);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        
        // Check NFT ownership (optional for leaderboard access)
        const NFT_CONTRACT = process.env.NFT_CONTRACT_ADDRESS;
        let hasNFT = false;
        
        // Only check NFT if contract address is configured
        if (NFT_CONTRACT && NFT_CONTRACT !== '0x...') {
            try {
                hasNFT = await walletAuth.checkNFTOwnership(address, NFT_CONTRACT);
            } catch (error) {
                console.log('NFT check skipped - no valid contract configured');
            }
        } else {
            console.log('NFT verification disabled - no contract address set');
        }
        
        // Find or create user
        const user = await walletAuth.findOrCreateUserByWallet(address);
        
        // Update NFT status in database
        if (hasNFT) {
            await supabase
                .from('users')
                .update({ has_nft: true })
                .eq('id', user.id);
        }
        
        // Create JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username, wallet: address, hasNFT },
            JWT_SECRET,
            { expiresIn: '100y' }
        );
        
        res.json({
            success: true,
            token,
            username: user.username,
            wallet: address,
            hasNFT,
            gamesLeft: hasNFT ? 999 : DAILY_GAME_LIMIT - user.games_today,
            leaderboardAccess: hasNFT
        });
        
    } catch (error) {
        console.error('Wallet verification error:', error);
        res.status(500).json({ error: 'Wallet verification failed' });
    }
});

// Link wallet to existing account (WITH SIGNATURE VERIFICATION)
app.post('/wallet/link', authenticateToken, async (req, res) => {
    const { wallet_address, signature, message } = req.body;
    
    if (!wallet_address || !signature || !message) {
        return res.status(400).json({ error: 'Wallet address, signature and message required' });
    }
    
    try {
        // IMPORTANT: Verify the signature to prove ownership
        const expectedMessage = `Link wallet to Shacker account: ${req.user.username}\nWallet: ${wallet_address}\nTimestamp: ${message.split('Timestamp: ')[1]}`;
        
        // Verify signature using ethers
        const { ethers } = require('ethers');
        const recoveredAddress = ethers.utils.verifyMessage(expectedMessage, signature);
        
        if (recoveredAddress.toLowerCase() !== wallet_address.toLowerCase()) {
            return res.status(401).json({ error: 'Invalid signature - you do not own this wallet!' });
        }
        
        // Now we know they really own the wallet
        const updatedUser = await walletAuth.linkWalletToUser(req.user.id, wallet_address);
        
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

// Removed code-based wallet linking - using direct link instead

// Check NFT ownership
app.post('/wallet/check-nft', async (req, res) => {
    const { wallet_address, contract_address, token_id } = req.body;
    
    if (!wallet_address || !contract_address) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        const ownsNFT = await walletAuth.checkNFTOwnership(wallet_address, contract_address, token_id);
        
        res.json({
            owns_nft: ownsNFT,
            wallet: wallet_address,
            contract: contract_address
        });
        
    } catch (error) {
        console.error('NFT check error:', error);
        res.status(500).json({ error: 'NFT ownership check failed' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Shacker Auth Server v2.1 FIXED running on port ${PORT}`);
    console.log(`📊 Supabase connected to: ${supabaseUrl}`);
    console.log(`🔐 Auth system enabled with ${DAILY_GAME_LIMIT} games/day limit`);
    console.log(`🦊 MetaMask wallet auth enabled`);
    console.log(`✅ ALL PLAYERS can now appear on leaderboard!`);
});