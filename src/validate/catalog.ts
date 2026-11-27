/**
 * Reference data for the citation checks: which 21 CFR sections exist, which
 * standard editions exist and which are current, and acronyms readers in this
 * field already know. Checked November 2026; update it when FDA or ISO/IEC
 * publish changes. Anything not listed here is reported as "can't confirm",
 * never as wrong.
 */

export const CATALOG_DATE = 'November 2026';

/* ---------- 21 CFR Part 820 (QMSR, effective 2 February 2026) ---------- */

export const QMSR_SECTIONS: Record<string, string> = {
  '1': 'Scope',
  '3': 'Definitions',
  '7': 'Incorporation by reference',
  '10': 'Requirements for a quality management system',
  '15': 'Clarification of concepts',
  '35': 'Control of records',
  '45': 'Device labeling and packaging controls',
};

/** Sections of the old Quality System Regulation removed by the QMSR, with the nearest ISO 13485:2016 clause. */
export const QSR_REMOVED: Record<string, { title: string; now: string }> = {
  '5': { title: 'Quality system', now: '21 CFR 820.10 and ISO 13485:2016 §4.1' },
  '20': { title: 'Management responsibility', now: 'ISO 13485:2016 §5' },
  '22': { title: 'Quality audit', now: 'ISO 13485:2016 §8.2.4' },
  '25': { title: 'Personnel', now: 'ISO 13485:2016 §6.2' },
  '30': { title: 'Design controls', now: 'ISO 13485:2016 §7.3 (via 21 CFR 820.10)' },
  '40': { title: 'Document controls', now: 'ISO 13485:2016 §4.2.4' },
  '50': { title: 'Purchasing controls', now: 'ISO 13485:2016 §7.4' },
  '60': { title: 'Identification', now: 'ISO 13485:2016 §7.5.8' },
  '65': { title: 'Traceability', now: 'ISO 13485:2016 §7.5.9' },
  '70': { title: 'Production and process controls', now: 'ISO 13485:2016 §7.5.1, §6.3 and §6.4' },
  '72': { title: 'Inspection, measuring and test equipment', now: 'ISO 13485:2016 §7.6' },
  '75': { title: 'Process validation', now: 'ISO 13485:2016 §7.5.6' },
  '80': { title: 'Receiving, in-process and finished device acceptance', now: 'ISO 13485:2016 §8.2.6' },
  '86': { title: 'Acceptance status', now: 'ISO 13485:2016 §7.5.8 and §8.2.6' },
  '90': { title: 'Nonconforming product', now: 'ISO 13485:2016 §8.3' },
  '100': { title: 'Corrective and preventive action', now: 'ISO 13485:2016 §8.5.2 and §8.5.3' },
  '120': { title: 'Device labeling', now: '21 CFR 820.45' },
  '130': { title: 'Device packaging', now: '21 CFR 820.45' },
  '140': { title: 'Handling', now: 'ISO 13485:2016 §7.5.11' },
  '150': { title: 'Storage', now: 'ISO 13485:2016 §7.5.11' },
  '160': { title: 'Distribution', now: 'ISO 13485:2016 §7.5.1 and §7.5.9' },
  '170': { title: 'Installation', now: 'ISO 13485:2016 §7.5.3' },
  '180': { title: 'General records requirements', now: '21 CFR 820.35 and ISO 13485:2016 §4.2.5' },
  '181': { title: 'Device master record', now: 'the medical device file, ISO 13485:2016 §4.2.3' },
  '184': { title: 'Device history record', now: 'production records, ISO 13485:2016 §7.5.1 and 21 CFR 820.35' },
  '186': { title: 'Quality system record', now: 'QMS documentation, ISO 13485:2016 §4.2' },
  '198': { title: 'Complaint files', now: 'ISO 13485:2016 §8.2.2 and 21 CFR 820.35(a)' },
  '200': { title: 'Servicing', now: 'ISO 13485:2016 §7.5.4 and 21 CFR 820.35(b)' },
  '250': { title: 'Statistical techniques', now: 'ISO 13485:2016 §8.1 and §8.4' },
};

/* ---------- 21 CFR Part 11 ---------- */

