# Correctifs et section avis

Deux parties. La première corrige trois défauts, dont deux viennent de la spec. La seconde
ajoute la collecte des retours des testeurs.

---

## Partie 1 — trois correctifs

### 1. Option F2 : le libellé promet deux modalités, le filtre n'en cherche qu'une

**Reproduction :** répondre bac+3, puis « le week-end ou le soir ». Résultat : état
`impasse`, aucun programme.

**Cause.** Les deux catalogues n'emploient pas le même mot. Le catalogue Master écrit
« cours du soir » — cinq fois, jamais « week-end ». Le catalogue Bachelor écrit
« week-end » et « full time », jamais « cours du soir ». Les programmes du soir accessibles
à bac+3 sont donc tous étiquetés `cours-du-soir`, et l'option F2 filtre sur `week-end`
seul.

**Correction.** La valeur d'une option de filtre doit pouvoir désigner **plusieurs
modalités**, et une fiche est retenue si l'une d'elles correspond :

```json
{ "label": "Le week-end ou le soir, je travaille", "valeur": ["week-end", "cours-du-soir"] }
```

**Vérifier les autres options** pour le même défaut : `presentiel` doit-il aussi couvrir
`full-time` ? Le catalogue Bachelor emploie les deux termes, et un candidat qui répond
« sur le campus, en journée » désigne les deux sans le savoir.

**Test.** Pour chaque option de filtre, l'ensemble des modalités qu'elle désigne doit
couvrir tout ce que son libellé promet, et l'union de toutes les options doit couvrir
toutes les modalités de la taxonomie. Une modalité qu'aucune option n'atteint est un
programme inatteignable.

### 2. Le bouton Reprendre en état `impasse`

Il rouvre les sept questions de profil. Or l'impasse vient des **filtres** : le bouton ne
peut rien corriger, et l'écran est sans issue.

**Correction.** La cible du bouton dépend de l'état :

| État | Reprendre rouvre |
|---|---|
| forte · bonne · possible · egalite | les questions de profil |
| **impasse** | **F1 et F2**, réponses précédentes pré-sélectionnées |

Corriger aussi `ECRAN-RESULTAT.md`, section 5, qui prescrivait le profil dans tous les cas.

### 3. Le texte annonce une liste absente

L'écran affiche « voici l'ensemble de l'univers que tu as retenu » et rien ne suit. Soit la
liste de repli n'est pas rendue, soit la phrase ne doit pas être écrite.

**Ne jamais annoncer un contenu absent.** Si la liste existe, la rendre ; sinon, supprimer
la promesse.

### Vérification annexe

Sur ce parcours, la reformulation tombe sur « tes réponses sont trop partagées ». Vérifier
si `profil` est bien transmis en état `impasse`, ou s'il reçoit un vecteur vide — le repli
se déclencherait alors pour une mauvaise raison.

### Test à ajouter, indépendant de toute hypothèse

Balayer **toutes les combinaisons de F1 × F2 × A1**, et pour chacune vérifier que l'écran
produit comporte au moins une action possible. Une impasse est acceptable ; une impasse
sans retour en arrière ne l'est pas.

Ce test aurait attrapé le défaut n°1, qu'aucun test écrit depuis la spec ne pouvait
trouver — puisque la spec était elle-même fausse.

---

## Partie 2 — section avis pour les testeurs

### Principe

Un retour donné **au moment où la personne bute** vaut beaucoup plus qu'un retour
reconstitué après coup.

Et un **bouton à taper** rapporte bien plus qu'un champ à remplir. Sur mobile, écrire trois
phrases est un effort que peu font ; toucher un bouton n'en est pas un. Le champ libre
reste disponible pour ceux qui veulent développer.

### Où

Sur **tous les écrans** : accueil, chacune des questions, résultat. Placé en bas du
contenu, discret, jamais en travers du parcours.

### Quoi

Deux niveaux. Le premier est un bouton unique, dont le libellé dépend de l'écran :

| Écran | Bouton |
|---|---|
| une question | « Cette question n'est pas claire » |
| le résultat | « Ce résultat me surprend » |
| l'accueil | « Quelque chose ne va pas » |

Un seul geste, aucune saisie. C'est celui qui produira le volume.

Le second niveau apparaît **après** ce premier geste : un champ libre facultatif, avec une
question ouverte — « qu'est-ce qui te gêne ? » — et un envoi. Facultatif veut dire que le
retour est déjà enregistré si la personne n'écrit rien.

### Contexte joint automatiquement

Sans que le testeur ait à le décrire :

| Champ | Contenu |
|---|---|
| `ecran` | identifiant de l'écran, `F1`, `P3`, `resultat`… |
| `etat` | l'état sérialisé du parcours |
| `niveau` | l'état de résultat, si applicable |
| `commentaire` | le texte libre, souvent vide |
| `agent` | le navigateur, pour reproduire un défaut d'affichage |

`etat` permet de rejouer exactement le parcours qui a produit la gêne. C'est ce qui rend
un retour exploitable plutôt qu'anecdotique.

### Les deux pièges

**Le formulaire doit être écrit littéralement dans le HTML statique**, comme celui de
validation — Netlify détecte les formulaires en analysant le HTML déployé. Un second
formulaire dynamique échouerait silencieusement, exactement comme le premier l'aurait fait.

**Le POST va vers `/web/`**, pas vers `/` : la redirection de `netlify.toml` s'applique
aussi au POST.

### Garde-fous

- Visible **seulement avec `?test=1`** dans l'adresse. Un vrai candidat ne doit jamais voir
  un bouton de signalement — ça donne l'impression d'un site en travaux.
- Un seul envoi par écran et par session, pour éviter les doubles clics et les envois
  répétés qui consommeraient le quota.
- L'échec d'envoi ne bloque jamais le parcours et n'efface rien.
- Aucune donnée personnelle, comme pour le formulaire de validation.

### Un compteur à surveiller

L'offre gratuite de Netlify limite le nombre d'envois de formulaires par mois — de l'ordre
de la centaine, à vérifier car ces limites changent. Entre les avis des testeurs et les
trente réponses de validation, la marge n'est pas énorme.

Deux conséquences : la règle « un envoi par écran et par session » n'est pas cosmétique, et
il faut regarder le compteur dans le tableau de bord avant de lancer la cohorte étudiante.
