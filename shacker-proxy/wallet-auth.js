// Wallet Authentication Module for Shacker Backend
const { ethers } = require('ethers');
const crypto = require('crypto');

class WalletAuth {
    constructor(supabase, jwtSecret) {
        this.supabase = supabase;
        this.jwtSecret = jwtSecret;
    }

    // Générer un nonce unique pour la signature
    generateNonce() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Sauvegarder le nonce temporairement
    async saveNonce(walletAddress, nonce) {
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        
        const { error } = await this.supabase
            .from('wallet_nonces')
            .upsert({
                wallet_address: walletAddress.toLowerCase(),
                nonce: nonce,
                expires_at: expiresAt.toISOString()
            });

        if (error) {
            throw new Error('Failed to save nonce');
        }
    }

    // Récupérer et valider le nonce
    async validateNonce(walletAddress, nonce) {
        const { data, error } = await this.supabase
            .from('wallet_nonces')
            .select('*')
            .eq('wallet_address', walletAddress.toLowerCase())
            .eq('nonce', nonce)
            .gte('expires_at', new Date().toISOString())
            .single();

        if (error || !data) {
            return false;
        }

        // Supprimer le nonce après utilisation
        await this.supabase
            .from('wallet_nonces')
            .delete()
            .eq('wallet_address', walletAddress.toLowerCase());

        return true;
    }

    // Vérifier la signature du wallet
    verifySignature(message, signature, expectedAddress) {
        try {
            const recoveredAddress = ethers.utils.verifyMessage(message, signature);
            return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
        } catch (error) {
            console.error('Signature verification failed:', error);
            return false;
        }
    }

    // Créer ou récupérer un utilisateur par wallet
    async findOrCreateUserByWallet(walletAddress) {
        // Chercher un utilisateur existant avec ce wallet
        const { data: existingUser } = await this.supabase
            .from('users')
            .select('*')
            .eq('wallet_address', walletAddress.toLowerCase())
            .single();

        if (existingUser) {
            return existingUser;
        }

        // Créer un nouvel utilisateur avec le wallet
        const username = `Player_${walletAddress.slice(2, 8)}`;
        const { data: newUser, error } = await this.supabase
            .from('users')
            .insert({
                username: username,
                email: `${walletAddress.toLowerCase()}@wallet.local`,
                wallet_address: walletAddress.toLowerCase(),
                wallet_verified: true,
                wallet_linked_at: new Date().toISOString(),
                password_hash: crypto.randomBytes(32).toString('hex'), // Random non-utilisable
                games_today: 0,
                total_games: 0,
                best_score: 0,
                is_banned: false
            })
            .select()
            .single();

        if (error) {
            throw new Error('Failed to create wallet user');
        }

        return newUser;
    }

    // Lier un wallet à un compte existant
    async linkWalletToUser(userId, walletAddress) {
        // Vérifier que le wallet n'est pas déjà lié
        const { data: existingWallet } = await this.supabase
            .from('users')
            .select('id')
            .eq('wallet_address', walletAddress.toLowerCase())
            .single();

        if (existingWallet && existingWallet.id !== userId) {
            throw new Error('Wallet already linked to another account');
        }

        // Mettre à jour l'utilisateur
        const { data, error } = await this.supabase
            .from('users')
            .update({
                wallet_address: walletAddress.toLowerCase(),
                wallet_verified: true,
                wallet_linked_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            throw new Error('Failed to link wallet');
        }

        return data;
    }

    // Vérifier la possession d'un NFT avec ethers.js
    async checkNFTOwnership(walletAddress, contractAddress, tokenId = null) {
        try {
            const { ethers } = require('ethers');
            
            // Use public RPC for checking (Infura, Alchemy, or public endpoint)
            const provider = new ethers.providers.JsonRpcProvider(
                process.env.ETH_RPC_URL || 'https://eth-mainnet.public.blastapi.io'
            );
            
            // ERC721 ABI for balanceOf
            const abi = [
                'function balanceOf(address owner) view returns (uint256)',
                'function ownerOf(uint256 tokenId) view returns (address)'
            ];
            
            const contract = new ethers.Contract(contractAddress, abi, provider);
            
            // Check if wallet owns any NFT from this collection
            const balance = await contract.balanceOf(walletAddress);
            
            console.log(`NFT Check: ${walletAddress} owns ${balance.toString()} NFTs from ${contractAddress}`);
            
            return balance.gt(0);
        } catch (error) {
            console.error('NFT check failed:', error);
            // En dev/test, on peut retourner true pour tester
            if (process.env.NODE_ENV === 'development') {
                return true;
            }
            return false;
        }
    }
}

module.exports = WalletAuth;