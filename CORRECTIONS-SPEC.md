# Corrections de spec avant écriture du moteur

À appliquer à `CLAUDE.md`, aux fichiers de `config/`, et à `scripts/distinctivite.mjs`.

Huit points. Les cinq premiers corrigent des décisions qui ont changé depuis leur
rédaction — la spec actuelle **contredit** ce qui a été décidé, ce qui est plus
dangereux qu'une spec absente : une session future implémenterait fidèlement une
formule fausse, sans qu'aucun test ne casse.

Aucun code de moteur dans cette session. Spec, configs, et distinctivité uniquement.

---

## 1. La métrique — remplacer la distance euclidienne

**Supprimer** de `CLAUDE.md`, section « Calcul du score » :

```
d     = sqrt( Σ (profil[axe] - filiere.axes[axe])² )
score = 100 × (1 - d / sqrt(5 × 4²))
```

**Raison du retrait, à consigner dans la spec.** La normalisation des axes est
`note = 1 + floor(proportion_de_modules / 0.1)`, plafonnée à 5. Un 5 exige donc 40 %
des modules sur un seul axe, et environ 74 % des modules sont reconnus par au moins un
lexique. Un programme dispose ainsi d'une masse d'environ 1,0 à répartir sur cinq
axes : **au plus deux axes peuvent atteindre 4 simultanément**, et la plupart des
programmes ont un seul axe dominant. Les histogrammes le confirment — 46 fiches sur 84
à 1 sur `technique`, 57 à 1 sur `creatif`.

Les vecteurs de filière sont donc **pointus par construction**. Une distance
euclidienne sur valeurs brutes favorise alors systématiquement les programmes tièdes,
parce qu'un vecteur plat est proche de tout. Cas vérifié :

| Vecteur | quant | tech | rel | créa | cadre |
|---|---|---|---|---|---|
| Prospect, pic sur technique | 4 | 5 | 4 | 3 | 4 |
| A — type Génie logiciel | 1 | 5 | 1 | 1 | 2 |
| B — type management généraliste | 3 | 3 | 4 | 3 | 2 |

Euclidienne : A = 43 %, B = 66 %. B gagne, alors que le prospect a un profil technique
et que B est un programme de management. C'est le comportement à éliminer.

**Remplacer par une corrélation de forme** — cosinus sur vecteurs centrés, soit un
Pearson — sur les **5 axes comptés** :

```
p̄ = moyenne(profil)        f̄ = moyenne(filiere.axes)
num = Σ (profil[i] - p̄) × (filiere.axes[i] - f̄)
den = sqrt(Σ (profil[i] - p̄)²) × sqrt(Σ (filiere.axes[i] - f̄)²)
r   = num / den            // dans [-1, 1]
```

Sur le même cas : A = 0,82, B = 0,00. Renversement, et c'est le résultat correct.

**Cas limite à gérer sans planter.** Si `den == 0`, le vecteur est plat et n'a pas de
forme. Côté filière ce ne devrait pas arriver : vérifier et lever une alerte. Côté
prospect c'est possible s'il répond de façon très équilibrée : se replier alors sur les
parts de budget — convertir les deux vecteurs en proportions de leur somme, puis
euclidienne — et **signaler le repli** dans la sortie.

**Ne jamais afficher `r`.** Trois niveaux seulement, voir point 2.

---

## 2. Les seuils — retirer les chiffres inventés

Dans `config/departages.json`, les valeurs actuelles sont sur la mauvaise échelle :
elles supposaient un score 0-100, or `r` vit dans [-1, 1]. Elles avaient de plus été
fixées avant toute observation de données.

**Provisoire, explicitement marqué à recalibrer :**

```json
"_seuils": {
  "_statut": "provisoire — a recalibrer par simulation, voir point 5",
  "correspondance_forte": 0.60,
  "correspondance_bonne": 0.30,
  "ecart_declenchant_departage": 0.10
}
```

| Niveau affiché | Condition |
|---|---|
| correspondance forte | r ≥ 0,60 |
| bonne correspondance | 0,30 ≤ r < 0,60 |
| correspondance possible | r < 0,30 |

Départage déclenché quand `r₁ − r₂ < ecart_declenchant_departage`.

Sur cinq dimensions seulement, la corrélation est bruitée : les ex æquo seront
fréquents. Le mécanisme de départage doit donc fonctionner en régime normal, ce n'est
pas un cas rare.

