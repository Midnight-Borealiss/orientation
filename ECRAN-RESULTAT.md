# Écran de résultat — spécification

À implémenter en JavaScript sans framework, un seul fichier HTML, aucune dépendance.
Le moteur est importé comme module ES ; l'interface affiche et renvoie un indice, elle ne
calcule rien.

---

## 1. Contraintes techniques

| Contrainte | Raison |
|---|---|
| Aucune dépendance, aucune étape de build | le projet restera sans maintenance entre deux catalogues ; `git push` suffit à déployer |
| Mobile d'abord, une seule colonne, ~380 px | les prospects sont sur téléphone, parfois en données limitées |
| Poids total sous 50 ko, polices système | premier affichage immédiat sur réseau lent |
| État sérialisé dans le fragment d'URL | un prospect peut reprendre plus tard, ou envoyer le lien à un parent |
| Aucune donnée personnelle collectée | rien à déclarer, rien à protéger |

L'état du moteur étant un objet nu, `location.hash` suffit — pas de stockage, pas de
serveur.

---

## 2. Contrat — ce que le moteur doit exposer

L'écran a besoin de ces informations. Si l'état actuel ne les porte pas toutes, les
ajouter au résultat plutôt que de les recalculer côté interface.

```
resultat = {
  niveau,                  // "forte" | "bonne" | "possible" | "egalite" | "impasse"
  profil,                  // vecteur 5 axes, pour la reformulation
  recommande: {
    id, nom, ecole, modalites, niveau_acces,
    modules_distinctifs,   // depuis distinctivite
    metiers,               // debouches.metiers
    exigence_quantitative,
    vitrine                // accroche, description — souvent vides
  },
  chaine: {
    famille,               // libellé de la famille retenue
    sous_famille,          // si A2 posée
    candidats_apres_filtres,  // nombre
    etage_resolveur,       // 1..5, lequel a tranché
    element_tranchant      // le métier ou le module qui a départagé
  },
  alternatives: [ { id, nom, ecole, modalites, differenciateur } ],
  non_classes: [ { id, nom, ecole, modalites } ],
  alertes                  // motifs remontés par le moteur
}
```

`element_tranchant` est ce qui permet d'écrire la troisième ligne du « pourquoi ». Sans
lui, la justification devient générique et perd son intérêt.

---

## 3. Les cinq états

La simulation donne les proportions. Un même gabarit pour tous serait malhonnête.

| État | Fréquence | Posture |
|---|---|---|
| `forte` | 25 % | recommandation affirmée |
| `bonne` | ~40 % | recommandation, alternatives plus présentes |
| `possible` | 35 % | direction, pas réponse — le conseiller passe en haut |
| `egalite` | 2 % | deux cartes de même poids, aucun gagnant |
| `impasse` | rare | le jeu candidat est vide, le moteur est revenu à la famille |

### Ordre des blocs par état

| Bloc | forte | bonne | possible | egalite | impasse |
|---|---|---|---|---|---|
| Reformulation | 1 | 1 | 1 | 1 | 1 |
| Conseiller | — | — | **2** | — | **2** |
| Recommandation | 2 | 2 | 3 | — | — |
| Deux cartes égales | — | — | — | 2 | — |
| Contenu et débouchés | 3 | 3 | 4 | 3 | — |
| Avertissement quantitatif | 4 | 4 | 5 | 4 | — |
| Alternatives | 5 | **4** (avant le contenu) | 6 | 5 | 3 |
| Non classés | 6 | 6 | 7 | 6 | 4 |
| Conseiller | 7 | 7 | — | 7 | — |

En `possible`, le badge ne doit pas ressembler à un échec. Formulation retenue :
« une piste à explorer », pas « correspondance faible ».

En `impasse`, dire ce qui s'est passé sans jargon. **Corrigé :** cette section confondait
deux situations, et sa formulation promettait « la famille entière » sur un écran qui
n'affichait rien.

| Situation | Ce qui existe | Ce que l'écran fait |
|---|---|---|
| aucun candidat après filtres et aiguillage | rien | dit qu'aucun programme ne réunit ces réponses, et rouvre F1/F2 |
| des candidats, mais **aucun comparable** à un profil | 28 combinaisons du catalogue | les **affiche sans les classer**, en attribuant le manque à la brochure |
| l'aiguillage fin a vidé le jeu, retour à la famille | un classement complet | **ce n'est pas une impasse** : classement normal + mention d'élargissement |

**Ne jamais annoncer un contenu absent, ni taire un contenu présent** — ce sont les deux
faces de la même faute. Et **ne jamais élargir silencieusement** : un prospect qui croit
avoir été entendu alors qu'on a élargi sa demande est plus mal traité qu'un prospect à qui
l'on dit la vérité.

---

## 4. Les blocs

### Reformulation

Obligatoire, en tête, sur tous les états. Construite depuis les deux ou trois axes les
plus écartés de la moyenne du profil, avec des fragments pré-écrits.

Nouveau fichier `config/reformulation.json` : par axe, un fragment pour le haut et un
pour le bas, à la deuxième personne. Aucun appel réseau, aucune génération de texte.

