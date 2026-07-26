# Deux correctifs après le premier moteur

La simulation a mesuré deux choses qui bloquent l'usage réel. Les deux se règlent sans
dépendre des entretiens.

---

## 1. Générer la question de départage depuis le catalogue

### Le constat

Le départage se déclenche sur 32 % des profils, et **100 % de ces cas n'ont aucune
question disponible** — `config/departages.json` ne contient qu'un exemple. Un prospect
sur trois arrive donc à un point mort.

### La cause

`QUESTIONS.md` a omis une étape qui figurait dans le parcours acté : la question qui se
**génère depuis les métiers distinctifs** des programmes à égalité. C'est le mécanisme
central du principe « le catalogue porte la précision, les responsables portent
l'orientation ». Il ne dépend d'aucune collecte : `distinctivite` a déjà produit
`metiers_exclusifs` et `modules_exclusifs` pour 76 des 84 programmes.

### La cascade à implémenter

Quand deux filières ou plus sont à moins de `ecart_declenchant_departage`, essayer dans
cet ordre et s'arrêter au premier étage qui produit une question :

| Étage | Source | Disponible |
|---|---|---|
| 1. Question rédigée | `config/departages.json` | après entretiens |
| 2. **Question générée depuis les métiers exclusifs** | `distinctivite.metiers_exclusifs` | **maintenant** |
| 3. Question générée depuis les modules exclusifs | `distinctivite.modules_exclusifs` | maintenant |
| 4. Départage par disposition | `config/domaines_axes.json` | quand collecté |
| 5. Afficher à égalité | — | toujours |

L'étage 5 n'est pas un échec : « deux voies te correspondent également » est une réponse
honnête, et elle vaut mieux qu'un gagnant arbitraire. C'est ce qui avait été décidé.

Le moteur continue de remonter le motif à chaque étage franchi, comme il le fait déjà.

### Forme de la question générée

**Ne pas afficher une liste de métiers.** Formuler en situation, comme les questions de
profil — c'est la règle déjà appliquée partout ailleurs.

Gabarit, à partir de deux métiers exclusifs, un de chaque côté :

> Un mardi ordinaire, tu te vois plutôt {métier A} ou {métier B} ?

Les intitulés de métiers du catalogue sont des noms de poste (« Analyste programmeur »,
« Concepteur de systèmes embarqués »). Les insérer tels quels donne une phrase
acceptable ; ne pas chercher à les reformuler automatiquement, ce serait inventer.

Si plus de deux filières sont à égalité, poser la question sur les deux premières, puis
réévaluer.

### Cas à gérer

| Cas | Traitement |
|---|---|
| `metiers_exclusifs` vide d'un côté | passer à l'étage 3 |
| `modules_exclusifs` vide aussi | passer à l'étage 4 puis 5 |
| paire `option-soeurs` | la distinction est dans l'intitulé : afficher les deux noms et laisser choisir, sans question |
| filière `axes_fiables: false` | elle n'est pas classée, donc jamais en ex æquo |

### Test attendu

Après implémentation, mesurer sur la simulation la proportion d'ex æquo **résolus** par
étage. Objectif : l'étage 5 ne doit pas rester le cas majoritaire. Si les étages 2 et 3
en résolvent l'essentiel, la dépendance aux entretiens s'effondre — ce qui est le
résultat recherché.

---

## 2. Scinder l'aiguillage de `entreprise-management`

### Le constat

39 % du catalogue, et **17,8 filières encore classées en moyenne après filtres**, contre
4,0 pour `ingenierie-industrie`. Près de deux prospects sur cinq atterrissent dans la
branche où le score doit départager le plus, alors qu'on a mesuré qu'il discrimine mal.

### Diagnostic préalable, à produire avant de corriger

Sortir de la simulation le **taux de déclenchement du départage par famille**, et le
nombre moyen de filières classées par famille. Le 32 % global masque probablement une
branche très au-dessus et cinq très en dessous. Sans cette mesure, on corrige à l'aveugle.

### La correction

Ajouter une **seconde question d'aiguillage, posée uniquement si `entreprise-management`
est retenue** — les autres familles n'en ont pas besoin et ne doivent pas la subir.

Principe du découpage : ce que le prospect se voit gérer.

| Réponse | Domaines visés |
|---|---|
| Des personnes, des équipes | `rh` |
| Des projets, du début à la fin | `management-projet` |
| Des opérations, de la qualité, des flux | `qualite`, et les domaines d'opérations de la famille |
| Ma propre activité, que je crée | `entrepreneuriat` |
| Je ne veux pas me limiter | `gestion` et les domaines généralistes |

**Dériver la table exacte de l'appartenance réelle des domaines à la famille**, telle
qu'elle est dans `taxonomy.json` — la table ci-dessus est une hypothèse de découpage, pas
une liste à recopier. Aucun domaine de la famille ne doit rester inatteignable.

Garder la dernière option : un prospect qui hésite entre plusieurs de ces registres ne
doit pas être forcé, et `gestion` porte 23 fiches qui sont légitimement généralistes.

### Test attendu

Après correction, le nombre moyen de filières classées dans cette branche doit se
rapprocher de celui des autres familles. Exposer la mesure, comme `chargeParFamille()`,
pour qu'elle reste surveillée.

---

## Ce qui reste hors de ces deux points

Le départage par disposition reste inerte, et c'est normal : il attend les entretiens. Ne
pas l'activer artificiellement.

Une fois ces deux correctifs mesurés, la liste des paires réellement problématiques —
celles que ni les métiers ni les modules ne séparent — devient l'ordre du jour des cinq
entretiens. Elle sera très inférieure aux 57 paires de la distinctivité.
