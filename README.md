# 🎮 SHACKER GAME - Configuration Sécurisée

## 🚀 OPTION 1 : VERSION ACTUELLE (Simple et rapide)
**URL pour OpenSea** : `https://shackshackou.github.io/shacker-game/`
- ✅ Fonctionne déjà !
- ⚠️ Clé API visible (mais limitée au leaderboard)
- 👍 Suffisant pour un jeu fun

## 🔒 OPTION 2 : VERSION SÉCURISÉE (Recommandée)

### Étape 1 : Déployer sur Netlify (GRATUIT)
1. Va sur [Netlify.com](https://www.netlify.com)
2. Connecte-toi avec GitHub
3. Clique "Import from Git"
4. Choisis ton repo `shacker-game`
5. Netlify va déployer automatiquement !

### Étape 2 : Configurer les variables
Dans Netlify :
1. Va dans Site Settings > Environment Variables
2. Ajoute ces variables :
   - `JSONBIN_BIN_ID` = `68b08a1fd0ea881f40696e32`
   - `JSONBIN_API_KEY` = Ta clé API JSONBin

### Étape 3 : Utiliser la version sécurisée
1. Renomme `index-backend.html` en `index.html`
2. Git push
3. Netlify redéploiera automatiquement

### Étape 4 : Sur OpenSea
**URL** : `https://ton-site.netlify.app/`

## 📝 Pour ton app NFT_WAFFLE
La clé API dans ton app PC reste la même, pas besoin de changer !

## 🎯 Résumé
- **Pour tester rapidement** : Utilise GitHub Pages (Option 1)
- **Pour la sécurité** : Utilise Netlify (Option 2)
- **Les deux sont 100% GRATUITS !**