---

## 3. Les axes de disposition passent au niveau DOMAINE

`CLAUDE.md` indique aujourd'hui le niveau **famille**. Décision changée : niveau
**domaine**.

**Raison, à consigner.** Le scoring intervient après l'aiguillage, donc à l'intérieur
d'une famille. Au niveau famille, `ancrage` et `abstraction` seraient identiques pour
tous les programmes de cette famille : deux constantes s'ajoutant identiquement à
chaque distance, donc **aucun pouvoir discriminant** là où on en a besoin. Au niveau
domaine, ils varient à l'intérieur d'une famille (≈ 5 domaines par famille).

Renommer `config/familles_axes.json` en `config/domaines_axes.json`, une entrée par
domaine réellement utilisé, `ancrage` et `abstraction` à `null`,
`_statut: "a_collecter"`. Conserver le tri du domaine le plus porté au moins porté.

**Deux règles à écrire dans le fichier :**

- **Domaines partagés.** `finance` apparaît chez Management, Online et Ingénieurs.
  Trancher : propriétaire unique par domaine, ou moyenne des réponses. Si moyenne, un
  désaccord entre deux responsables est un signal à consigner, pas à lisser.
- **Filière à deux domaines.** 19 fiches sur 84 portent deux domaines. Les valeurs de
  disposition d'une fiche sont la **moyenne simple** de celles de ses domaines.

**Méthode de collecte, à documenter** (elle a changé, elle ne repose plus sur un tri de
portraits fictifs) : chaque responsable **classe ses domaines** du plus « bureau et
dossiers » au plus « terrain et déplacement », puis du plus « concret, résultat visible
vite » au plus « abstrait, plusieurs réponses défendables ». Deux ou trois domaines
repères communs — par exemple `logistique` et `droit` — sont insérés dans chaque
classement, y compris hors de l'école concernée, pour rendre les cinq classements
comparables entre eux.

Mettre à jour `validate.mjs` : conserver l'invariant « un domaine appartient à une
famille et une seule » ; ajouter « tout domaine utilisé par une fiche existe dans
`domaines_axes.json` ».

---

## 4. Comment les 2 axes de disposition entrent dans le score

**Ne pas les mélanger aux 5 axes comptés dans la corrélation.** Les 5 axes comptés sont
compositionnels — ils se partagent un budget de modules. Les 2 axes de disposition sont
des notations indépendantes. Les réunir dans un même vecteur centré mêle deux natures
de mesure et rend `r` ininterprétable.

| Rôle | Mécanisme |
|---|---|
| Classement principal | corrélation de forme sur les **5 axes comptés** |
| Départage des proches | distance sur les **2 axes de disposition** |

Quand deux filières sont à moins de `ecart_declenchant_departage`, comparer d'abord
leur distance de disposition au profil du prospect. Ce n'est qu'ensuite, si l'écart
reste faible, qu'on pose la question de départage de `config/departages.json`.

Cohérent avec le niveau domaine : les ex æquo surviennent majoritairement entre
domaines voisins d'une même famille, et c'est là que les axes de disposition varient.

**Marquer comme à valider** au premier test du moteur : si les axes de disposition ne
départagent presque jamais rien, reconsidérer.

---

## 5. Ajouter une tâche de calibration des seuils

À écrire dans `CLAUDE.md`, section « à faire », comme tâche distincte **après**
l'écriture du moteur :

> Simuler quelques centaines de profils de prospects — tirage sur les réponses
> possibles aux questions de profil, pas un tirage uniforme sur les axes —, calculer la
> distribution des `r` obtenus, et placer les bornes des trois niveaux sur cette
> distribution réelle. Objectifs indicatifs : « correspondance forte » doit rester
> minoritaire, « correspondance possible » ne doit pas être le cas majoritaire, et le
> départage ne doit pas se déclencher sur plus d'un tiers des profils.

---

## 6. Distinctivité — sortir les 3 paires les plus proches par domaine

Le seuil de 80 % ne suffit pas comme critère de sélection. Deux raisons.

