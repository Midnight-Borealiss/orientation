# Hébergement, collecte des tests, contact et thème ISM

Quatre ajouts. Aucun ne doit introduire de dépendance ni d'étape de build.

---

## 1. Hébergement Netlify

Fichier `netlify.toml` à la racine :

```toml
[build]
  publish = "."
  command = ""

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[redirects]]
  from = "/"
  to = "/web/"
  status = 302
```

`publish = "."` est nécessaire : `data/_contexte.json` vit en dehors de `web/`.

La redirection depuis la racine évite qu'un prospect qui tape l'adresse sans `/web/`
tombe sur une liste de fichiers.

Vérifier après le premier déploiement que `_contexte.json` est bien servi et que le
`Content-Type` des `.mjs` est `text/javascript` — sinon les modules ES sont refusés par
le navigateur.

---

## 2. Collecte des résultats de test — Netlify Forms

### La contrainte à connaître avant de coder

**Netlify détecte les formulaires en analysant le HTML déployé, pas à l'exécution.** Un
formulaire créé par JavaScript n'est jamais enregistré, et les envois retournent 404 sans
message clair.

Le formulaire doit donc être **écrit littéralement dans `web/index.html`**, masqué en
CSS, avec des champs cachés que le JavaScript remplit avant envoi.

### Le formulaire de détection

```html
<form name="validation" data-netlify="true" netlify-honeypot="bot-field" hidden>
  <input type="text" name="bot-field" />
  <input type="text" name="etat" />
  <input type="text" name="recommande" />
  <input type="text" name="niveau_correspondance" />
  <input type="text" name="filiere_suivie" />
  <input type="text" name="annee" />
  <input type="text" name="satisfait" />
</form>
```

Le `netlify-honeypot` filtre les robots sans imposer de captcha.

### L'envoi

Depuis le JavaScript, une requête `POST` vers `/` avec un corps
`application/x-www-form-urlencoded` incluant impérativement `form-name=validation`. Sans
ce champ, Netlify ignore l'envoi.

### Ce qui est visible du répondant

Un bloc affiché **après le résultat**, jamais avant — il ne doit pas influencer la
lecture. Trois questions seulement :

| Question | Type |
|---|---|
| Quelle filière suis-tu actuellement ? | liste des 84 programmes, depuis le contexte |
| En quelle année ? | 1re, 2e, 3e, plus |
| Es-tu content de ton choix ? | oui · plutôt · pas vraiment · non |

`etat`, `recommande` et `niveau_correspondance` sont remplis automatiquement depuis le
résultat du moteur, sans que le répondant ait à copier quoi que ce soit.

La dernière question est **indispensable** : un étudiant qui regrette sa filière ne peut
pas servir de vérité terrain. Sans elle, impossible de distinguer un modèle qui se trompe
d'un étudiant mal orienté.

### Règles

- **Aucune donnée personnelle** : pas de nom, pas d'email, pas de téléphone. Rien à
  déclarer, rien à protéger, et un répondant plus franc.
- Le bloc est visible via un paramètre d'URL (`?validation=1`) et **absent en usage
  normal**. Un prospect ordinaire ne doit pas voir un formulaire de recherche.
- Après envoi, un accusé sobre. Pas de renvoi possible en double.
- L'échec d'envoi ne doit jamais effacer le résultat affiché.

---

## 3. Bouton « parler à un conseiller »

### Nouveau fichier `config/contact.json`

```json
{
  "_source": "Coordonnees relevees dans les brochures 2024. Le WhatsApp d'admission n'y figure pas : a confirmer avec le service.",

  "canal": "email",

  "email": {
    "adresse": "admission.licence@ism.edu.sn",
    "objet": "Demande d'information — {programme}",
    "corps": "Bonjour,\n\nJ'ai utilise l'orientation en ligne et le programme suivant m'a ete propose :\n\n{programme} ({ecole}, {modalite})\n\nJ'aimerais en savoir plus sur les conditions d'admission et le deroulement de la formation.\n\nMerci."
  },

  "whatsapp": {
    "_statut": "prototype — numero a confirmer, les deux WhatsApp documentes sont Career Center et Executive Education",
    "numero": "221772395050",
    "message": "Bonjour, je viens de faire l'orientation en ligne. Le programme propose est : {programme} ({ecole}, {modalite}). J'aimerais avoir plus d'informations."
  }
}
```

