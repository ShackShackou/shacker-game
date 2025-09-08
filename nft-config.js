// NFT Configuration for Shacker Game
// EXCLUSIVE NFT HOLDERS ONLY

const NFT_CONFIG = {
    // Your NFT contract address on Ethereum/Polygon
    CONTRACT_ADDRESS: '0x...YOUR_NFT_CONTRACT_HERE...', // TODO: Add your contract
    
    // Chain ID (1 = Ethereum, 137 = Polygon, 5 = Goerli testnet)
    CHAIN_ID: 1,
    
    // Required to play
    REQUIRE_NFT: true,
    
    // Number of NFTs in collection
    TOTAL_SUPPLY: 50,
    
    // Benefits for holders
    HOLDER_BENEFITS: {
        unlimited_games: true,
        exclusive_skins: true,
        special_badge: true,
        multiplier: 2 // 2x points
    },
    
    // Messages
    MESSAGES: {
        no_nft: "🔒 This game is exclusive to NFT holders! Get your NFT on OpenSea to play.",
        checking: "🔍 Verifying NFT ownership...",
        verified: "✅ NFT verified! Welcome to the exclusive club!",
        error: "❌ Could not verify NFT. Please try again."
    }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NFT_CONFIG;
}