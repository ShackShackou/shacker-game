# 🎮 Shacker Game Proxy

Proxy CORS sécurisé pour permettre au jeu Shacker de fonctionner sur OpenSea avec un leaderboard global.

## 🚀 Déploiement sur Render (GRATUIT)

### Étape 1: Créer un compte
1. Va sur [render.com](https://render.com)
2. Inscris-toi avec GitHub

### Étape 2: Créer un nouveau Web Service
1. Clique sur "New +" → "Web Service"
2. Choisis "Build and deploy from a Git repository"
3. Connecte ton GitHub si ce n'est pas déjà fait

### Étape 3: Configuration
- **Name**: `shacker-proxy`
- **Region**: Europe (Frankfurt)
- **Branch**: main
- **Root Directory**: `shacker-proxy` (si tu mets ce dossier dans ton repo)
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: **FREE** (0€/mois)

### Étape 4: Déployer
1. Clique sur "Create Web Service"
2. Attends 2-3 minutes
3. Tu obtiens une URL: `https://shacker-proxy.onrender.com`

## 📝 URLs de ton API

Une fois déployé, tu auras:
- **Base URL**: `https://shacker-proxy.onrender.com`
- **Get Scores**: `GET https://shacker-proxy.onrender.com/scores`
- **Save Score**: `POST https://shacker-proxy.onrender.com/scores`

## 🔧 Test Local (Optionnel)

```bash
# Installer les dépendances
npm install

# Lancer le serveur
npm start

# Tester sur http://localhost:3000
```

## 🔒 Sécurité

- ✅ La clé API JSONBin est cachée côté serveur
- ✅ CORS activé pour OpenSea
- ✅ Validation anti-triche (score max: 1,000,000)
- ✅ Top 100 scores uniquement

## 💡 Note importante

Après le déploiement, tu devras mettre à jour ton jeu pour utiliser cette nouvelle URL au lieu de l'API JSONBin directe.