### Comportement

`canal` détermine la destination : `email` construit un `mailto:`, `whatsapp` construit
un lien `https://wa.me/{numero}?text={message}`. Basculer de l'un à l'autre ne doit
demander qu'un changement dans ce fichier, jamais dans le code.

Les substitutions `{programme}`, `{ecole}`, `{modalite}` viennent du résultat du moteur.
Encoder correctement — les retours à la ligne et les accents cassent un `mailto:` mal
échappé.

**Défaut retenu : `email`.** C'est la seule adresse d'admission documentée dans les
brochures. Le WhatsApp est présent mais marqué prototype.

Prévoir le cas où le programme recommandé relève d'ISM Online ou d'ISF : la brochure
donne `online@ism.edu.sn`, qui est une adresse distincte. Un routage par école serait
justifié, mais **ne pas l'inventer** — le noter comme question aux admissions.

---

## 4. Thème ISM

### Palette mesurée

Extraite des couvertures des deux catalogues. Les valeurs diffèrent d'une brochure à
l'autre — ce sont des couleurs d'impression, pas une charte écran.

| Rôle | Valeur | Provenance |
|---|---|---|
| Orange de marque | `#F38416` | couverture Bachelor |
| Orange, variante | `#FCA41F` | couverture Master |
| Bleu profond | `#0F274D` | couverture Bachelor |
| Bleu, variante | `#084E8B` | couverture Master |

### Contrainte de lisibilité, à respecter

`#F38416` sur blanc donne un contraste de **2,6:1**, sous le minimum de 4,5:1 exigé pour
du texte.

| Usage | Couleur |
|---|---|
| Texte courant | `#0F274D` ou un gris foncé neutre |
| Fonds, accents, bordures, barre de progression | `#F38416` |
| Texte **sur** un fond orange | `#0F274D` |
| Texte orange sur blanc, si nécessaire | `#B35A00` — contraste 4,6:1 |

Ne jamais poser `#F38416` en texte sur blanc, même en petit.

### Implémentation

Un seul fichier `web/theme.css` en propriétés personnalisées CSS. Aucun composant ne
porte de couleur en dur : changer d'identité doit se faire dans ce fichier seul.

Prévoir les variables pour le logo — hauteur, marge — sans le fournir : à récupérer
auprès du service communication, en SVG de préférence. Un PNG basse résolution extrait
d'un PDF sera flou sur mobile.

Conserver le mode sombre si le navigateur le demande : le bleu profond et l'orange
fonctionnent tous deux sur fond sombre, mais les contrastes doivent être recalculés.

### À signaler dans le README

Les valeurs ci-dessus sont **mesurées, pas officielles**. Demander la charte au service
communication et les remplacer. Le fichier de thème existe précisément pour que ce soit
une modification d'une ligne.

---

## Tests attendus

| Test | Ce qu'il attrape |
|---|---|
| le formulaire de détection est présent dans le HTML statique | sinon Netlify ne l'enregistre pas |
| l'envoi inclut `form-name` | sinon 404 silencieux |
| aucun champ personnel dans le formulaire | nom, email, téléphone interdits |
| le bloc validation est absent sans `?validation=1` | un prospect ne doit pas le voir |
| basculer `canal` change la destination sans toucher au code | paramétrage réel |
| aucune couleur en dur hors de `theme.css` | thème réellement remplaçable |
| `#F38416` n'est jamais une couleur de texte | lisibilité |
