/* =============================================================================
   Data Warehouse RH : base RH_Data_Warehouse, schéma dw
   -----------------------------------------------------------------------------
   Constellation : 3 faits, 9 dimensions, 5 sous-dimensions, aucune table de pont.
   Détail de chaque table : docs/CONCEPTION_DW.md.

   - Aucune suppression : le script crée la base et les tables qui n'existent pas encore,
     sans jamais supprimer une table ni une ligne. Il peut être relancé sans risque.
   - Pas de membre « Inconnu » : une ligne dont une clé n'est pas trouvée, ou dont une valeur
     obligatoire est illisible, est écartée par le package SSIS. Seules les clés « non
     applicables » acceptent NULL (contrat sans date de fin, taux non applicable).
   - Pas de dimension d'anomalies : un pointage aux heures incohérentes ou postérieur à la fin
     du contrat est écarté par le package SSIS.
   ============================================================================= */

IF HAS_PERMS_BY_NAME(NULL, NULL, 'CREATE ANY DATABASE') = 0 AND DB_ID(N'RH_Data_Warehouse') IS NULL
    THROW 50001, N'Droit CREATE DATABASE manquant : la base RH_Data_Warehouse ne peut pas être créée.', 1;
IF DB_ID(N'RH_Data_Warehouse') IS NULL
    CREATE DATABASE RH_Data_Warehouse;
GO

USE RH_Data_Warehouse;
GO

IF SCHEMA_ID(N'dw') IS NULL EXEC (N'CREATE SCHEMA dw');
GO

/* ----------------------------------------------------------------- sous-dimensions */

IF OBJECT_ID(N'dw.dim_pole') IS NULL
BEGIN
    CREATE TABLE dw.dim_pole (
        pole_sk        int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_pole PRIMARY KEY,
        pole_libelle   nvarchar(20) NOT NULL CONSTRAINT uq_dim_pole UNIQUE
    );
END;

IF OBJECT_ID(N'dw.dim_diplome') IS NULL
BEGIN
    CREATE TABLE dw.dim_diplome (
        diplome_sk       int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_diplome PRIMARY KEY,
        diplome_libelle  nvarchar(30) NOT NULL CONSTRAINT uq_dim_diplome UNIQUE,
        niveau_bac_plus  tinyint NULL
    );
END;

IF OBJECT_ID(N'dw.dim_canal_recrutement') IS NULL
BEGIN
    CREATE TABLE dw.dim_canal_recrutement (
        canal_sk       int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_canal PRIMARY KEY,
        canal_code     nvarchar(30) NOT NULL CONSTRAINT uq_dim_canal UNIQUE,
        canal_libelle  nvarchar(50) NOT NULL
    );
END;

IF OBJECT_ID(N'dw.dim_universite') IS NULL
BEGIN
    CREATE TABLE dw.dim_universite (
        universite_sk  int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_universite PRIMARY KEY,
        universite     nvarchar(255) NOT NULL CONSTRAINT uq_dim_universite UNIQUE
    );
END;

IF OBJECT_ID(N'dw.dim_niveau_cours') IS NULL
BEGIN
    CREATE TABLE dw.dim_niveau_cours (
        niveau_sk       int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_niveau_cours PRIMARY KEY,
        niveau_source   nvarchar(30) NOT NULL CONSTRAINT uq_dim_niveau_cours UNIQUE,
        niveau_libelle  nvarchar(30) NOT NULL,
        ordre_niveau    tinyint NULL
    );
END;

/* ----------------------------------------------------------------- dimensions */

