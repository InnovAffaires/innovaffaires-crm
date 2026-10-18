# InnovAffaires — site et CRM

Ce dépôt contient tout ce qu'il faut pour publier, sur Netlify :

- le site **www.innovaffaires.com** ;
- le **CRM InnovAffaires**, à l'adresse **/crm/** (par exemple https://www.innovaffaires.com/crm/).

## Contenu du dépôt

| Fichier | Rôle |
| --- | --- |
| `paquet.tgz` | Le site, le CRM et son serveur, en un seul fichier. **C'est le fichier à remplacer pour toute mise à jour.** |
| `construire.mjs` | Ouvre `paquet.tgz` et vérifie qu'il est complet. Lancé automatiquement par Netlify. |
| `netlify.toml` | Réglages de publication. |
| `package.json` | Description technique minimale. |

## Mettre à jour

1. Sur GitHub, ouvrez ce dépôt, puis **Add file → Upload files**.
2. Déposez le nouveau `paquet.tgz` (il remplace l'ancien).
3. Cliquez sur **Commit changes**. Netlify republie le site tout seul en une à deux minutes.

Ne modifiez pas les autres fichiers à la main. Les données du CRM (contacts, dossiers, factures…) ne sont **pas** dans ce dépôt : elles restent dans le stockage de Netlify et ne sont pas touchées par une mise à jour.
