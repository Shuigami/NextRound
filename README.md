# NextRound

Suivi esport personnel pour **League of Legends, Valorant, Rocket League et Overwatch**. L'app sert d'abord à
**comprendre** chaque compétition : comment fonctionne le format, où en sont vos équipes et ce que chaque match change pour elles.

- **Frontend** : Next.js 16, React 19, TypeScript, Tailwind CSS 4 (`frontend/`)
- **Backend** : FastAPI, SQLAlchemy 2, Alembic (`backend/`)
- **Base** : PostgreSQL 17
- **Données** : PandaScore (réel) ou mode démonstration (fictif)

## Démarrage rapide (Docker)

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

Puis ouvrez http://localhost:3000. Par défaut, l'app démarre en **mode démonstration** : aucune clé n'est requise.

## Démarrage en développement (sans Docker pour l'app)

Prérequis : Python 3.12, Node 24, Docker (pour la base uniquement).

```bash
docker compose up -d db
```

Backend :

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Linux/macOS : .venv/bin/pip
cp .env.example .env
.venv/Scripts/alembic upgrade head
.venv/Scripts/uvicorn app.main:app --reload --port 8000
```

Frontend (dans un autre terminal) :

```bash
cd frontend
npm install
npm run dev
```

Le navigateur n'appelle que `/api/*` sur le port 3000. Next relaie ces appels vers `API_URL`, par défaut `http://localhost:8000`.

## Modes de données

Le mode se choisit dans `backend/.env` :

| Variable | Rôle |
| --- | --- |
| `DATA_MODE` | `demo` (fictif, par défaut) ou `pandascore` (réel) |
| `PANDASCORE_TOKEN` | Clé API PandaScore. Utilisée **uniquement** par le backend. |
| `DATABASE_URL` | Connexion PostgreSQL |
| `SYNC_INTERVAL_MINUTES` | Fréquence de synchronisation (15 par défaut) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Connexion Google facultative (voir plus bas). Vides : le bouton n'apparaît pas. |
| `PUBLIC_URL` | Adresse du site vue par le navigateur (`http://localhost:3000` par défaut), utilisée dans les liens envoyés par e-mail |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Envoi des e-mails de compte. Sans `SMTP_HOST`, ils s'affichent dans la console du backend. |

### Mode démonstration

`DATA_MODE=demo`. Les équipes, joueurs, compétitions, règlements et résultats sont **inventés**. Un bandeau le rappelle
sur chaque page. Les horaires sont relatifs au moment de la synchronisation, qui est refaite toutes les 24 h : la démo garde ainsi
toujours un passé, un direct et un futur. La démo couvre :

- une **poule** avec dépendances entre résultats (LoL, Coupe Astrale) et une édition précédente au format différent ;
- une **ronde suisse** avec un match reporté (Valorant, Vanguard Masters) ;
- une **double élimination** avec un match en direct (Rocket League, Open Turbo) ;
- une **saison régulière en FT3** suivie de playoffs (Overwatch, Ligue Zénith).

### Données réelles (PandaScore)

1. Créez un compte sur https://pandascore.co et récupérez votre token.
2. Dans `backend/.env` : `DATA_MODE=pandascore` et `PANDASCORE_TOKEN=votre_token`.
3. Redémarrez le backend. Une synchronisation se lance au démarrage, puis à chaque intervalle. Pour la forcer à la main :
   `.venv/Scripts/python -m app.sync`.

La clé n'est jamais envoyée au navigateur : toutes les requêtes PandaScore partent du backend, qui met les données en cache
dans PostgreSQL pour tous les utilisateurs.

### Comptes et connexion Google (facultatifs)

Sans compte, tout fonctionne : les favoris restent dans le navigateur. Un compte (e-mail + mot de passe, ou Google) les
synchronise entre appareils, avec un nom d'utilisateur et une photo de profil facultatifs.

- **Vérification de l'adresse** : un lien (valable 48 h) est envoyé à l'inscription, et peut être renvoyé depuis la page Compte.
- **Mot de passe oublié** : un lien (valable 1 h) permet d'en choisir un nouveau. Il ferme toutes les sessions ouvertes,
  et sert aussi à ajouter un mot de passe à un compte Google.
- **Une adresse = un compte.** Se connecter avec Google à l'adresse d'un compte e-mail existant relie les deux. Si cette
  adresse n'a jamais été vérifiée, le mot de passe est **retiré** : quelqu'un d'autre a pu l'inscrire avec un mot de passe à lui.

En développement, sans `SMTP_HOST`, les liens s'affichent dans la console du backend.

Pour activer Google :

1. Dans https://console.cloud.google.com, créez un ID client OAuth de type « Application Web ».
2. URI de redirection autorisée : `http://localhost:3000/api/auth/google/callback` (en production : `{PUBLIC_URL}/api/auth/google/callback`).
3. Dans `backend/.env` : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, et `PUBLIC_URL` en production. Redémarrez le backend.

Les données démo et réelles cohabitent en base sans se mélanger : chaque ligne porte sa `source`. Les favoris sont aussi
stockés séparément pour chaque mode.

## Architecture

```
backend/app/providers/   adaptateurs fournisseurs → format normalisé (base.py)
  pandascore.py          pagination (Link), 429 + Retry-After, mapping league → serie → tournament
  demo.py                données fictives cohérentes
backend/app/sync.py      upsert idempotent (source + source_id), suivi par ressource (table sync_state)
backend/app/rules.py     chargement et validation des règles par édition et par phase
backend/rules/*.yaml     règles pédagogiques, séparées des résultats, avec sources et date de vérification
backend/app/scenarios.py « Ce que ce match change »
backend/app/api.py       API lue par le frontend
frontend/lib/            client API, favoris, anti-spoil, préférences locales
frontend/components/     cartes de match, composants pédagogiques (format/), classements, tableaux
```

**Hiérarchie** : compétition (league PandaScore) → édition (serie) → phase (tournament) → match.

**Ajouter un fournisseur** : implémenter `resources()` et `fetch_rosters()` (voir `providers/base.py`) et l'enregistrer dans
`sync.get_provider()`. Le reste de l'application n'est pas touché.

**Synchronisation PandaScore** : un cycle télécharge, pour chacun des 4 jeux, les matchs `running`, `upcoming` (3 pages max)
et `past` (2 pages max, pour récupérer corrections de score et reports). Les effectifs sont rafraîchis par lots de 100 équipes,
au plus une fois toutes les 24 h. Cela fait environ 20 à 30 requêtes par cycle, soit environ 100 par heure à 15 minutes.
L'offre gratuite autorise 1 000 requêtes par heure et 60 par minute. Une ressource en erreur n'empêche pas les autres de se
synchroniser. L'erreur est visible dans `/api/meta`, et l'interface signale les données anciennes.

## Règles de format et scénarios

Les règles sont définies **par édition et par phase**, jamais par jeu, dans `backend/rules/<clé>.yaml`. Chaque fichier
contient :

- le résumé « en 30 secondes », la place dans le circuit et les récompenses ;
- pour chaque phase : type (`round_robin`, `swiss`, `single_elimination`, `double_elimination`), participants, formats
  BO/FT, conditions de qualification et d'élimination, départages, exceptions ;
- les issues structurées : par place pour une poule, seuils de victoires et défaites pour une ronde suisse, issue de chaque
  tour pour un tableau ;
- les **sources** et la **date de vérification**.

Un fichier invalide (places non couvertes, ronde suisse sans seuils, tableau sans tours, absence de source) **empêche le
backend de démarrer**. Pour une édition PandaScore, `edition_source_id` est l'id de la *serie* et `phase_source_ids` les
ids des *tournaments*. Pour un tableau, les matchs doivent aussi être rattachés à un tour (`bracket_round`) : PandaScore ne le
fournit pas directement (voir les limites).

« Ce que ce match change » :

- **Poule** : énumération exhaustive des résultats restants de la poule. L'outil indique si l'issue est certaine, de quel
  match elle dépend (« si X bat Y… ») ou si un départage est nécessaire. Seule la confrontation directe à deux équipes est
  calculée. Les autres départages sont affichés comme « Égalité à départager », sans résultat inventé.
- **Ronde suisse** : bilan actuel et seuils de qualification et d'élimination.
- **Tableaux** : issue de victoire ou de défaite propre au tour.
- **Données insuffisantes** (pas de règle, résultat manquant, poule incomplète, tour inconnu) : « Scénario indéterminé »,
  avec la raison.

## Anti-spoil

Le bouton en haut de page masque les scores (terminés et en direct), les vainqueurs, les classements, les tableaux et les
enjeux d'un match, car un bilan révèle les résultats précédents. On peut révéler un match seul ou toute une compétition.
Les révélations sont mémorisées localement. Les affiches à venir peuvent révéler indirectement des résultats : l'interface le
signale.

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest      # moteur de scénarios, adaptateur PandaScore, synchronisation (Postgres)
cd frontend && npm test                            # favoris, anti-spoil
```

Les tests de synchronisation utilisent la base configurée avec une source `test` isolée, puis la nettoient. Ils sont ignorés
si PostgreSQL est indisponible.

## Limites connues

**Couverture PandaScore (à vérifier avec votre clé)**

- L'offre gratuite est décrite « par jeu ». La page tarifs ne permet pas de savoir si les quatre jeux sont inclus gratuitement.
  Vérifiez la réponse des quatre endpoints `/{lol,valorant,rl,ow}/matches/upcoming` avec votre token.
- Les scores finaux des matchs passés peuvent relever de l'offre payante « Historical ». S'ils manquent, l'app affiche le
  match sans score et les scénarios de poule deviennent indéterminés.
- Effectifs : `role` n'est renseigné que pour certains jeux, `age` et `birthday` sont payants (non utilisés), les photos sont
  souvent absentes. Des avatars de secours sont affichés.
- La couverture des tournois mineurs, des rosters et des liens de stream varie : ne pas supposer qu'elle est complète.
- Les conditions d'utilisation de PandaScore (attribution, cache, redistribution) n'ont pas été vérifiées. Lisez-les avant
  toute diffusion publique.
- Le préfixe `/valorant/` vient de votre cahier des charges. Il n'a pas été confirmé sur une page de référence de la doc.

**Fonctionnalités**

- **Aucun fichier de règles réel n'est fourni.** Les six fichiers livrés décrivent les compétitions fictives de la démo. En mode
  PandaScore, les éditions affichent « Format non documenté » tant que vous n'avez pas ajouté leurs règles, vérifiées sur le
  règlement officiel.
- Tableaux réels : la synchronisation appelle `/tournaments/{id}/brackets` pour les 20 phases à élimination les plus
  récentes (fenêtre de 14 jours). Les colonnes sont déduites des liens `previous_matches` : tour = profondeur dans le graphe,
  repêchage = match alimenté par un perdant, grande finale = match alimenté par les deux tableaux. Les noms de tours viennent
  du fournisseur (traduits quand ils sont standard). Sans fichier de règles, ces tableaux n'ont toujours pas de scénario
  « Ce que ce match change », et un match sans lien apparaît sous « Hors tableau ».
- Les organisations PandaScore sont déduites du nom normalisé des équipes (même nom dans plusieurs jeux = même organisation).
  Des regroupements erronés restent possibles.
- Les classements affichés sont recalculés à partir des matchs, sans les départages officiels. Les égalités sont signalées par
  « = ». Les standings PandaScore ne sont pas encore importés.
- Pas de live détaillé ni de statistiques (offres payantes), pas de compte utilisateur, pas de notifications. Les favoris
  restent dans le navigateur.
- Le mode démo n'a pas de liens de stream (ils seraient fictifs). L'affichage des streams n'est donc exercé qu'avec des données
  réelles et par les tests de l'adaptateur.
