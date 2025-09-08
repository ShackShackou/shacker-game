// Wallet Connection Module for Shacker Game
// Système hybride : Auth classique + MetaMask

class WalletConnector {
    constructor(apiUrl) {
        this.apiUrl = apiUrl;
        this.provider = null;
        this.signer = null;
        this.address = null;
        this.chainId = null;
    }

    // Vérifier si MetaMask est installé
    isMetaMaskInstalled() {
        return typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask;
    }

    // Se connecter à MetaMask
    async connectWallet() {
        if (!this.isMetaMaskInstalled()) {
            throw new Error('MetaMask is not installed! Please install it from metamask.io');
        }

        try {
            // Demander l'accès au wallet
            const accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
            });
            
            this.address = accounts[0];
            this.chainId = await window.ethereum.request({ 
                method: 'eth_chainId' 
            });

            // Écouter les changements de compte
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.disconnect();
                } else {
                    this.address = accounts[0];
                    this.onAccountChange(accounts[0]);
                }
            });

            // Écouter les changements de réseau
            window.ethereum.on('chainChanged', (chainId) => {
                window.location.reload();
            });

            return {
                address: this.address,
                chainId: this.chainId
            };
        } catch (error) {
            console.error('Wallet connection failed:', error);
            throw error;
        }
    }

    // Obtenir un nonce du serveur pour la signature
    async getNonce(address) {
        const response = await fetch(`${this.apiUrl}/wallet/nonce`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ address })
        });

        if (!response.ok) {
            throw new Error('Failed to get nonce');
        }

        const data = await response.json();
        return data.nonce;
    }

    // Signer un message pour prouver la propriété du wallet
    async signMessage(message) {
        if (!this.address) {
            throw new Error('Wallet not connected');
        }

        try {
            const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [message, this.address]
            });
            return signature;
        } catch (error) {
            console.error('Signature failed:', error);
            throw error;
        }
    }

    // Authentifier avec le wallet
    async authenticateWithWallet() {
        if (!this.address) {
            await this.connectWallet();
        }

        try {
            // 1. Obtenir un nonce unique du serveur
            const nonce = await this.getNonce(this.address);
            
            // 2. Message à signer
            const message = `🎮 Welcome to Shacker Game!\n\nSign this message to prove you own this wallet.\n\nWallet: ${this.address}\nNonce: ${nonce}\n\nThis won't cost any gas.`;
            
            // 3. Demander la signature
            const signature = await this.signMessage(message);
            
            // 4. Envoyer au serveur pour vérification
            const response = await fetch(`${this.apiUrl}/wallet/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    address: this.address,
                    signature: signature,
                    nonce: nonce
                })
            });

            if (!response.ok) {
                throw new Error('Wallet verification failed');
            }

            const data = await response.json();
            return data; // Token JWT ou session
        } catch (error) {
            console.error('Wallet authentication failed:', error);
            throw error;
        }
    }

    // Lier le wallet au compte existant
    async linkWalletToAccount(authToken) {
        if (!this.address) {
            throw new Error('Wallet not connected');
        }

        try {
            const response = await fetch(`${this.apiUrl}/wallet/link`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    wallet_address: this.address
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to link wallet');
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Wallet linking failed:', error);
            throw error;
        }
    }

    // Vérifier si le wallet possède un NFT spécifique
    async checkNFTOwnership(contractAddress, tokenId = null) {
        if (!this.address) {
            throw new Error('Wallet not connected');
        }

        try {
            const response = await fetch(`${this.apiUrl}/wallet/check-nft`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    wallet_address: this.address,
                    contract_address: contractAddress,
                    token_id: tokenId
                })
            });

            if (!response.ok) {
                throw new Error('NFT check failed');
            }

            const data = await response.json();
            return data.owns_nft;
        } catch (error) {
            console.error('NFT ownership check failed:', error);
            throw error;
        }
    }

    // Déconnexion
    disconnect() {
        this.address = null;
        this.chainId = null;
        this.provider = null;
        this.signer = null;
    }

    // Callback pour changement de compte
    onAccountChange(newAccount) {
        console.log('Account changed to:', newAccount);
        // À implémenter dans l'app principale
    }

    // Formatter l'adresse pour l'affichage
    formatAddress(address) {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    // Obtenir le nom du réseau
    getNetworkName(chainId) {
        const networks = {
            '0x1': 'Ethereum Mainnet',
            '0x5': 'Goerli Testnet',
            '0x89': 'Polygon',
            '0x38': 'BSC',
            '0xa86a': 'Avalanche'
        };
        return networks[chainId] || 'Unknown Network';
    }
}

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WalletConnector;
}