**L'appariement exact sous-estime le recouvrement.** C'est un choix délibéré et
correct — un appariement flou rendrait le taux ininterprétable — mais il faut en
assumer la conséquence. Exemple vérifié entre `licence-en-genie-logiciel-reseaux-et-systemes`
et `licence-en-electronique-telecommunications-et-systemes-embarques` :
`Technologies JAVA-.NET & Python` et `Programmation Python` sont comptés comme deux
modules distincts alors qu'ils partagent Python. Le taux mesuré est donc une **borne
inférieure**.

**Le moteur doit départager tous les programmes d'un domaine**, pas seulement les
quasi-jumeaux. Les paires à 60-79 % sont celles où le catalogue distingue un peu mais
où le scoring produira quand même des ex æquo. La paire ci-dessus partage 17 modules et
ne figure vraisemblablement pas au-dessus de 80 % — elle est pourtant manifestement à
départager.

**Le recouvrement de modules ne prédit pas l'ex æquo.** Deuxième mesure nécessaire :
la **corrélation d'axes** entre programmes d'un même domaine, calculée comme au point 1.
Vérifié sur la paire ci-dessus :

| | quant | tech | rel | créa | cadre |
|---|---|---|---|---|---|
| Génie logiciel – Réseaux et Systèmes | 2 | 5 | 2 | 1 | 2 |
| Électronique, Télécoms et Systèmes embarqués | 2 | 5 | 1 | 1 | 1 |

`r = 0,95`. Quel que soit le profil du prospect, ces deux programmes obtiendront des
scores quasi identiques et le départage se déclenchera systématiquement — alors que leur
recouvrement de modules ne dépasse vraisemblablement pas 80 %. **Deux mesures
différentes, et c'est la corrélation d'axes qui prédit l'ex æquo.**

**Modifier la sortie** de `scripts/distinctivite.mjs` : pour chaque domaine, les **3
paires les plus proches selon chacune des deux mesures** — recouvrement de modules
**ou** corrélation d'axes. Conserver les deux valeurs dans la sortie, et conserver le
marquage `option-soeurs` / `ambigue` existant.

Ajouter au contrôle de couverture des lexiques, déjà en place : signaler tout programme
dont le taux de modules non reconnus dépasse nettement la moyenne du catalogue (≈ 26 %).
C'est ce contrôle qui aurait détecté seul le bug d'UX Design, à 55 % de modules non
reconnus.

---

## 7. Générer les fiches de comparaison

Nouveau livrable, `scripts/fiches-comparaison.mjs` : une fiche par paire retenue au
point 6, prête à imprimer, servant de document de travail en entretien.

Contenu de chaque fiche :

- en-tête : école, domaine, niveau, taux de recouvrement mesuré ;
- **socle partagé** — les modules communs, présentés comme ne distinguant rien ;
- pour chaque programme : ses modules exclusifs, et ses débouchés exclusifs ;
- les trois questions à poser, dans cet ordre fixe :
  1. Pour vous, qu'est-ce qui les distingue réellement ?
  2. Vers quoi mène l'une que l'autre ne mène pas ?
  3. Un étudiant qui réussit dans l'une pourrait-il être en difficulté dans l'autre ?
     À quoi le verriez-vous ?
- un espace de saisie des réponses, au format qui alimente `config/departages.json`.

**Aucune de ces questions ne demande au responsable de formuler pour un prospect.** Les
responsables enseignent, ils ne sont presque jamais en contact avec les candidats : leur
demander de rédiger une question d'orientation produirait une réponse inventée qui
aurait l'apparence d'une donnée. La rédaction des questions du quiz est un travail de
conception, fait ensuite, à partir de leur substance et du vocabulaire recueilli auprès
des admissions.

Cas des paires à cheval sur deux écoles — par exemple Master Audit à Online et MBA Audit
à Management : générer alors une **demi-fiche** par école, portant les trois questions
sur le seul programme que ce responsable connaît. Le contraste est reconstruit ensuite.

---

---

## 8. Exploiter la structure en UE, pas seulement les modules

Le comptage actuel traite les 1918 modules comme un sac de mots et **jette la structure
en unités d'enseignement**. Or c'est elle qui porte les distinctions que les axes ne
voient pas.

### Le constat

Deux paires du catalogue, vérifiées :

| Paire | L'un | L'autre |
|---|---|---|
| Génie logiciel · Électronique-Télécoms | large sur soft, hard et réseau | profond sur le matériel, la programmation au service du matériel |
| Maths appliquées-Économétrie · Modélisation statistique | large : ML, big data, actuariat, économétrie | profond : risque crédit, scoring, séries temporelles, R/STATA/GRETL |

