# Validation par la cohorte étudiante

Le seul test qui dise si le modèle a raison. Une matinée, aucun responsable mobilisé, et
il doit précéder les entretiens : montrer un outil qui se trompe à un directeur d'école
grillerait le projet en une séance.

---

## Ce que trente étudiants peuvent mesurer, et ce qu'ils ne peuvent pas

| Mesurable | Non mesurable |
|---|---|
| une défaillance grossière du modèle | l'exactitude programme par programme |
| la validité des filtres | la performance d'un domaine précis |
| le rang moyen du bon programme | un écart fin entre deux versions |

Quatre-vingt-quatre programmes pour trente réponses : aucune conclusion par programme
n'est possible. Le protocole vise donc des mesures **agrégées**.

---

## Le piège à éviter

La question d'aiguillage demande ce qui attire le répondant. Un étudiant de troisième
année en finance répondra « les chiffres, la finance ». La famille sera juste par
construction.

**Mesurer le taux de bonne famille ne validerait donc presque rien.** Ça ne teste pas les
axes, ça teste que l'étudiant connaît sa propre filière.

Le test réel : **à l'intérieur de la famille qu'il choisit naturellement, à quel rang le
moteur place-t-il le programme qu'il suit ?** Si son programme sort premier ou deuxième
sur neuf candidats, le score fonctionne. S'il sort huitième, il ne fonctionne pas.

---

## Instruction indispensable aux répondants

> Réponds aux deux premières questions — ton diplôme et la modalité — **comme tu étais au
> moment où tu as choisi ta formation**, pas comme aujourd'hui.

Sans cette consigne, un étudiant de troisième année déclare une licence en cours, les
filtres éliminent son propre programme, et le rang devient indéfini. C'est l'erreur qui
ruinerait le test le plus discrètement.

---

## Les quatre mesures

Toutes se recalculent hors ligne depuis le champ `etat` du formulaire : le moteur est pur
et déterministe, donc rejouer l'état redonne le classement complet. **Aucun champ
supplémentaire n'est à ajouter au formulaire existant.**

### 1. Validité des filtres

Le programme réellement suivi figure-t-il dans le jeu candidat ?

S'il en est absent, c'est une erreur de filtre — `niveau_acces` ou `modalites` mal
extraits — et non une erreur de score. C'est le défaut le plus grave, parce qu'un filtre
exclut définitivement.

Objectif : **au moins 90 %**. Chaque échec s'examine individuellement, il désigne une
fiche à corriger.

### 2. Rang du programme suivi

Sa position dans le classement, exprimée en **rang relatif** pour être comparable entre
familles de tailles différentes :

```
rang_relatif = (position - 1) / (nombre_de_candidats - 1)
```

0 = premier, 1 = dernier, 0,5 = hasard.

| Rang relatif moyen | Lecture |
|---|---|
| < 0,25 | le score fonctionne |
| 0,25 – 0,40 | il apporte quelque chose, à améliorer |
| ≈ 0,50 | il n'apporte rien de mieux que le hasard |
| > 0,50 | il est anti-corrélé, il faut comprendre pourquoi |

C'est **la** mesure du projet. Avec trente réponses, elle distingue « fonctionne » de « ne
fonctionne pas », pas deux variantes proches.

### 3. Taux de famille correcte

À mesurer quand même, malgré la tautologie : il attrape une défaillance grossière — un
aiguillage inversé, un domaine mal rattaché. Un taux bas serait alarmant ; un taux élevé
ne prouve rien.

### 4. Fréquence des états

Les proportions observées de `forte`, `bonne`, `possible` et `egalite` doivent ressembler
aux 25 / 40 / 35 / 2 % de la simulation. Un écart signale que les profils réels ne
ressemblent pas aux profils simulés — ce qui invaliderait la calibration des seuils.

---

## L'inversion : les étudiants insatisfaits sont un second test

C'est ce qui permet de distinguer une erreur de modèle d'un étudiant mal orienté.

| Satisfaction | Rôle dans l'analyse |
|---|---|
| oui · plutôt | **cohorte de référence** — le rang doit être bas |
| pas vraiment · non | **cohorte inversée** — le moteur *devrait* proposer autre chose |

Un étudiant qui regrette son choix et à qui le quiz recommande justement autre chose n'est
pas un échec : c'est le comportement souhaité. Le compter comme une erreur pénaliserait le
modèle pour avoir eu raison.

Les deux cohortes s'analysent séparément et ne se mélangent jamais. Si les insatisfaits
sont trop peu nombreux pour conclure, les écarter en le disant.

---

## Échantillonnage

Trente répondants, répartis sur les **six familles**. Une cohorte issue d'une seule école
ne validerait qu'une famille.

| Famille | Répondants visés |
|---|---|
| entreprise-management | 8 |
| droit-action-publique | 6 |
| chiffres-finance | 5 |
| numerique | 5 |
| commerce-communication | 4 |
| ingenierie-industrie | 4 |

`droit-action-publique` est volontairement bien pourvue : c'est la famille où la
simulation a mesuré 61 % de départage, donc celle où le score discrimine le plus mal.
C'est là que le test est le plus informatif.

Deuxième ou troisième année de préférence — ils ont assez de recul pour juger leur
satisfaction.

---

## Piloter avant de déployer

**Trois étudiants d'abord**, en présence, en leur demandant de commenter à voix haute.
Objectif unique : détecter une question mal comprise.

Les sept questions de profil ont été rédigées par un modèle de langue, pas par un
Sénégalais de dix-huit ans. Une seule question comprise de travers corrompt les trente
réponses suivantes, et on ne s'en apercevrait qu'après.

Corriger les formulations, puis seulement diffuser aux trente.

---

## Lecture des résultats

### Si le rang relatif moyen est sous 0,25

Le modèle tient. Passer aux entretiens, avec l'ordre du jour réduit : accroches, signaux
d'alerte, corrections du catalogue 2024, et validation de bon sens.

### S'il est autour de 0,50

Le score n'apporte rien. Trois causes à départager avant toute correction :

- les **poids des options** sont mal calibrés — le plus probable, et le moins coûteux à
  corriger ;
- les **axes comptés** ne captent pas ce qui distingue les programmes — on en a déjà des
  indices avec les 38 paires à corrélation ≥ 0,97 ;
- les **questions** ne mesurent pas ce qu'on croit — le pilote devrait l'avoir attrapé.

Regarder d'abord si l'échec est uniforme ou concentré sur une famille. Concentré, c'est
une donnée à corriger ; uniforme, c'est le modèle.

### Si les filtres échouent au-delà de 10 %

S'arrêter là et corriger les fiches avant d'interpréter quoi que ce soit. Un jeu candidat
faux rend le rang ininterprétable.

---

## Ce qui reste vrai quelle que soit l'issue

L'étage de départage résout 98 % des égalités depuis le catalogue, sans dépendre des
responsables. Même si le score s'avère faible, le mécanisme de choix final tient — et
c'est lui qui produit la recommandation que le prospect lit.

Un mauvais résultat orienterait donc vers un allègement du score, pas vers un abandon du
produit.
