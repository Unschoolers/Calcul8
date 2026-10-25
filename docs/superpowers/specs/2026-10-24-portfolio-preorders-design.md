# Portfolio WhatFees — plan de conception
Date : 24 octobre 2026
Statut : conception retenue; implémentation et vérification suivies dans le plan associé.
Dépôt inspecté : Unschoolers/Calcul8, base main `29e76f1`. Ce document conserve les décisions de conception; les preuves d’implémentation figurent dans le plan associé.

## 1. Objectif et décisions

Rendre le portfolio facile à consulter sur mobile, tablette et desktop, avec trois vues : Aperçu, Analyses et Détails. La navigation principale de l’application reste en bas. Le contrôle interne est plus discret, placé sous le titre Portfolio, sans icônes.

Décisions exprimées par Julien :
- Réduire la densité du portfolio avec un aperçu de KPI, des analyses graphiques regroupées et une vue de détails.
- Conserver une logique commune pour les ventes par personne et les autres analyses; rester lean.
- Afficher côte à côte le bénéfice réalisé et le capital restant à récupérer.
- Les précommandes sont payées au complet.
- Utiliser une seule information pour représenter l’attente de réception : une date, sans statut séparé.
- Préparer et enregistrer les prix avant réception doit rester possible dans toute l’application.
- Le parcours personnel de Julien ne comprend pas de vente avant réception; il souhaite tenir compte des autres façons d’utiliser l’application.
- Lors d’une vente en précommande, afficher une confirmation ou un avertissement explicite.
- Dans le portfolio, distinguer clairement les précommandes du stock reçu, au-delà d’un badge ou d’un filtre.

Choix retenus pour cette première version :
- Aperçu comme vue initiale; conserver la vue et ses contrôles pendant les déplacements dans l’application, sans ajouter une préférence synchronisée.
- Tout l’historique comme portée temporelle commune de cette première version. Retirer la période spécifique aux ventes par personne. Un filtre temporel général pourra constituer une évolution ultérieure.
- La présence de la date signifie « en attente », même si cette date est passée. « Marquer comme reçu » efface la date. Aucun basculement automatique.
- Tous les lots inclus par défaut dans le portfolio; un filtre de réception partagé permet d’isoler les lots reçus ou les lots en attente.
- Les ventes avant réception restent possibles après une confirmation explicite au moment de l’opération; aucun nouveau réglage. Une vente ne marque jamais le lot reçu.

## 2. Approches examinées

| Approche | Avantage | Compromis |
| --- | --- | --- |
| Trois vues internes discrètes | Intentions claires, moins de défilement, accès direct aux détails | Un deuxième niveau de navigation doit rester visuellement secondaire |
| Deux vues Aperçu / Analyses, tableaux dans Analyses | Moins de destinations | Les tableaux et graphiques restent regroupés dans une vue dense |
| Une page avec sections repliables | Navigation inchangée | Longue page et état de lecture plus difficile à retrouver |

La conversation retient la première approche. Le contrôle Lots / Clients dans Détails demeure un filtre local, sans troisième rangée d’onglets.

## 3. Aperçu

Deux KPI principaux, sur une même rangée à largeur mobile normale, avec repli si le texte agrandi l’exige :
1. **Bénéfice réalisé** : somme des bénéfices des ventes enregistrées, après frais et coût attribué aux articles vendus. Réutiliser les calculs existants.
2. **Capital à récupérer** : max(0, coût total des lots sélectionnés − revenus nets cumulés des ventes de ces lots).

Le second KPI est un solde net du périmètre sélectionné. Il ne représente pas la somme des déficits de chaque lot. Les lots individuels restant à financer sont consultables dans Détails.

En informations secondaires : revenus nets, investissement total et part « dont précommandes ». Cette dernière est une ventilation de l’investissement, jamais un montant ajouté une deuxième fois.