Dans les deux cas, la distinction est une **direction** — qu'est-ce qui sert à quoi — et
une **étendue**. Un comptage de modules voit que les deux programmes contiennent de
l'électronique, du réseau et de la programmation. Il ne peut pas voir laquelle sert à
laquelle.

### Le marqueur détectable

`licence-en-genie-logiciel-reseaux-et-systemes` porte une UE **Management &
Organisations** : management des processus, management de projet, droit du numérique,
obligations juridiques et fiscales, droit du travail.

`licence-en-mathematiques-appliquees-informatique-et-econometrie` porte la **même UE,
aux mêmes modules**.

`licence-en-electronique-telecommunications-et-systemes-embarques` ne l'a pas.
`licence-modelisation-statistique-informatique-economique-et-financiere` ne l'a pas.

Ce bloc est la signature d'un programme tourné vers l'entreprise plutôt que vers
l'approfondissement technique. Il sépare les deux paires, dans le même sens, sans aucun
lexique.

### Trois exploitations, par ordre de simplicité

1. **UE type, attribut booléen.** Détecter les UE récurrentes du catalogue (par
   similarité de leur intitulé et de leurs modules) et poser un attribut par programme.
   `bloc_management_droit: true/false` sépare immédiatement les deux paires ci-dessus.
2. **Concentration.** Un programme dont une seule UE porte 60 % des modules est
   spécialisé ; un programme réparti également sur six UE est généraliste. Calculable
   dès aujourd'hui, sans donnée nouvelle. Candidat à devenir un attribut affiché — et
   peut-être, après test, un axe.
3. **UE d'appartenance comme qualificateur.** `Programmation Python` dans une UE
   « Électronique et Systèmes Embarqués » ne joue pas le même rôle que dans une UE
   « Développement web et d'applications ». Même mot, deux fonctions. À terme, le
   lexique devrait pondérer un module selon l'UE qui le porte.

Commencer par 1 et 2, qui sont peu coûteux et immédiatement vérifiables. Le point 3 est
une refonte du comptage : ne pas l'engager sans mesurer d'abord ce que 1 et 2 apportent.

### Détection de paires par les UE

Ajouter à `distinctivite.mjs` une troisième mesure : comparer les **listes d'UE** de deux
programmes du même domaine. Signaler les paires dont les modules se recouvrent fortement
mais dont les UE diffèrent nettement — ce sont les cas où une vraie distinction existe et
où le comptage actuel est aveugle.

### Candidats à vérifier

Le schéma devrait se reproduire partout où deux programmes couvrent le même terrain avec
une direction opposée :

- `mba-big-data-et-intelligence-artificielle` · `mastere-big-data-data-strategie`
- `mba-management-et-securite-des-systemes-d-information` · `mba-ingenierie-reseaux-et-systemes-decisionnels`
- `master-marketing-digital-en-ligne` · `mastere-marketing-digital-brand-content`
- `licence-en-informatique-appliquee-a-la-gestion-des-entrepris` · `licence-en-informatique` · `licence-en-genie-logiciel-reseaux-et-systemes`

Produire le tableau comparatif de leurs UE, sans conclure à leur place : c'est aux
responsables de confirmer le sens de la distinction.

## Contrôles avant de clore la session

- `CLAUDE.md` ne contient plus aucune trace de la formule euclidienne ni des seuils 85/70.
- `CLAUDE.md` dit **domaine**, plus jamais **famille**, pour les axes de disposition.
- `config/domaines_axes.json` existe et couvre tous les domaines utilisés, valeurs à `null`.
- `config/familles_axes.json` n'existe plus.
- `distinctivite.mjs` sort 3 paires par domaine selon les deux mesures, valeurs conservées.
- Les attributs d'UE (bloc type, concentration) sont calculés et présents dans les fiches.
- `npm run validate` et `npm test` passent.
- La section « Ne pas faire » de `CLAUDE.md` gagne deux lignes :
  - « Comparer les niveaux des axes. Les vecteurs sont pointus par construction ;
    seules les formes se comparent. »
  - « Demander à un responsable de formuler une question pour un prospect. Il apporte
    la substance, pas la rédaction. »