/** Sections and their lettered paragraphs. An empty list means no lettered paragraphs. */
export const PART11: Record<string, string[] | null> = {
  '1': null, // scope: paragraphs not checked
  '2': null,
  '3': null,
  '10': 'abcdefghijk'.split(''),
  '30': [],
  '50': ['a', 'b'],
  '70': [],
  '100': ['a', 'b', 'c'],
  '200': ['a', 'b'],
  '300': ['a', 'b', 'c', 'd', 'e'],
};

/* ---------- 21 CFR Subchapter H (medical devices) ---------- */

export const DEVICE_PARTS = new Set([
  800, 801, 803, 806, 807, 808, 809, 810, 812, 814, 820, 821, 822, 830, 860, 861, 862, 864, 866, 868, 870, 872, 874, 876, 878, 880,
  882, 884, 886, 888, 890, 892, 895, 898,
]);

/* ---------- Standards ---------- */

export type EditionStatus = 'current' | 'superseded' | 'amendment';

export interface StandardInfo {
  /** As it's usually written, without the edition. */
  name: string;
  title: string;
  /** How to cite the current edition. */
  cite: string;
  editions: Record<string, EditionStatus>;
  note?: string;
}

/** Keyed by number, e.g. "14971" or "62366-1". */
export const STANDARDS: Record<string, StandardInfo> = {
  '13485': {
    name: 'ISO 13485',
    title: 'Medical devices — Quality management systems',
    cite: 'ISO 13485:2016',
    editions: { '1996': 'superseded', '2003': 'superseded', '2016': 'current' },
    note: 'The QMSR incorporates ISO 13485:2016 by reference (21 CFR 820.7).',
  },
  '14971': {
    name: 'ISO 14971',
    title: 'Application of risk management to medical devices',
    cite: 'ISO 14971:2019',
    editions: { '2000': 'superseded', '2007': 'superseded', '2019': 'current' },
  },
  '24971': {
    name: 'ISO/TR 24971',
    title: 'Guidance on the application of ISO 14971',
    cite: 'ISO/TR 24971:2020',
    editions: { '2013': 'superseded', '2020': 'current' },
  },
  '62304': {
    name: 'IEC 62304',
    title: 'Medical device software — Software life cycle processes',
    cite: 'IEC 62304:2006+A1:2015',
    editions: { '2006': 'current', '2015': 'amendment' },
    note: 'Edition 2 was still in development when this catalog was checked.',
  },
  '62366-1': {
    name: 'IEC 62366-1',
    title: 'Application of usability engineering to medical devices',
    cite: 'IEC 62366-1:2015+A1:2020',
    editions: { '2015': 'current', '2020': 'amendment' },
  },
  '62366': {
    name: 'IEC 62366',
    title: 'Application of usability engineering to medical devices (withdrawn)',
    cite: 'IEC 62366-1:2015+A1:2020',
    editions: { '2007': 'superseded' },
  },
  '60601-1': {
    name: 'IEC 60601-1',
    title: 'Medical electrical equipment — General requirements for basic safety and essential performance',
    cite: 'IEC 60601-1:2005+A1:2012+A2:2020',
    editions: { '1988': 'superseded', '2005': 'current', '2012': 'amendment', '2020': 'amendment' },
  },
  '60601-1-2': {
    name: 'IEC 60601-1-2',
    title: 'Electromagnetic disturbances — Requirements and tests',
    cite: 'IEC 60601-1-2:2014+A1:2020',
    editions: { '2001': 'superseded', '2007': 'superseded', '2014': 'current', '2020': 'amendment' },
  },
  '10993-1': {
    name: 'ISO 10993-1',
    title: 'Biological evaluation of medical devices — Part 1',
    cite: 'ISO 10993-1:2025',
    editions: { '2003': 'superseded', '2009': 'superseded', '2018': 'superseded', '2025': 'current' },
    note: 'FDA may still recognize ISO 10993-1:2018; check the recognized consensus standards database before changing a submission.',
  },
  '14155': {
    name: 'ISO 14155',
    title: 'Clinical investigation of medical devices for human subjects — Good clinical practice',
    cite: 'ISO 14155:2020',
    editions: { '2011': 'superseded', '2020': 'current' },
  },
  '15223-1': {
    name: 'ISO 15223-1',
    title: 'Symbols to be used with information to be supplied by the manufacturer',
    cite: 'ISO 15223-1:2021',
    editions: { '2012': 'superseded', '2016': 'superseded', '2021': 'current' },
  },
  '20417': {
    name: 'ISO 20417',
    title: 'Information to be supplied by the manufacturer',
    cite: 'ISO 20417:2021',
    editions: { '2021': 'current' },
  },
  '81001-5-1': {
    name: 'IEC 81001-5-1',
    title: 'Health software — Security activities in the product life cycle',
    cite: 'IEC 81001-5-1:2021',
    editions: { '2021': 'current' },
  },
  '82304-1': {
    name: 'IEC 82304-1',
    title: 'Health software — General requirements for product safety',
    cite: 'IEC 82304-1:2016',
    editions: { '2016': 'current' },
  },
  '29148': {
    name: 'ISO/IEC/IEEE 29148',
    title: 'Systems and software engineering — Requirements engineering',
    cite: 'ISO/IEC/IEEE 29148:2018',
    editions: { '2011': 'superseded', '2018': 'current' },
  },
  '27001': {
    name: 'ISO/IEC 27001',
    title: 'Information security management systems',
    cite: 'ISO/IEC 27001:2022',
    editions: { '2005': 'superseded', '2013': 'superseded', '2022': 'current' },
  },
};