La distinction de réception doit être visible dès l’Aperçu, même avec le filtre Tous :
- Un bloc **Stock reçu** affiche le nombre de lots et leur coût investi.
- Un bloc **Précommandes** affiche le nombre de lots, le montant déjà payé et la prochaine réception prévue; si toutes les estimations sont passées, afficher « Réception à confirmer ».
- L’investissement total est la somme des deux blocs. Les deux KPI principaux portent sur le périmètre sélectionné, annoncé explicitement; le détail du capital à récupérer peut montrer les deux soldes avant compensation, sans prétendre que leur somme après plafonnement est égale au solde net global.
- Les précommandes sans vente n’apparaissent pas comme des pertes commerciales. Le capital immobilisé reste affiché comme tel.
- Avec Reçus ou En attente, le périmètre reste annoncé et les blocs reflètent les lots effectivement retenus. Les montants des précommandes ne sont jamais dissimulés dans un total de « stock disponible ».

Exemple de validation :
- Lots reçus : coût 1 000 CAD; précommandes : coût 500 CAD.
- Revenus nets : 400 CAD; bénéfice réalisé : 80 CAD.
- Vue Tous : investi 1 500 CAD, dont précommandes 500 CAD; capital à récupérer 1 100 CAD; bénéfice réalisé 80 CAD.
- Vue Reçus : investi 1 000 CAD; capital à récupérer 600 CAD; bénéfice réalisé 80 CAD.

Une tendance compacte peut suivre ces KPI. Sa mesure est nommée précisément. La courbe actuelle « revenus moins coût total investi » décrit la récupération de l’investissement; elle ne devient pas une courbe de bénéfice réalisé par simple changement de titre.

Limiter les faits utiles à deux ou trois, cliquables vers les détails pertinents. Ne pas qualifier une précommande de lot qui tarde à se vendre, ni lui recommander de commencer à vendre. Les prévisions restent consultables avec la mention explicite « Projeté », hors des deux KPI principaux.

## 4. Analyses

Regrouper les analyses dans un panneau cohérent. Un graphique principal à la fois sur téléphone; largeur plus généreuse sur desktop, sans créer un comportement fonctionnel différent.

Contrôles explicites :
- Analyse : ventes, récupération de l’investissement, répartition par lot, marge sur articles vendus ou écoulement.
- Pour les ventes : revenus nets / bénéfice réalisé / nombre de ventes.
- Pour les ventes : total / par personne. C’est un regroupement du même jeu de données, avec des totaux identiques.
- Les contrôles sans sens pour l’analyse choisie ne sont pas affichés.

Toutes les analyses utilisent les mêmes lots sélectionnés et le même filtre de réception. La première version utilise tout l’historique, y compris pour les ventes par personne; aucune fenêtre de huit semaines isolée.

Préserver l’accès au détail d’une semaine, les ventes importées et sans attribution connue, ainsi que les traductions. Le nombre de ventes reste le nombre de transactions, distinct de la quantité d’articles.

L’attribution actuelle correspond au dernier utilisateur ayant modifié la vente. Conserver cette règle et sa note explicative; modifier le modèle d’attribution serait une autre fonctionnalité.

L’écoulement doit être clairement défini comme celui des lots du périmètre actuel, à partir des quantités existantes. La date prévue n’est ni une réception réelle historique ni une raison de déplacer les ventes ou l’achat sur une autre date.

## 5. Détails

Réutiliser PortfolioPerformanceSheet et PortfolioPerformanceGrid :
- Filtre Lots / Clients, recherche clients, tri et fiches clients conservés.
- Tableau sur desktop; présentation compacte existante adaptée sur mobile.
- Valeurs réelles et projetées toujours identifiées; éviter qu’une valeur projetée soit présentée sous un simple libellé « Profit ».
- Les filtres globaux s’appliquent aux deux modes, y compris quand aucun lot ne correspond. Ne jamais revenir silencieusement à tous les lots.
- En mode Lots, afficher la catégorie **Stock reçu** ou **Précommande**, avec la date prévue pour cette dernière. En vue Tous, regrouper visuellement les lignes sous ces deux catégories tout en gardant le tri choisi à l’intérieur de chaque groupe.
- Les légendes et détails des analyses permettent d’identifier les lots en précommande. Les quantités agrégées de la vue Tous sont des quantités achetées, pas une affirmation de stock physique disponible; l’écoulement précise qu’il porte sur ces quantités du périmètre courant.
- Préserver le rapport existant et ses règles d’accès Pro. Le rapport financier doit reprendre le périmètre du portfolio et distinguer clairement les précommandes.

## 6. Précommandes : une seule donnée

Ajouter au lot un unique champ facultatif, proposé sous le nom technique **expectedReceiptDate**, au format date civile YYYY-MM-DD.

