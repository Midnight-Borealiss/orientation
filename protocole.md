# Protocole d'entretien — 90 minutes

Un entretien par responsable d'école, cinq au total. **Même protocole, même ordre,
mêmes portraits à chaque fois** : c'est la seule condition pour que les tris soient
comparables entre écoles. Un ordre modifié rend l'agrégation impossible.

## À préparer avant chaque rendez-vous

- Les huit portraits, imprimés sur cartes séparées (page de calibration retirée).
- La liste des domaines de cette école, extraite de `config/domaines_axes.json`,
  du plus porté au moins porté.
- Les lignes de `data/_paires.csv` de type `ambigue` concernant cette école.
- La liste des programmes de l'école, pour le contrôle du catalogue.
- Un moyen d'enregistrer les phrases prononcées — les justifications comptent autant
  que les tris.

## Séquencement recommandé sur les cinq entretiens

Enchaîner les écoles aux domaines voisins dans le temps, pour que les comparaisons
soient encore fraîches. En pratique : Management et Online rapprochés, Droit et Madiba
rapprochés.

---

## 0 · Cadrage — 10 min

Expliquer sans jargon : un questionnaire en ligne aidera un prospect à identifier vers
quelle famille de programmes se tourner, avant d'être orienté vers un conseiller. Le
contenu des programmes est déjà extrait des brochures — 84 programmes, 1918 modules.
On ne demande que ce que les brochures ne contiennent pas.

Deux points à dire explicitement, parce qu'ils changent la qualité des réponses :

- **L'outil n'est pas un test de personnalité et ne remplace pas un conseiller.** Il
  amène le prospect vers un humain.
- **Il n'y a pas de bonne réponse au tri.** Aucun portrait n'est meilleur qu'un autre.

## 1 · Tri de portraits — 35 min, ~6 min par domaine

Le cœur de l'entretien.

Pour chaque domaine de l'école, dans l'ordre décroissant de poids :

1. Donner les huit cartes.
2. Consigne, mot pour mot : « Range ces huit personnes en trois paquets : celles qui
   s'épanouiraient dans ce domaine, celles pour qui ce serait ni bien ni mal, et celles
   qui se tromperaient en venant. »
3. Noter la composition des trois paquets.
4. **Relancer sur un portrait du paquet « se tromperait » :** « Pourquoi celle-là ? »
   C'est cette relance qui produit les phrases exploitables.
5. Reprendre les cartes, passer au domaine suivant.

Ne pas commenter, ne pas suggérer, ne pas expliquer les axes. Si le responsable demande
sur quoi il doit trier, répondre : « sur votre intuition de qui réussit chez vous ».

Si le temps manque, traiter les domaines les plus portés et laisser les derniers : un
domaine à deux programmes pèse peu.

## 2 · Signaux d'alerte et accroches — 20 min

Par programme, en groupant ceux qui se ressemblent :

- **« À qui déconseillez-vous ce programme ? »** — la question la plus rentable de tout
  le dispositif. Noter la réponse telle quelle.
- **« Citez deux étudiants qui ont quitté ce programme, et pourquoi. »** — de
  l'anecdote, pas de l'abstraction. La mémoire fait le travail.
- **« Une phrase qui donne envie ? »** — pour `vitrine.accroche`.
- **« Trois traits du profil qui réussit ici ? »** — trois mots, pas un paragraphe.

Ne pas viser l'exhaustivité sur les 17 programmes. Couvrir les plus demandés, et
grouper : les cinq options d'une licence partagent souvent les mêmes signaux d'alerte.

## 3 · Les paires ambiguës — 10 min

Uniquement les lignes de type `ambigue` de `_paires.csv`. Deux paires sur tout le
catalogue, donc au plus une ou deux par école.

Pour chacune : « Ces deux programmes ont presque les mêmes modules. Un candidat hésite
entre les deux. **Quelle question lui posez-vous pour trancher, et quelle réponse
pointe vers lequel ?** »

Reporter la réponse dans les colonnes `question_de_departage` / `reponse_a` /
`reponse_b`, puis dans `config/departages.json`.

Ne pas soumettre les paires de type `option-soeurs` : leur départage est déjà dans leur
nom.

## 4 · Contrôle du catalogue — 10 min

Le catalogue date de 2024. Faire défiler la liste des programmes de l'école :

- Un programme a-t-il fermé, changé de nom, changé de niveau d'accès ?
- Un programme manque-t-il ?
- Les fiches signalées **orphelines** par l'extraction concernent-elles cette école ?

## 5 · Validation de bon sens — 5 min

Uniquement si le moteur tourne déjà. Montrer les trois recommandations produites pour
deux profils contrastés, et demander simplement : « est-ce que ça vous paraît juste ? »

Si le moteur n'est pas prêt, prévoir un second contact de dix minutes, par écrit. C'est
le seul objectif des cinq qui dépend du moteur — ne pas retarder l'entretien pour lui.

---

## Après chaque entretien, le jour même

1. Saisir les tris dans `config/domaines_axes.json`.
2. Passer les contrôles de cohérence de `portraits.md`.
3. Reporter les phrases récoltées, **mot pour mot**, dans un fichier de collecte.
4. Renseigner les fiches concernées et passer `meta.statut` à `a_valider`, avec
   `meta.sources` à `responsable`.

Le point 4 compte : l'extraction préserve désormais les champs marqués `responsable`,
mais elle ne peut protéger que ce qui est tracé.

## Le garde-fou indispensable

Avec une seule personne par école, aucune vérification croisée institutionnelle n'est
possible : le point de vue d'un responsable devient la donnée officielle de son école
entière, sans contradicteur.

**La cohorte d'étudiants actuels est donc obligatoire, pas optionnelle.** Vingt à trente
étudiants de 2e ou 3e année passent le quiz. S'il recommande la finance à un étudiant
de finance satisfait de son choix, le modèle tient. Sinon, on sait quelle école est mal
calibrée.

Coût : une matinée, aucun responsable mobilisé. C'est, dans cette configuration, la
partie la plus importante du dispositif.