IF OBJECT_ID(N'dw.dim_date') IS NULL
BEGIN
    CREATE TABLE dw.dim_date (
        date_sk          int NOT NULL CONSTRAINT pk_dim_date PRIMARY KEY,   -- AAAAMMJJ
        date_complete    date NULL,
        jour             tinyint NULL,
        jour_semaine_num tinyint NULL,                                       -- 1 = lundi
        jour_semaine     nvarchar(10) NULL,
        semaine_iso      tinyint NULL,
        mois_num         tinyint NULL,
        mois             nvarchar(10) NULL,
        trimestre        tinyint NULL,
        annee            smallint NULL,
        annee_mois       char(7) NULL,                                       -- AAAA-MM
        est_jour_ouvre   bit NOT NULL CONSTRAINT df_dim_date_ouvre DEFAULT 0,
        est_ferie        bit NOT NULL CONSTRAINT df_dim_date_ferie DEFAULT 0,
        libelle_ferie    nvarchar(60) NULL
    );
END;

IF OBJECT_ID(N'dw.dim_heure') IS NULL
BEGIN
    CREATE TABLE dw.dim_heure (
        heure_sk        smallint NOT NULL CONSTRAINT pk_dim_heure PRIMARY KEY,   -- HHMM
        heure           tinyint NULL,
        minute          tinyint NULL,
        tranche_15min   nvarchar(11) NULL,                                       -- 08:30-08:45
        est_apres_8h30  bit NOT NULL CONSTRAINT df_dim_heure_retard DEFAULT 0
    );
END;

IF OBJECT_ID(N'dw.dim_departement') IS NULL
BEGIN
    CREATE TABLE dw.dim_departement (
        departement_sk  int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_departement PRIMARY KEY,
        departement_bk  nvarchar(20) NOT NULL CONSTRAINT uq_dim_departement UNIQUE,
        departement     nvarchar(50) NOT NULL,
        capacite        int NULL,
        pole_sk         int NOT NULL CONSTRAINT fk_departement_pole REFERENCES dw.dim_pole (pole_sk)
    );
END;

IF OBJECT_ID(N'dw.dim_type_conge') IS NULL
BEGIN
    CREATE TABLE dw.dim_type_conge (
        type_conge_sk       int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_type_conge PRIMARY KEY,
        type_conge_code     nvarchar(20) NOT NULL CONSTRAINT uq_dim_type_conge UNIQUE,
        type_conge_libelle  nvarchar(30) NOT NULL
    );
END;

IF OBJECT_ID(N'dw.dim_contrat') IS NULL
BEGIN
    CREATE TABLE dw.dim_contrat (
        contrat_sk         int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_contrat PRIMARY KEY,
        type_contrat       nvarchar(10) NOT NULL,
        statut_emploi      nvarchar(30) NOT NULL,
        est_contrat_court  bit NOT NULL,
        CONSTRAINT uq_dim_contrat UNIQUE (type_contrat, statut_emploi)
    );
END;

IF OBJECT_ID(N'dw.dim_poste') IS NULL
BEGIN
    CREATE TABLE dw.dim_poste (
        poste_sk         int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_poste PRIMARY KEY,
        intitule_poste   nvarchar(255) NOT NULL,
        categorie_poste  nvarchar(30) NOT NULL,
        rang             tinyint NOT NULL,          -- 0 = sans rang (administratifs)
        activite         nvarchar(30) NOT NULL,
        CONSTRAINT uq_dim_poste UNIQUE (intitule_poste, categorie_poste, rang, activite)
    );
END;

IF OBJECT_ID(N'dw.dim_cours') IS NULL
BEGIN
    CREATE TABLE dw.dim_cours (
        cours_sk       int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_cours PRIMARY KEY,
        cours_bk       nvarchar(10) NOT NULL CONSTRAINT uq_dim_cours UNIQUE,
        intitule       nvarchar(500) NOT NULL,
        universite_sk  int NOT NULL CONSTRAINT fk_cours_universite REFERENCES dw.dim_universite (universite_sk),
        niveau_sk      int NOT NULL CONSTRAINT fk_cours_niveau REFERENCES dw.dim_niveau_cours (niveau_sk),
        note           decimal(3,2) NULL,
        url            nvarchar(500) NULL,
        description    nvarchar(max) NULL,
        competences    nvarchar(2000) NULL
    );
