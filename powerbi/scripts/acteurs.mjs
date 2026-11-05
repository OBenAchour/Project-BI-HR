// Acteurs consommateurs du rapport (PPTX slides 20 à 22) : une seule source pour le modèle et pour les pages.
// - pages : identifiant PBIR (dossier) et nom affiché. Le nom affiché sert de destination au bouton de l'accueil.
// - roles : rôles de sécurité qui donnent accès à l'acteur ; deptBk = département imposé par la sécurité par ligne.
export const ACTEURS = [
  {
    acteur: 'Direction générale', ordre: 1, couleur: '#2E86DE',
    decide: 'arbitrer budget et capacités entre départements', vue: 'Vue consolidée, tous départements',
    pages: [{ id: 'pg02Direction', nom: 'Direction générale' }],
    roles: [{ nom: 'Direction générale' }],
  },
  {
    acteur: 'DRH', ordre: 2, couleur: '#1B998B',
    decide: 'fixer les priorités RH de l’entreprise', vue: 'Vue complète, sur deux pages',
    pages: [{ id: 'pg03DRH1', nom: 'DRH · 1/2' }, { id: 'pg04DRH2', nom: 'DRH · 2/2' }],
    roles: [{ nom: 'DRH' }],
  },
  {
    acteur: 'Contrôle de gestion et paie', ordre: 4, couleur: '#7B6CD9',
    decide: 'suivre la masse salariale et les heures sup', vue: 'Vue complète sur les coûts et le temps travaillé',
    pages: [{ id: 'pg05Controle', nom: 'Contrôle de gestion et paie' }],
    roles: [{ nom: 'Contrôle de gestion et paie' }],
  },
  {
    acteur: 'Resp. administration du personnel', ordre: 5, couleur: '#ED7373',
    decide: 'corriger les contrats, suivre échéances et congés', vue: 'Détail par employé (identifiant)',
    pages: [{ id: 'pg06AdminPersonnel', nom: 'Administration du personnel' }],
    roles: [{ nom: 'Resp. administration du personnel' }],
  },
  {
    acteur: 'Resp. formation', ordre: 6, couleur: '#F2B84B',
    decide: 'orienter les parcours de formation par métier', vue: 'Vue complète sur la formation',
    pages: [{ id: 'pg07Formation', nom: 'Formation' }],
    roles: [{ nom: 'Resp. formation' }],
  },
  {
    acteur: 'Resp. recrutement', ordre: 7, couleur: '#44C088',
    decide: 'choisir les canaux de recrutement', vue: 'Vue agrégée, sans détail par employé',
    pages: [{ id: 'pg08Recrutement', nom: 'Recrutement' }],
    roles: [{ nom: 'Resp. recrutement' }],
  },
  {
    acteur: 'Managers de département', ordre: 8, couleur: '#3D5A80',
    decide: 'piloter charge, assiduité, congés et échéances de votre équipe', vue: 'Vue limitée à votre département',
    pages: [{ id: 'pg09Managers', nom: 'Managers de département' }],
    roles: [
      { nom: 'Manager Informatique', deptBk: 'DEP_INF00', dept: "l'Informatique" },
      { nom: 'Manager Télécom', deptBk: 'DEP_TEL00', dept: 'le Télécom' },
      { nom: 'Manager Communication', deptBk: 'DEP_COM01', dept: 'la Communication' },
      { nom: 'Manager Administration', deptBk: 'DEP_ADMIN00', dept: "l'Administration" },
    ],
  },
];

export const acteur = (nom) => {
  const a = ACTEURS.find(x => x.acteur === nom);
  if (!a) throw new Error('Acteur inconnu : ' + nom);
  return a;
};