Assemblage : « Si je comprends bien : {fragment 1}, {fragment 2}, et {fragment 3}. »
Deux fragments si le troisième axe est peu marqué.

Le bouton « Ce n'est pas ça ? Reprendre » a le même poids visuel que la phrase.

### Recommandation

Nom, école, modalité, diplôme requis. **La modalité doit être visible** : ISM Online et
ISF étant des écoles distinctes, un même intitulé peut apparaître deux fois, et un
prospect verrait sinon un doublon inexpliqué.

Le « pourquoi » en trois lignes numérotées, chacune tirée de `chaine` :

1. la famille retenue, et la sous-famille si A2 a été posée
2. le nombre de candidats après filtres, et le choix qui a réduit
3. `element_tranchant` — le métier ou le module qui a départagé

La troisième ligne change de formulation selon `etage_resolveur` : métier exclusif,
module exclusif, ou nom de l'option pour les sœurs.

### Contenu et débouchés

**Dégradation obligatoire.** `vitrine.accroche` est vide sur les 84 fiches et arrivera
par les entretiens.

| Disponible | Afficher |
|---|---|
| `vitrine.accroche` | l'accroche, puis les modules |
| accroche vide | les modules distinctifs seuls |
| modules absents | les métiers seuls |
| les deux absents | omettre le bloc, ne pas laisser un cadre vide |

Même règle pour `deconseille_si` : affiché quand il existe, absent sinon, sans
réorganiser l'écran.

### Avertissement quantitatif

Affiché seulement si `exigence_quantitative.modules_comptes` est non nul — la médiane du
catalogue est à 0, donc le bloc sera souvent absent.

Ton informatif, jamais dissuasif. C'est une information à connaître, pas un obstacle.

### Alternatives

Deux voisins du même domaine, **sans score comparatif** entre eux ni avec la
recommandation.

Le `differenciateur` d'une ligne se **génère** depuis le module ou le métier exclusif du
voisin — jamais rédigé à la main, jamais inventé. Si aucun élément exclusif n'est
disponible, afficher le nom seul. Une phrase fausse est pire qu'une phrase absente.

### Non classés

Les fiches `axes_fiables: false` qui passent les filtres et relèvent de la famille
retenue. Seize fiches au catalogue, dont tout le pôle Paix, Sécurité et Diplomatie.

Formulation imposée : **le contenu publié** de ces programmes ne permet pas la
comparaison. Le défaut est documentaire, il vient de la brochure. Ne jamais laisser
entendre que le programme est moins bon.

### Conseiller

Position variable selon l'état, voir le tableau. Le texte affirme que le résultat est une
piste et non une décision — c'est à la fois plus honnête et l'intérêt d'ISM, puisque ça
mène à un humain plutôt que de prétendre le remplacer.

L'action reste à câbler : lien WhatsApp avec message pré-rempli portant le programme
recommandé, ou formulaire. À trancher avec les admissions.

---

## 5. Le bouton Reprendre

**Corrigé.** Cette section prescrivait le profil dans tous les cas ; c'était faux en état
`impasse`, où le bouton ne pouvait rien corriger et l'écran devenait un cul-de-sac.

La cible dépend de l'état :

| État | Reprendre rouvre |
|---|---|
| forte · bonne · possible · egalite | les **sept questions de profil**, en conservant filtres et aiguillage |
| **impasse** | **F1 et F2**, en conservant aiguillage et profil |

Hors impasse, la reformulation porte sur le profil et refaire les filtres serait punir le
prospect d'avoir corrigé. En impasse, c'est l'inverse : ce sont les filtres qui ont vidé le
jeu, et rouvrir le profil ne changerait rien.

Dans les deux cas, les réponses précédentes sont pré-sélectionnées, modifiables. L'état étant
immuable, il suffit de repartir de l'état antérieur — aucune remise à zéro.

Le moteur tranche la cible (`resultat.reprise`) : l'interface ne doit pas la déduire, deux
interfaces la déduiraient différemment.

---

## 6. Interdits

- **Aucun pourcentage, aucune valeur de `r`**, nulle part, y compris en attribut de
  données ou en commentaire HTML.
- **Aucun nom de filière, d'école ou de domaine en dur** dans le code de l'interface.
  Tout vient du résultat du moteur.
- **Aucun texte inventé** sur un programme. Ce qui n'est pas dans les données ne
  s'affiche pas.
- **Aucun `localStorage`, aucun cookie, aucun script tiers.**
- Ne jamais choisir une réponse par défaut à la place du prospect.

---

## 7. Tests attendus

| Test | Ce qu'il attrape |
|---|---|
| les cinq états rendent sans erreur | avec des fiches réelles pour chacun |
| une fiche sans accroche ni module rend sans cadre vide | la dégradation |
| aucun nombre de score dans le DOM produit | parcours récursif du rendu |
| aucun identifiant de filière dans le source de l'interface | comme pour le moteur |
| l'état survit à un aller-retour par l'URL | reprise de parcours |
| rendu correct à 380 px de large | contrainte mobile |
| poids total du fichier sous 50 ko | contrainte réseau |