Valider une date civile réelle aux frontières d’édition et d’API. Une valeur invalide produit une erreur explicite; elle ne doit jamais rendre silencieusement disponible un lot auparavant en attente. Les entrées absentes des données historiques restent compatibles.

| Valeur | Sens |
| --- | --- |
| Absente ou vide | Lot reçu / disponible du point de vue de la réception |
| Date valide renseignée | Lot en attente de réception |
| Date antérieure à aujourd’hui | Toujours en attente; afficher la date prévue passée sans réception automatique |

« Reçu » ne signifie pas « stock restant » : un lot reçu peut être épuisé. Les indicateurs existants de stock et de complétion conservent leur rôle.

La date d’achat reste distincte et inchangée. La dépense complète demeure prise en compte à l’achat, avant la réception. Aucune gestion de dépôt, d’échéancier ou de paiement n’est ajoutée.

Interface proposée :
- Champ « Réception prévue » facultatif dans la création et dans Modifier le lot, accessible en mode simple et pour les deux types de lots.
- Badge « Précommande · prévue le … » dans les sélecteurs de lots et Détails.
- Action « Marquer comme reçu » au même endroit que la date, l’effaçant explicitement.
- Filtre de portfolio compact Tous / Reçus / En attente, placé avec les filtres existants. Pas une nouvelle barre de navigation.
- Les anciennes données sans champ sont considérées comme reçues. Ne pas tenter de déduire les précommandes du nom ou de la date d’achat.
- À la création d’un autre lot, ne jamais recopier la date du lot précédemment sélectionné.

Limites assumées : il faut renseigner une date pour représenter une attente; cette version ne conserve pas l’ancienne estimation après réception et ne traite pas les réceptions partielles. Elle n’ajoute pas de date de sortie produit.

Le badge informe les autres écrans sans changer leurs règles de vente, ni les stocks Shopify. Le blocage automatique des ventes ou une synchronisation de réception avec Shopify ne font pas partie de cette refonte.

### Parcours dans toute l’application

La précommande est un lot normal avec une réception attendue, pas un mode limité de l’application.

| Écran | Comportement attendu |
| --- | --- |
| Sélecteur global | Tous les lots restent accessibles. Badge et date rendent l’attente visible; le filtre de portfolio ne filtre pas le sélecteur global. |
| Configuration | Coûts, quantités, frais et paramètres modifiables normalement. Une seule zone d’édition de réception, dans la création ou Modifier le lot. |
| Live / calculateur | Simulation, cible de profit, marges, modification et sauvegarde des prix existants restent accessibles, selon les droits actuels. Aucun prix parallèle « précommande » n’est créé. |
| Jeux | Configuration et utilisation restent accessibles avec les règles existantes. Une vente issue d’un jeu suit le même principe qu’une vente manuelle. |
| Ventes | Un rappel discret « Réception prévue le … » reste visible près du contexte du lot. L’enregistrement demande la confirmation ci-dessous; aucun marquage de réception automatique. |
| Portfolio | Le coût payé fait partie de l’investissement; filtres de réception, badge et ventilation des précommandes. Les prévisions restent possibles pour ces lots. |
| Réception | Effacer la date conserve les prix, configurations de jeux, ventes, quantités et date d’achat. Seule l’information de réception change. |

Les ventes déjà enregistrées, y compris les imports ou les ventes issues de jeux, restent dans les chiffres lorsque le lot appartient au périmètre choisi. Une précommande ayant déjà des ventes n’est jamais traitée comme une anomalie uniquement à cause de sa réception attendue.

La réception ne crée aucun mouvement d’inventaire supplémentaire : les quantités achetées et vendues continuent de suivre les règles existantes. Présenter les quantités d’un lot en attente comme du stock attendu, sans inventer un système de réservation, d’expédition ou de livraison. Les protections existantes contre les ventes invalides ou les stocks incohérents restent actives.

### Confirmer une vente avant réception

Choix proposé : confirmation brève et explicite, réutilisant le dialogue de confirmation existant, sans nouvelle préférence à configurer.

Titre : **Vendre avant réception ?**
Texte : **Ce lot est en attente de réception, prévue le {date}. La vente sera enregistrée, mais le lot restera en précommande.**
Actions : **Annuler** / **Enregistrer la vente**.

