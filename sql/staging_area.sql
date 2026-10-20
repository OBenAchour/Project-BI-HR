/* =============================================================================
   Zone de staging RH_Staging_Area, schéma stg
   -----------------------------------------------------------------------------
   Règles :
   - Le SA ne contient que les colonnes des fichiers sources (aucune colonne
     ajoutée : pas de date de chargement, de nom de fichier ni de lot).
   - Aucune transformation dans SSIS ni dans les fichiers : chaque colonne a
     le type que SSIS lit dans le fichier. Toute adaptation de type est faite
     ici, dans la définition des tables.
   - Correspondance des types SSIS -> SQL Server :
       DT_WSTR(n)            -> nvarchar(n)
       DT_R8 (nombre Excel)  -> float
       DT_DATE (date Excel)  -> datetime
       DT_STR / DT_TEXT UTF-8 (code page 65001)
                             -> varchar(n) / varchar(max) en collation UTF-8
   - La collation UTF-8 exige SQL Server 2019 ou plus récent.
   Le script recrée les tables : relancer ensuite Load_Staging_Area.dtsx.
   ============================================================================= */

IF CAST(SERVERPROPERTY('ProductMajorVersion') AS int) < 15
    THROW 50000, N'SQL Server 2019 ou plus récent est nécessaire (collation UTF-8).', 1;
GO

IF SCHEMA_ID(N'stg') IS NULL EXEC (N'CREATE SCHEMA stg');
GO

-- emp_data.xlsx (feuille Sheet1)
DROP TABLE IF EXISTS stg.emp_data;
CREATE TABLE stg.emp_data (
    CODE                  nvarchar(255) NULL,
    NAME_EMP              nvarchar(255) NULL,
    GENDER                nvarchar(255) NULL,
    ADRESS                nvarchar(255) NULL,
    MARITAL_STATUS        float         NULL,
    GRAD_UNIVERSITY       nvarchar(255) NULL,
    TYPE_DIPLOMA          nvarchar(255) NULL,
    EXP_YEARS             float         NULL,
    EMAIL                 nvarchar(255) NULL,
    LANGUAGE              nvarchar(255) NULL,
    RANK                  float         NULL,
    GRADE                 nvarchar(255) NULL,
    POSITION              nvarchar(255) NULL,
    SALARY                float         NULL,
    HOURS                 float         NULL,
    STARTING_DATE         datetime      NULL,
    REGISTRATION_NUMBER   nvarchar(255) NULL,
    TYPE_CONTRACT         nvarchar(255) NULL,
    DEP_ID                nvarchar(255) NULL,
    TECHNOLOGIES          nvarchar(255) NULL,
    LEAVE_CONSUMED        float         NULL,
    LEAVE_BALANCE         float         NULL,
    CONTRACT_START        datetime      NULL,
    CONTRACT_END          datetime      NULL,
    ID_TRAINING           nvarchar(255) NULL,
    ACTIVITY              nvarchar(255) NULL,
    TENURE                float         NULL,
    ADRESSE_MISSION       nvarchar(255) NULL,
    LEAVE_TYPE            nvarchar(255) NULL,
    SOURCE_of_employment  nvarchar(255) NULL
);

-- administration_data.xlsx (feuille Sheet) : les dates y sont saisies en texte
DROP TABLE IF EXISTS stg.administration_data;
CREATE TABLE stg.administration_data (
    ID_Employee           nvarchar(255) NULL,
    NAME_EMP              nvarchar(255) NULL,
    GENDER                nvarchar(255) NULL,
    ADDRESS               nvarchar(255) NULL,
    MARITAL_STATUS        float         NULL,
    Grade                 nvarchar(255) NULL,
    TYPE_DIPLOMA          nvarchar(255) NULL,
    EXP_YEARS             float         NULL,
    EMAIL                 nvarchar(255) NULL,
    LANGUAGE              nvarchar(255) NULL,
    extra_hour            float         NULL,
    POSITION              nvarchar(255) NULL,
    SALARY                float         NULL,
    STARTING_DATE         nvarchar(255) NULL,
    REGISTRATION_NUMBER   nvarchar(255) NULL,
    TYPE_CONTRACT         nvarchar(255) NULL,
    DEP_ID                nvarchar(255) NULL,
    LEAVE_CONSUMED        float         NULL,
    LEAVE_BALANCE         float         NULL,
    CONTRACT_START        nvarchar(255) NULL,
    CONTRACT_END          nvarchar(255) NULL,
    TENURE                float         NULL,
    LAST_LEAVE_TYPE       nvarchar(255) NULL,
    SOURCE_of_employment  nvarchar(255) NULL
);

-- attendance_dataset_2023.csv (pointages techniques)
DROP TABLE IF EXISTS stg.attendance_tech_2023;
CREATE TABLE stg.attendance_tech_2023 (
    ID_Employee  nvarchar(255) NULL,
    [Date]       nvarchar(255) NULL,
    StartTime    nvarchar(255) NULL,
    BreakTime    nvarchar(255) NULL,
    ResumeTime   nvarchar(255) NULL,
    EndTime      nvarchar(255) NULL
);

-- Administration_attendance.xlsx (pointages administratifs, feuille Sheet1)
DROP TABLE IF EXISTS stg.attendance_admin_2023;
CREATE TABLE stg.attendance_admin_2023 (
    ID_Employee  nvarchar(255) NULL,
    [Date]       nvarchar(255) NULL,
    StartTime    nvarchar(255) NULL,
    BreakTime    nvarchar(255) NULL,
    ResumeTime   nvarchar(255) NULL,
    EndTime      nvarchar(255) NULL
);

-- Coursera_trainings.csv (UTF-8) : la description est un texte long UTF-8
DROP TABLE IF EXISTS stg.coursera_trainings;
CREATE TABLE stg.coursera_trainings (
    id_course             nvarchar(255)  NULL,
    course_id             nvarchar(255)  NULL,
    [Course Name]         nvarchar(500)  NULL,
    University            nvarchar(255)  NULL,
    [Difficulty Level]    nvarchar(255)  NULL,
    [Course Rating]       nvarchar(255)  NULL,
    [Course URL]          nvarchar(500)  NULL,
    [Course Description]  varchar(max)   COLLATE Latin1_General_100_CI_AS_SC_UTF8 NULL,
    Skills                nvarchar(2000) NULL
);

-- departments.ods
DROP TABLE IF EXISTS stg.departments;
CREATE TABLE stg.departments (
    ID_DEP    nvarchar(255) NULL,
    DEP       nvarchar(255) NULL,
    CAPACITY  nvarchar(255) NULL
);

-- extrainfos.txt (UTF-8, sans en-tête, séparateur « : »)
-- libelle = texte avant « : », valeur = texte après « : », tels quels.
DROP TABLE IF EXISTS stg.extrainfos;
CREATE TABLE stg.extrainfos (
    libelle  varchar(50) COLLATE Latin1_General_100_CI_AS_SC_UTF8 NULL,
    valeur   varchar(50) COLLATE Latin1_General_100_CI_AS_SC_UTF8 NULL
);
GO