END;

IF OBJECT_ID(N'dw.dim_taux_horaire') IS NULL
BEGIN
    CREATE TABLE dw.dim_taux_horaire (
        taux_sk      int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_taux_horaire PRIMARY KEY,
        code_taux    nvarchar(20) NOT NULL,
        libelle      nvarchar(60) NULL,
        valeur       decimal(6,2) NULL,
        est_courant  bit NOT NULL CONSTRAINT df_taux_courant DEFAULT 1,   -- version courante (historisation SCD 2)
        date_debut   date NULL,
        date_fin     date NULL
    );
    CREATE INDEX ix_taux_code_courant ON dw.dim_taux_horaire (code_taux, est_courant);
END;

IF OBJECT_ID(N'dw.dim_employe') IS NULL
BEGIN
    CREATE TABLE dw.dim_employe (
        employe_sk                     int IDENTITY(1,1) NOT NULL CONSTRAINT pk_dim_employe PRIMARY KEY,
        employe_bk                     nvarchar(50) NOT NULL,
        population                     nvarchar(20) NOT NULL,
        nom                            nvarchar(255) NULL,
        genre                          nchar(1) NULL,
        statut_marital                 nvarchar(20) NULL,
        email                          nvarchar(255) NULL,
        adresse                        nvarchar(255) NULL,
        adresse_mission                nvarchar(255) NULL,
        parle_arabe                    bit NOT NULL CONSTRAINT df_emp_arabe DEFAULT 0,
        parle_francais                 bit NOT NULL CONSTRAINT df_emp_francais DEFAULT 0,
        parle_anglais                  bit NOT NULL CONSTRAINT df_emp_anglais DEFAULT 0,
        parle_autre                    bit NOT NULL CONSTRAINT df_emp_autre DEFAULT 0,
        maitrise_software_engineering  bit NOT NULL CONSTRAINT df_emp_se DEFAULT 0,
        maitrise_telecom               bit NOT NULL CONSTRAINT df_emp_telecom DEFAULT 0,
        code_tenure                    tinyint NULL,
        diplome_sk                     int NOT NULL CONSTRAINT fk_employe_diplome REFERENCES dw.dim_diplome (diplome_sk),
        canal_sk                       int NOT NULL CONSTRAINT fk_employe_canal REFERENCES dw.dim_canal_recrutement (canal_sk),
        departement_sk                 int NOT NULL CONSTRAINT fk_employe_departement REFERENCES dw.dim_departement (departement_sk),
        est_courant                    bit NOT NULL CONSTRAINT df_emp_courant DEFAULT 1,   -- version courante (historisation SCD 2)
        date_debut                     date NULL,
        date_fin                       date NULL
    );
    CREATE INDEX ix_employe_bk_courant ON dw.dim_employe (employe_bk, est_courant);
END;

GO

/* ----------------------------------------------------------------- faits */