/* ---------- Acronyms ---------- */

/** Acronyms a reader of a medical device QMS document can be expected to know. Others need defining. */
export const KNOWN_ACRONYMS = new Set(
  `FDA CFR QMSR QSR QMS ISO IEC IEEE AAMI ANSI ASTM CDRH CBER CDER MDR MDRs MDSAP EU UK US USA UDI GUDID DI PI DHF DMR DHR MDF
  CAPA NCR NC SOP SOPs WI FRM QM SRS SDS SAD SOUP OTS SBOM CVE CVSS SAMD SIMD AI ML PCCP IFU UI UX HFE FMEA DFMEA PFMEA UFMEA FTA
  PHA RMF RMP RMR IQ OQ PQ IDE IRB PMA IVD CLIA HIPAA PHI PII GDPR NIST MFA SSO SHA API APIs SDK OS CPU GPU RAM USB BLE LAN TLS SSL
  HTTPS HTTP VPN JSON XML PDF CSV URL ID IDs QA QC RA CEO CTO COO CFO VP HR IT OEM CMO CDMO CRO KPI SLA FAQ MRI CT ECG EKG EEG ICU
  EMC ESD EMI RF LED LCD PCB PCBA BOM MES ERP PLM ALM CSA GAMP GMP GLP GCP GDP ALCOA ICH MHRA TGA PMDA NMPA ANVISA BSI CE UKCA MDD
  IVDR MDCG PRRC PSUR PMCF PMS PMSR SSCP CER CEP IMDRF GHTF CDS MDDS ASCA RTA AIDSF DSF NPRM USC FDCA OIG FTC CMS CPT ICD HL7 FHIR
  DICOM PACS EHR EMR LIS RTOS CI CD QR OCR NLP LLM AUC ROC PPV NPV SD SE PDCA SME ALARP AFAP RPN SIL IP USP SAL PPE DOE AQL OOS
  TPLC IMDRF SaMD HHS NA OK SN LOT REF MD MDSW AE SAE ADE SADE UADE GSPR ER TR TS PAS WG TC SC IVDs RFID NFC GPS SMS PIN OTP
  TOTP WCAG SOC CISA FIPS AES RSA PKI CA DNS IoT IoMT OTA VM AWS GCP SQL SaaS PaaS IaaS UAT SIT MVP PRD MRD UN DI SR HW SW SYS REQ
  TC TP TR VT VER VAL VV EO EtO ANDA NDA BLA OTC RX PMN FOIA CRL AI ACK PO SAR SN UDID SPL UL CSV GS1 HIBCC ICCBBA FD&C SI NFPA RH SG3`.split(/\s+/).filter(Boolean),
);

/** All-caps words that are emphasis or logic words, not acronyms. */
export const CAPS_WORDS = new Set(
  'NOTE NOTES WARNING WARNINGS CAUTION DANGER IMPORTANT AND OR NOT IF THEN WHEN WHILE WHERE ALL ANY NONE YES NO TBD TBC TBA TODO FIXME ASAP XXX DRAFT CONFIDENTIAL OBSOLETE COPY UNCONTROLLED APPROVED REJECTED PASS FAIL ONLY MUST SHALL SHOULD MAY'.split(
    ' ',
  ),
);