- Vente manuelle : confirmer avant toute écriture ou déduction de stock. Annuler laisse l’état intact.
- Vente existante simplement consultée ou modifiée sans nouvelle consommation : pas de nouvelle confirmation. Une modification qui augmente la quantité consommée d’un lot en attente doit repasser par la confirmation.
- Import interactif : identifier les lots en attente dans l’aperçu et demander une seule confirmation par lot d’import, listant les lots et le nombre de ventes concernés, avant l’application. Un traitement automatique déjà autorisé continue selon ses règles actuelles; ses ventes restent identifiées comme liées à une précommande dans l’historique. Aucun import existant n’est silencieusement interrompu par un dialogue impossible à afficher.
- Jeu : confirmer avant le premier tirage ou lancement qui pourra consommer le stock en attente, jamais après un résultat engagé. Une seule confirmation peut couvrir les lots en attente explicitement présentés pour la session; si un autre lot en attente est ajouté, confirmer avant sa première consommation.
- La confirmation est limitée à l’opération ou à la session concernée; elle ne supprime pas la date et ne devient pas une préférence globale. Les modifications de prix et les simulations ne la déclenchent jamais.
- Les parcours de correction, récupération et déduplication existants ne doivent pas rejouer une vente à la suite de cette confirmation.

## 7. Fondements vérifiés dans le dépôt

| Zone | Fichiers inspectés et conséquence |
| --- | --- |
| Vue et coordination | src/components/windows/portfolio/PortfolioWindow.html, .ts, .vue, .definition.ts : résumé, graphiques et tableaux empilés; coordination déjà importante à découper par panneau |
| Primitives de détails | PortfolioPerformanceSheet.html et PortfolioPerformanceGrid.css : tri, modes Lots / Clients et adaptation mobile déjà présents |
| Données et finance | src/app-core/computed/portfolio.ts, src/domain/calculations.ts : revenus nets moins coût complet pour totalProfit; bénéfice réalisé déjà disponible par lot mais absent de PortfolioTotals |
| Navigation et rapport | src/App.html : navigation globale distincte, action de rapport soumise à Pro |
| Préparation des prix | src/components/windows/live/LiveWindow.definition.ts et src/app-core/methods/config-live-pricing.ts : calculs de scénarios et sauvegarde des prix déjà disponibles; les réutiliser pour les lots en attente |
| Graphiques et chargement | src/app-core/methods/sales-charts.ts, sales-portfolio-hydration.ts, sales-chart-config-portfolio.ts, sales-chart-config-history.ts : chargement des ventes déclenché avec les graphiques; refs de canvas dépendantes de la vue |
| Filtres et état | src/app-core/watch.ts, state.ts, components/windows/portfolio/portfolioWindowPorts.ts : filtres existants, rafraîchissements et nettoyage à adapter aux vues internes |
| Précommandes | src/types/app.ts, src/shared/lot-dates.ts : purchaseDate existe; aucun champ de réception actuel |
| Création et modification | src/app-core/methods/config-lot-crud.ts, config-lots.ts, config-lot-loading.ts, config-lot-edit.ts, src/app-core/shared/normalize-lot.ts : plusieurs étapes explicites de création, chargement et sauvegarde |
| Synchronisation | shared/contracts/sync-contracts.ts : champs de lot autorisés explicitement; src/app-core/methods/ui/sync/sync-payload.ts et apps/api/src/lib/syncShape.ts consomment ce contrat |
| Tests existants | tests/portfolio-window.test.ts, portfolio-volume.test.ts, portfolio-customer-performance-ui.test.ts, vue/portfolio-sales-period.scenario.test.ts : comportements et portée actuelle déjà couverts |
| Consignes | AGENTS.md, docs/codingstandard.md, repo-organization.md, UIrefinement.md et ui-visual-qa.md : composants réutilisés, thèmes, mobile, tests ciblés et vérifications obligatoires |