IF OBJECT_ID(N'dw.fact_effectif_snapshot') IS NULL
BEGIN
    CREATE TABLE dw.fact_effectif_snapshot (
        date_snapshot_sk       int NOT NULL CONSTRAINT fk_eff_snapshot REFERENCES dw.dim_date (date_sk),
        employe_sk             int NOT NULL CONSTRAINT fk_eff_employe REFERENCES dw.dim_employe (employe_sk),
        departement_sk         int NOT NULL CONSTRAINT fk_eff_departement REFERENCES dw.dim_departement (departement_sk),
        contrat_sk             int NOT NULL CONSTRAINT fk_eff_contrat REFERENCES dw.dim_contrat (contrat_sk),
        poste_sk               int NOT NULL CONSTRAINT fk_eff_poste REFERENCES dw.dim_poste (poste_sk),
        type_conge_sk          int NOT NULL CONSTRAINT fk_eff_type_conge REFERENCES dw.dim_type_conge (type_conge_sk),
        date_embauche_sk       int NOT NULL CONSTRAINT fk_eff_embauche REFERENCES dw.dim_date (date_sk),
        date_debut_contrat_sk  int NOT NULL CONSTRAINT fk_eff_debut_contrat REFERENCES dw.dim_date (date_sk),
        date_fin_contrat_sk    int NULL CONSTRAINT fk_eff_fin_contrat REFERENCES dw.dim_date (date_sk),
        taux_vacataire_sk      int NULL CONSTRAINT fk_eff_taux_vac REFERENCES dw.dim_taux_horaire (taux_sk),
        taux_hs_admin_sk       int NULL CONSTRAINT fk_eff_taux_hs REFERENCES dw.dim_taux_horaire (taux_sk),
        salaire_mensuel        decimal(12,2) NULL,
        heures_payees          decimal(8,2) NULL,
        heures_sup_admin       decimal(8,2) NULL,
        cout_vacataire         decimal(14,2) NULL,
        cout_hs_admin          decimal(14,2) NULL,
        cout_total_estime      decimal(14,2) NULL,
        conges_consommes       decimal(5,1) NULL,
        solde_conges           decimal(5,1) NULL,
        annees_experience      decimal(4,1) NULL,
        anciennete_jours       int NULL,
        nb_employes            smallint NOT NULL CONSTRAINT df_eff_nb DEFAULT 1,
        source_fichier         nvarchar(50) NULL,
        CONSTRAINT pk_fact_effectif PRIMARY KEY (date_snapshot_sk, employe_sk)
    );
END;

IF OBJECT_ID(N'dw.fact_pointage') IS NULL
BEGIN
    CREATE TABLE dw.fact_pointage (
        pointage_sk           bigint IDENTITY(1,1) NOT NULL CONSTRAINT pk_fact_pointage PRIMARY KEY,
        date_sk               int NOT NULL CONSTRAINT fk_pt_date REFERENCES dw.dim_date (date_sk),
        employe_sk            int NOT NULL CONSTRAINT fk_pt_employe REFERENCES dw.dim_employe (employe_sk),
        departement_sk        int NOT NULL CONSTRAINT fk_pt_departement REFERENCES dw.dim_departement (departement_sk),
        heure_arrivee_sk      smallint NOT NULL CONSTRAINT fk_pt_heure REFERENCES dw.dim_heure (heure_sk),
        taux_hs_sk            int NOT NULL CONSTRAINT fk_pt_taux REFERENCES dw.dim_taux_horaire (taux_sk),
        minutes_travaillees   int NULL,
        minutes_pause         int NULL,
        minutes_retard        int NULL,
        minutes_sup           int NULL,
        cout_heures_sup       decimal(12,2) NULL,
        nb_pointages          smallint NOT NULL CONSTRAINT df_pt_nb DEFAULT 1,
        source_fichier        nvarchar(50) NULL
    );
    CREATE INDEX ix_pointage_employe_date ON dw.fact_pointage (employe_sk, date_sk);
END;

IF OBJECT_ID(N'dw.fact_inscription_formation') IS NULL
BEGIN
    CREATE TABLE dw.fact_inscription_formation (
        date_snapshot_sk  int NOT NULL CONSTRAINT fk_ins_snapshot REFERENCES dw.dim_date (date_sk),
        employe_sk        int NOT NULL CONSTRAINT fk_ins_employe REFERENCES dw.dim_employe (employe_sk),
        cours_sk          int NOT NULL CONSTRAINT fk_ins_cours REFERENCES dw.dim_cours (cours_sk),
        departement_sk    int NOT NULL CONSTRAINT fk_ins_departement REFERENCES dw.dim_departement (departement_sk),
        nb_inscriptions   smallint NOT NULL CONSTRAINT df_ins_nb DEFAULT 1,
        CONSTRAINT pk_fact_inscription PRIMARY KEY (date_snapshot_sk, employe_sk, cours_sk)
    );
END;
GO