Points techniques à traiter explicitement :
- Séparer le déclenchement du chargement des ventes du rendu des canvas pour que l’Aperçu et les Détails soient complets sans ouvrir Analyses.
- Donner à chaque graphique un cycle de vie lié à son affichage; le premier canvas absent ne doit pas empêcher un autre graphique de se créer.
- Préserver les mises à jour après hydratation, changement de filtres, langue et espace personnel/partagé.
- Corriger le repli actuel de portfolioPerformanceLots qui peut renvoyer tous les lots quand les lignes filtrées sont vides.
- Faire traverser le champ de réception dans les normalisations locales et le contrat partagé. Vérifier qu’effacer la date reste effacé après rechargement et synchronisation.
- Régénérer les sorties des contrats par les scripts existants; ne pas modifier séparément les fichiers générés.
- Conserver les montants consolidés en CAD avec les conversions et frais existants.

## 8. Découpage proposé

Deux lots de travail coordonnés, chacun livrable indépendamment :
1. **Précommandes** : champ, persistance et synchronisation, édition, badge, filtre et exclusion des recommandations de vente inadaptées. Ce livrable possède aussi la confirmation des ventes manuelles, des augmentations de consommation, des imports interactifs et des sessions de jeux avant consommation, avec conservation des traitements automatiques existants. Tester explicitement annulation et absence de double enregistrement. La préparation des prix reste fonctionnelle avant et après réception.
2. **Portfolio** : vues internes, KPI explicites, panneau d’analyses commun et détails adaptés.

Ordre conseillé : livrer le socle des précommandes et ses confirmations avant de finaliser la refonte du portfolio. À l’intérieur de ce premier livrable, séparer les contrats/persistance, les contrôles de réception et les confirmations par parcours en incréments vérifiables. À l’intérieur de la refonte, séparer navigation/chargement, aperçu et analyses/détails en incréments vérifiables. Réutiliser Vue, Vuetify, Chart.js et les composants existants; aucune dépendance supplémentaire nécessaire à ce stade.

Le plan associé précise les interfaces, tâches parallèles, commits, tests et résultats de vérification.

## 9. Critères d’acceptation et vérification prévue

- [x] Les trois vues sont accessibles et distinctes de la navigation principale.
- [x] Les deux KPI principaux correspondent à leurs définitions et à l’exemple chiffré.
- [x] Les ventes par personne et le total donnent les mêmes sommes sur le même périmètre historique.
- [x] Les lots filtrés, clients, graphiques et rapport portent sur le périmètre annoncé.
- [x] Aucun résultat ne réapparaît quand les filtres correspondent à zéro lot.
- [x] Une précommande payée compte une seule fois dans les coûts et reste identifiable.
- [x] Une date passée ne marque jamais le lot reçu; effacer la date ne change ni coût ni date d’achat.
- [x] Une précommande conserve l’accès aux calculs, à la sauvegarde des prix et aux jeux; sa réception ne réinitialise aucun préparatif.
- [x] Une vente manuelle, importée ou issue d’un jeu reste autorisée selon les règles existantes et ne supprime jamais la réception prévue.
- [x] Les opérations interactives qui consomment une précommande sont confirmées avant leur écriture; annuler ne crée ni vente, ni résultat de jeu, ni mouvement de stock. Les imports automatiques ne sont pas bloqués par une interaction impossible.
- [x] L’Aperçu et les lignes de Détails distinguent visuellement Stock reçu et Précommandes, même lorsque Tous est sélectionné.
- [x] Le champ reste présent, ou reste effacé, après sauvegarde locale, rafraîchissement et aller-retour cloud.
- [x] Un nouveau lot n’hérite pas de la réception prévue d’un autre lot.
- [x] Aperçu et Détails chargent leurs données sans passer par Analyses; aucun graphique n’est créé sur un canvas masqué ou démonté.
- [x] Les changements rapides de vue, le retour depuis une autre section et les mises à jour de ventes ne montrent pas de données périmées.
- [x] Données sans ventes, hors ligne, historiques, multi-devises, importées et espaces partagés sont vérifiées.
- [x] Tests unitaires et de composants prioritaires; vérification géométrique réelle pour les dimensions des canvas et les débordements.
- [x] Vérification mobile 360×740 / 390×844, tablette 768×1024 et desktop 1280×800 / 1440×900, thèmes clair/sombre, FR/EN et navigation clavier.
- [x] Web : npm run verify. Contrats partagés : npm run shared:generate puis npm run verify:all. Contrôles visuels selon docs/ui-visual-qa.md.

Ces critères sont vérifiés localement. Le plan associé consigne les commandes, résultats, limites d’environnement et la publication restant à autoriser.
