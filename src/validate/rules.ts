/**
 * The rules. Each one names the guideline behind it so a reviewer can weigh it:
 * INCOSE Guide to Writing Requirements (GtWR v4), EARS, ISO/IEC/IEEE 29148,
 * ISO/IEC Directives Part 2 (verbal forms), FDA regulations and guidance, the
 * QMSR, ISO 14971, and the Federal Plain Language Guidelines.
 *
 * Rules favour precision over recall: a rule that cries wolf gets ignored.
 */
import { CAPS_WORDS, CATALOG_DATE, DEVICE_PARTS, KNOWN_ACRONYMS, PART11, QMSR_SECTIONS, QSR_REMOVED, STANDARDS } from './catalog.ts';
import { sentences, wordCount } from './parse.ts';
import type { CheckDoc, CheckOptions, DocHit, Hit, Rule, Severity, Unit } from './types.ts';

/* ---------- Helpers ---------- */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Whole-word, case-insensitive alternation; spaces match any whitespace. */
function words(list: string[], flags = 'gi') {
  return new RegExp(`(?<![\\w-])(?:${list.map((w) => esc(w).replace(/ /g, '\\s+')).join('|')})(?![\\w-])`, flags);
}

function find(re: RegExp, text: string, fn?: (m: RegExpMatchArray) => Partial<Hit> | false | undefined): Hit[] {
  const out: Hit[] = [];
  for (const m of text.matchAll(re.global ? re : new RegExp(re.source, `${re.flags}g`))) {
    const extra = fn ? fn(m) : {};
    if (extra === false) continue;
    out.push({ start: m.index!, end: m.index! + m[0].length, ...(extra ?? {}) });
  }
  return out;
}

const keepCase = (orig: string, rep: string) => (/^[A-Z]/.test(orig) ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep);

const MEASURE_RE =
  /\d+(?:[.,]\d+)?\s?(?:ms|s|sec|seconds?|min|minutes?|h|hrs?|hours?|%|mm|cm|m|km|kg|g|mg|µg|ug|mcg|ml|mL|l|L|°C|°F|V|mV|mA|A|W|Hz|kHz|bpm|dB|days?|weeks?|months?|years?|cycles?|N|kPa|mmHg|clicks?|steps?|taps?|times|samples?|users?|records?|errors?)\b|\b(?:at least|no more than|not more than|less than|greater than|fewer than|up to|between|within|maximum|minimum)\s+\d/i;

const FREQUENCY_RE =
  /\b(?:daily|weekly|monthly|quarterly|annually|yearly|biannually|semi-annually|hourly|every \w+|each (?:day|week|month|quarter|year|shift|release|build|batch)|at least (?:once|twice|\w+ times)|per (?:day|week|month|quarter|year|release|batch|lot))\b|\d+\s?(?:hours?|days?|weeks?|months?|years?|working days|calendar days)\b/i;

const LEGACY_RE = /\b(?:legacy|former(?:ly)?|previous(?:ly)?|replac(?:e|es|ed|ing)|supersed(?:e|es|ed|ing)|old(?:er)?|until|prior to 2 February 2026|synonyms?|renamed|was called|historical(?:ly)?)\b/i;

/** Per-document facts some sentence rules need, computed once. */
const docFacts = new WeakMap<CheckDoc, { shall: boolean }>();
function facts(d: CheckDoc) {
  let f = docFacts.get(d);
  if (!f) {
    f = { shall: d.units.some((u) => /\bshall\b/i.test(u.text)) };
    docFacts.set(d, f);
  }
  return f;
}

/* ---------- Release blockers ---------- */

const PLACEHOLDER_RE =
  /\b(?:TBD|TBC|TBA|TODO|FIXME)\b|\bto be (?:determined|confirmed|defined|decided|added|completed|provided)\b|\blorem ipsum\b|\?{3,}|\bX{3,}\b|\bXX%|<(?:insert|add|enter|your)\b[^>]{0,60}>|\{\{\s*[\w.]+\s*\}\}|\[(?![xX ]\])[^\]\n]{0,60}?\b(?:insert|add|enter|your|name|date|company|device|placeholder|describe|specify|fill(?: in)?|tbd|title|number|version|signature|address|product|manufacturer|model|value|details?)\b[^\]\n]{0,60}\]/gi;

const CHAT_RE =
  /\bas an ai\b(?:\s+language model)?|\bi(?:'m|’m| am) (?:sorry|unable|not able)\b|\bi (?:cannot|can(?:'|’)t|can not) (?:provide|help|assist|create|generate|give|access)\b|\bi hope (?:this|that) helps\b|\blet me know if\b|\bfeel free to\b|\bhere(?:'s|’s| is| are) (?:a|an|the|your|some) (?:[\w-]+ ){0,3}(?:draft|template|sample|example|version|outline|document|procedure|sop|summary|rewrite)\b|^(?:sure|certainly|absolutely|of course|great question)\b[,!.]|\bknowledge cut-?off\b|\bas of my (?:last|latest) (?:update|training)\b|\b(?:customi[sz]e|adapt|tailor) (?:this|it|the template) (?:to|for) (?:your|the) (?:organi[sz]ation|company|needs|situation)\b|\bthis (?:template|draft|document) (?:is|was) (?:generated|created|written) by (?:an? )?(?:ai|model|assistant)\b|\b(?:consult|check with) (?:a|your) (?:regulatory|legal|qualified) (?:professional|expert|advisor)\b/gim;

const releaseRules: Rule[] = [
  {
    id: 'open-input',
    name: 'Value still needed',
    category: 'release',
    severity: 'error',
    source: 'ISO 13485:2016 §4.2.4 (document control)',
    why: 'A controlled document can’t be approved with blanks in it.',
    message: 'Needs a value.',
    doc: (d) => {
      const seen = new Map<string, DocHit & { n: number }>();
      for (const u of d.units) {
        const add = (label: string, start: number, end: number) => {
          const prev = seen.get(label);
          if (prev) prev.n++;
          else seen.set(label, { unit: u.i, start, end, n: 1 });
        };
        for (const sp of u.spans ?? []) if (sp.missing) add(sp.label, sp.start, sp.end);
        for (const m of u.text.matchAll(/\[([^\]\n]{1,80}?) — needs input\]/g)) add(m[1], m.index!, m.index! + m[0].length);
      }
      return [...seen.entries()].map(([label, h]) => ({
        unit: h.unit,
        start: h.start,
        end: h.end,
        message: `Needs a value: ${label}${h.n > 1 ? ` (${h.n} places in this document)` : ''}.`,
      }));
    },
  },
  {
    id: 'placeholder',
    name: 'Placeholder left in',
    category: 'release',
    severity: 'error',
    source: 'ISO 13485:2016 §4.2.4 (document control)',
    why: 'TBDs and template brackets mean the document isn’t finished; an auditor reads them as an uncontrolled draft.',
    message: 'Placeholder left in the text. Fill it in, or record it as an open item with an owner and due date.',
    example: { bad: 'Records are kept for [insert retention period].', good: 'Records are kept for the device lifetime plus 2 years.' },
    sentence: (s) => find(PLACEHOLDER_RE, s.text, (m) => (/— needs input\]$/.test(m[0]) ? false : {})),
  },
  {
    id: 'chat-artifact',
    name: 'Text addressed to the reader of a chat',
    category: 'release',
    severity: 'error',
    source: 'ISO 13485:2016 §4.2.4; Biomedix review practice for model-drafted text',
    why: 'Phrases a text generator addresses to the person who prompted it show the draft wasn’t read before release.',
    message: 'Reads like a chat reply, not a controlled document. Delete it.',
    example: { bad: 'Here is a draft SOP you can customize for your organization.', good: '(delete)' },
    sentence: (s) => find(CHAT_RE, s.text),
  },
  {
    id: 'markup-artifact',
    name: 'Leftover formatting code',
    category: 'release',
    severity: 'warning',
    source: 'Biomedix document style',
    why: 'Markdown or HTML codes in a Word or PDF document mean text was pasted without formatting it.',
    message: 'Formatting code in the text. Apply the formatting or remove the symbols.',
    sentence: (s) => {
      const md = s.doc.format === 'text' ? /\*\*[^*\n]+\*\*|(?:^|\s)#{2,6}\s|```/g : /```/g;
      const html = /<\/?(?:br|p|div|span|b|i|strong|em|ul|ol|li|table|tr|td|th|h[1-6])\b[^>]*>|&(?:nbsp|amp|lt|gt|quot|#\d+);|\\n/gi;
      return [...find(md, s.text), ...find(html, s.text)];
    },
  },
  {
    id: 'duplicate-text',
    name: 'Repeated sentence',
    category: 'release',
    severity: 'warning',
    source: 'INCOSE GtWR R30 (unique expression)',
    why: 'Saying the same thing twice invites the two copies to drift apart at the next revision.',
    message: 'Repeats an earlier sentence.',
    doc: (d) => {
      const seen = new Map<string, string>();
      const out: DocHit[] = [];
      for (const u of d.units) {
        if (u.kind !== 'p' && u.kind !== 'li') continue;
        for (const s of sentences(u.text)) {
          if (wordCount(s.text) < 9) continue;
          const key = s.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          const first = seen.get(key);
          if (first === undefined) seen.set(key, u.section);
          else out.push({ unit: u.i, start: s.offset, end: s.offset + s.text.length, message: `Repeats a sentence already in ${first ? `“${first}”` : 'this document'}. Keep one and refer to it.` });
        }
      }
      return out;
    },
  },
  {
    id: 'empty-section',
    name: 'Empty section',
    category: 'release',
    severity: 'warning',
    source: 'ISO 13485:2016 §4.2.4',
    why: 'A heading with nothing under it reads as content someone forgot to write.',
    message: 'This section has no content. Write it, or state that it doesn’t apply and why.',
    doc: (d) => {
      const out: DocHit[] = [];
      const level = (u: Unit) => (u.kind === 'title' ? 0 : (u.level ?? 1));
      d.units.forEach((u, i) => {
        if (u.kind !== 'heading') return;
        const next = d.units[i + 1];
        if (!next || ((next.kind === 'heading' || next.kind === 'title') && level(next) <= level(u))) out.push({ unit: u.i, start: 0, end: u.text.length });
      });
      return out;
    },
  },
];

/* ---------- Regulatory language ---------- */

const fdaRules: Rule[] = [
  {
    id: 'fda-status-claim',
    name: 'Wrong word for FDA marketing status',
    category: 'fda',
    severity: 'error',
    source: '21 CFR 807.97; 21 CFR 807.39; FD&C Act §502(a)',
    why: 'A 510(k) device is cleared, a De Novo request is granted, and only a PMA device is approved. Claiming approval, certification or registration as a mark of quality misbrands the device.',
    message: 'Check the FDA status wording.',
    example: { bad: 'The FDA-approved Example ECG Patch…', good: 'The FDA-cleared Example ECG Patch… (510(k))' },
    sentence: (s) => {
      const out: Hit[] = [];
      const pathway = s.opts.pathway ?? '';
      if (!/\bPMA\b|premarket approval/i.test(s.text) && pathway !== 'pma') {
        out.push(
          ...find(/\bFDA[- ]approv(?:ed|al)\b|\bapproved by (?:the )?(?:FDA|U\.?S\.? Food and Drug Administration|Food and Drug Administration)\b/gi, s.text, () =>
            pathway === '510k' || pathway === 'exempt'
              ? {
                  message:
                    pathway === 'exempt'
                      ? 'A 510(k)-exempt device isn’t approved or cleared by FDA. Remove the claim (21 CFR 807.97).'
                      : 'A 510(k) device is cleared, not approved. “FDA approved” misbrands it (21 CFR 807.97). Write “FDA cleared”.',
                  replace: pathway === 'exempt' ? undefined : 'FDA cleared',
                }
              : pathway === 'de-novo'
                ? { message: 'A De Novo request is granted, not approved. Write “granted marketing authorization through the De Novo pathway”.' }
                : {
                    severity: 'warning',
                    message: 'Only PMA devices are FDA approved. 510(k) devices are cleared and De Novo requests are granted (21 CFR 807.97). Confirm the pathway.',
                  },
          ),
        );
      }
      out.push(
        ...find(/\bFDA[- ]certified\b|\bcertified by (?:the )?FDA\b|\bFDA certification\b/gi, s.text, () => ({
          message: 'FDA doesn’t certify devices, software or companies. Say what FDA did (cleared, granted, approved) or remove the claim.',
        })),
        ...find(/\bFDA[- ]registered (?:device|product|software|app|system)s?\b/gi, s.text, () => ({
          message: 'Registration and listing don’t mean FDA reviewed or approved the device (21 CFR 807.39). Don’t use registration as a quality claim.',
        })),
        ...find(/\bFDA[- ]compliant\b|\bPart 11[- ](?:certified|validated)\b|\bPart 11[- ]compliant (?:software|system|tool|platform|solution|product)s?\b/gi, s.text, () => ({
          severity: 'warning',
          message:
            'No product is “Part 11 compliant” or “FDA compliant” on its own: compliance depends on validation and how the system is used. Say which controls the system provides and cite the validation record.',
        })),
      );
      return out;
    },
  },
  {
    id: 'guidance-binding',
    name: 'Guidance described as a requirement',
    category: 'fda',
    severity: 'warning',
    source: '21 CFR 10.115(d) (good guidance practices)',
    why: 'FDA guidance documents describe FDA’s current thinking and aren’t binding. Calling them requirements misstates the law and over-commits the company.',
    message: 'FDA guidance isn’t binding (21 CFR 10.115(d)). Write “FDA recommends”, or cite the regulation that requires it.',
    example: { bad: 'FDA guidance requires a PCCP for every AI device.', good: 'FDA guidance recommends a PCCP when planned model changes would otherwise need a new submission.' },
    sentence: (s) => {
      if (!/\bguidance\b/i.test(s.text)) return [];
      if (/\bCFR\b|\bregulations?\b|\bU\.?S\.?C\.?\b|\bsection\s+5\d\d|\bFD&C\b|\bstatut|\bQMSR\b|\b524B\b/i.test(s.text)) return [];
      return find(/\b(?:requires?|required|mandates?|mandatory|must)\b/gi, s.text).slice(0, 1);
    },
  },
  {
    id: 'qmsr-terms',
    name: 'Old Quality System Regulation term',
    category: 'fda',
    severity: 'warning',
    source: '21 CFR 820 as amended by the QMSR (effective 2 February 2026); ISO 13485:2016',
    why: 'Since 2 February 2026 Part 820 incorporates ISO 13485:2016, and the DHF, DMR and DHR terms are gone. Old terms suggest the procedure wasn’t updated.',
    message: 'Old QSR term.',
    example: { bad: 'Design outputs are filed in the DHF.', good: 'Design outputs are filed in the design and development file.' },
    sentence: (s) => {
      if (LEGACY_RE.test(s.text)) return [];
      const T: [RegExp, string, string][] = [
        [/\bQuality System Regulation\b|\bQSR\b/g, 'Quality Management System Regulation (QMSR)', 'Part 820 is now the Quality Management System Regulation (QMSR).'],
        [/\bdesign history files?\b|\bDHFs?\b(?!-)/gi, 'design and development file', 'The QMSR uses the ISO 13485 term “design and development file” (§7.3.10), not DHF.'],
        [/\bdevice master records?\b|\bDMRs?\b/gi, 'medical device file', 'The QMSR uses the ISO 13485 term “medical device file” (§4.2.3), not DMR.'],
        [/\bdevice history records?\b|\bDHRs?\b/gi, 'production records', 'The QMSR uses “production records” (ISO 13485 §7.5.1 and 21 CFR 820.35), not DHR.'],
        [/\bmanagement with executive responsibility\b/gi, 'top management', 'ISO 13485 says “top management”.'],
        [/\bquality system records?\b/gi, 'QMS documentation', 'The quality system record (old 820.186) is gone; ISO 13485 §4.2 covers QMS documentation.'],
      ];
      return T.flatMap(([re, replace, message]) => find(re, s.text, () => ({ replace, message: `${message} If you keep the old term, declare it as a legacy synonym.` })));
    },
  },
  {
    id: 'inspection-exemption',
    name: 'Out-of-date inspection exemption',
    category: 'fda',
    severity: 'error',
    source: 'QMSR final rule (removed 21 CFR 820.180(c)); FDA QMSR FAQ',
    why: 'Under the old QSR, FDA didn’t review management review, internal audit and supplier audit reports. That exemption ended with the QMSR on 2 February 2026.',
    message:
      'Since 2 February 2026 FDA investigators can review management review, internal audit and supplier audit records. Remove the exemption and make sure the records are inspection-ready.',
    sentence: (s) => {
      if (!/\b(?:management reviews?|internal (?:quality )?audits?|quality audits?|supplier audits?)\b/i.test(s.text)) return [];
      if (!/\b(?:FDA|inspect\w*|investigators?)\b/i.test(s.text)) return [];
      return find(/\bexempt(?:ed)? from\b|\bnot (?:be )?(?:subject to|available to|shown to|provided to|disclosed to|open to)\b|\bwithheld from\b|\bshielded from\b/gi, s.text).slice(0, 1);
    },
  },
  {
    id: 'level-of-concern',
    name: 'Level of Concern',
    category: 'fda',
    severity: 'warning',
    source: 'FDA guidance “Content of Premarket Submissions for Device Software Functions” (June 2023)',
    why: 'The 2023 guidance replaced Minor/Moderate/Major Level of Concern with a Documentation Level (Basic or Enhanced).',
    message: 'FDA replaced Level of Concern with Documentation Level (Basic or Enhanced) in its June 2023 software guidance.',
    sentence: (s) => find(/\b(?:minor|moderate|major)?\s*levels? of concern\b/gi, s.text, (m) => ({ start: m.index! + (m[0].length - m[0].trimStart().length) })),
  },
  {
    id: 'safety-absolute',
    name: 'Absolute safety or performance claim',
    category: 'fda',
    severity: 'warning',
    source: 'ISO 14971:2019 §8 (overall residual risk); FD&C Act §502(a)',
    why: 'Risk is reduced and evaluated, never zero. Absolute claims in labeling or a submission are unsupportable and can make labeling misleading.',
    message: 'Absolute claim. State the measured performance or the residual risk instead.',
    example: { bad: 'The algorithm eliminates the risk of missed arrhythmias.', good: 'In validation the algorithm detected 98.1% (95% CI 96.4–99.1%) of sustained arrhythmias.' },
    sentence: (s) => {
      const hard = s.doc.type === 'labeling' || s.doc.type === 'submission';
      return [
        ...find(
          /\brisk[- ]free\b|\b(?:no|zero) risks?\b(?!\s+(?:control|management|assessment|analysis|file|evaluation|acceptab|matrix|level|class|score|reduction|criteria|policy))|\beliminat(?:e|es|ed|ing) (?:all |any |the )?risks?\b|\b100\s?% (?:safe|accurate|reliable|effective|secure|sensitive|specific|sensitivity|specificity|accuracy)\b|\b(?:completely|totally|perfectly|absolutely|inherently|entirely) (?:safe|secure|accurate|reliable)\b|\bharmless\b|\bfail[- ]?proof\b|\bfoolproof\b/gi,
          s.text,
          () => ({ severity: (hard ? 'error' : 'warning') as Severity }),
        ),
        ...find(/\bguarantee[sd]?\b|\bclinically proven\b/gi, s.text, (m) => ({
          severity: 'warning' as Severity,
          message: /clinically/i.test(m[0]) ? '“Clinically proven” needs the clinical evidence cited, and FDA reads it as a claim. Cite the study, or describe the result.' : 'A guarantee is an absolute claim. State what is controlled and how it’s verified.',
        })),
      ];
    },
  },
  {
    id: 'promotional',
    name: 'Promotional or comparative wording',
    category: 'fda',
    severity: 'warning',
    types: ['submission', 'labeling', 'requirements', 'risk', 'record', 'other'],
    source: 'FD&C Act §502(a); FDA review practice for 510(k) device descriptions',
    why: 'Regulatory documents state facts with evidence. Superlatives and comparisons draw reviewer questions and, in labeling, need head-to-head data.',
    message: 'Promotional or comparative wording. State the fact and the evidence.',
    example: { bad: 'A revolutionary, best-in-class ECG patch.', good: 'A single-lead ECG patch worn for up to 14 days.' },
    sentence: (s) =>
      find(
        words([
          'safest', 'most accurate', 'most effective', 'most reliable', 'most advanced', 'best-in-class', 'best in class', 'world-class', 'world class',
          'industry-leading', 'industry leading', 'market-leading', 'superior to', 'better than', 'unparalleled', 'unmatched', 'unrivaled',
          'revolutionary', 'cutting-edge', 'cutting edge', 'groundbreaking', 'ground-breaking', 'breakthrough', 'game-changing', 'game changer',
          'next-generation', 'state-of-the-art', 'state of the art', 'leading-edge', 'first-of-its-kind',
        ]),
        s.text,
        (m) => {
          const before = s.text.slice(Math.max(0, m.index! - 30), m.index!);
          const after = s.text.slice(m.index! + m[0].length, m.index! + m[0].length + 30);
          if (/breakthrough/i.test(m[0]) && /^\s*devices?\b/i.test(after)) return false;
          if (/state.of.the.art/i.test(m[0]) && /acknowledged\s*$|current\s*$/i.test(before)) return false;
          return { severity: (s.doc.type === 'submission' || s.doc.type === 'labeling' ? 'warning' : 'note') as Severity };
        },
      ),
  },
  {
    id: 'day-count',
    name: 'Days without calendar or working',
    category: 'fda',
    severity: 'warning',
    source: '21 CFR 803.50, 803.53 (MDR); 21 CFR 806.10 (corrections and removals)',
    why: 'FDA deadlines are counted in calendar days or work days, and they differ. A procedure that just says “days” can make a report late.',
    message:
      'Say calendar days or working days. FDA counts MDR reports in 30 calendar days or 5 work days (21 CFR 803.50, 803.53) and correction and removal reports in 10 working days (21 CFR 806.10).',
    sentence: (s) =>
      find(/\b(?:within|no later than|not later than|no more than|inside of)\s+(\d+|one|two|three|five|seven|ten|fifteen|thirty|sixty|ninety)\s*(?:\(\d+\)\s*)?days?\b/gi, s.text, (m) => ({
        severity: (s.doc.type === 'procedure' ? 'warning' : 'note') as Severity,
        replace: m[0].replace(/days?$/i, (d) => `calendar ${d}`),
      })),
  },
  {
    id: 'iso14971-terms',
    name: 'ISO 14971 terminology',
    category: 'fda',
    severity: 'note',
    types: ['risk', 'requirements', 'procedure', 'record', 'submission', 'other'],
    source: 'ISO 14971:2019 (terms and definitions); ISO/TR 24971:2020',
    why: 'ISO 14971 defines risk from the probability of occurrence of harm and its severity, and calls the measures “risk control measures”. Using its terms keeps the risk file consistent.',
    message: 'Use the ISO 14971 term.',
    sentence: (s) => [
      ...find(/\b(?:probability|likelihood) of (?:the |a |each )?hazards?\b|\bhazard (?:probability|likelihood)\b/gi, s.text, () => ({
        severity: 'warning' as Severity,
        message: 'ISO 14971 estimates the probability of occurrence of harm (P1 × P2 in ISO/TR 24971), not the probability of a hazard.',
        replace: 'probability of occurrence of harm',
      })),
      ...find(/\brisk mitigations?\b|\bmitigations?\b/gi, s.text, (m) => ({
        message: 'ISO 14971:2019 says “risk control measure”; “mitigation” isn’t a defined term.',
        replace: /s$/i.test(m[0]) ? 'risk control measures' : 'risk control measure',
      })),
      ...find(/\bALARP\b|\bas low as reasonably practicable\b/gi, s.text, () => ({
        message:
          'ISO 14971:2019 doesn’t use ALARP: acceptability comes from the criteria in your risk management plan (see ISO/TR 24971:2020). Under the EU MDR, risks are reduced as far as possible.',
      })),
    ],
  },
  {
    id: 'ai-terms',
    name: 'Out-of-date AI terminology',
    category: 'fda',
    severity: 'note',
    source: 'FDA guidance on Predetermined Change Control Plans for AI-Enabled Device Software Functions (December 2024)',
    why: 'FDA now says “AI-enabled device software function” (AI-DSF). Using its term keeps a submission aligned with the guidance it cites.',
    message: 'FDA’s current term is “AI-enabled device software function” (AI-DSF).',
    sentence: (s) => find(/\bAI\/ML[- ](?:based|enabled|driven)\b(?:\s+(?:SaMD|software as a medical device|device software functions?))?|\bAI\/ML SaMD\b/gi, s.text, () => ({ replace: 'AI-enabled device software function' })),
  },
  {
    id: 'fda-spelling',
    name: 'FDA spelling',
    category: 'fda',
    severity: 'note',
    source: 'Usage in 21 CFR and FDA guidance',
    why: 'Writing terms the way FDA does reads as fluent to a reviewer and keeps search and cross-references working.',
    message: 'FDA spelling.',
    sentence: (s) => {
      const T: [RegExp, (m: string) => string][] = [
        [/\bpre[- ]market\b/gi, (m) => keepCase(m, 'premarket')],
        [/\bpost[- ]market\b/gi, (m) => keepCase(m, 'postmarket')],
        [/\b510\s?k\b|\b510 \(k\)|\b510-k\b|\b510\(K\)/g, () => '510(k)'],
        [/\bde-novo\b|\bdenovo\b/gi, () => 'De Novo'],
        [/\bcyber[- ]security\b/gi, (m) => keepCase(m, 'cybersecurity')],
        [/\bclass [123](?= (?:medical )?devices?\b| recalls?\b)/gi, (m) => `Class ${['', 'I', 'II', 'III'][Number(m.slice(-1))]}`],
      ];
      return T.flatMap(([re, rep]) => find(re, s.text, (m) => ({ replace: rep(m[0]), message: `FDA writes “${rep(m[0])}”.` })));
    },
  },
];

/* ---------- Citations ---------- */

const CFR_PREFIX = String.raw`(?:21\s*C\.?F\.?R\.?\s*(?:§+\s*)?(?:Part\s+)?|§+\s*)`;

export function standardHits(text: string) {
  const re =
    /\b((?:BS\s+)?EN\s+)?((?:ANSI\/)?(?:AAMI\/)?(?:ISO\/IEC\/IEEE|ISO\/IEC|ISO\/TR|IEC\/TR|ISO|IEC))\s?(\d{4,5}(?:-\d{1,2}){0,3})(?::\s?(\d{4}))?((?:\s*[+/]\s*(?:A|Amd|AMD)\.?\s?\d+(?::\s?\d{4})?)*)/g;
  return [...text.matchAll(re)].map((m) => ({ m, en: !!m[1], num: m[3], year: m[4], amend: m[5] ?? '' }));
}

const citationRules: Rule[] = [
  {
    id: 'qmsr-section',
    name: 'Part 820 section that no longer exists',
    category: 'citations',
    severity: 'error',
    source: '21 CFR 820 as amended by the QMSR (effective 2 February 2026)',
    why: 'The QMSR replaced most of Part 820 with ISO 13485:2016. Part 820 now has sections 820.1, 820.3, 820.7, 820.10, 820.15, 820.35 and 820.45; citations to the old sections point at nothing. Model-written drafts often cite them.',
    message: 'Removed Part 820 section.',
    example: { bad: 'Design reviews are held per 21 CFR 820.30(e).', good: 'Design reviews are held per ISO 13485:2016 §7.3.5 (21 CFR 820.10).' },
    sentence: (s) => {
      if (LEGACY_RE.test(s.text)) return [];
      return find(new RegExp(String.raw`(?<![\d.])${CFR_PREFIX}?820\.(\d{1,3})(?!\d)((?:\([a-z0-9]{1,4}\))*)`, 'gi'), s.text, (m) => {
        const sec = m[1];
        if (QMSR_SECTIONS[sec]) return false;
        const old = QSR_REMOVED[sec];
        return {
          message: old
            ? `21 CFR 820.${sec} (${old.title}) was removed by the QMSR on 2 February 2026. Cite ${old.now}.`
            : `21 CFR 820.${sec} doesn’t exist. Part 820 has sections 820.1, 820.3, 820.7, 820.10, 820.15, 820.35 and 820.45.`,
        };
      });
    },
  },
  {
    id: 'part11-section',
    name: 'Part 11 section that doesn’t exist',
    category: 'citations',
    severity: 'error',
    source: '21 CFR Part 11',
    why: 'Part 11 has ten sections; §11.10 runs from (a) to (k). A citation outside them is a misquote, often invented by a text generator.',
    message: 'This Part 11 citation doesn’t exist.',
    sentence: (s) =>
      find(new RegExp(String.raw`${CFR_PREFIX}11\.(\d{1,3})(?!\d)((?:\([a-z0-9]{1,4}\))*)`, 'gi'), s.text, (m) => {
        const sec = m[1];
        const paras = PART11[sec];
        if (paras === undefined)
          return { message: `21 CFR 11.${sec} doesn’t exist. Part 11 has sections 11.1, 11.2, 11.3, 11.10, 11.30, 11.50, 11.70, 11.100, 11.200 and 11.300.` };
        const p = /^\(([a-z])\)/.exec(m[2] ?? '')?.[1];
        if (!p || paras === null) return false;
        if (!paras.length) return { message: `21 CFR 11.${sec} has no lettered paragraphs. Cite 21 CFR 11.${sec}.` };
        if (!paras.includes(p)) return { message: `21 CFR 11.${sec}(${p}) doesn’t exist: §11.${sec} runs from (${paras[0]}) to (${paras[paras.length - 1]}).` };
        return false;
      }),
  },
  {
    id: 'cfr-part',
    name: 'Unknown device regulation part',
    category: 'citations',
    severity: 'warning',
    source: '21 CFR Subchapter H (Parts 800–898)',
    why: 'Citations to parts that don’t exist are a common error in model-written text.',
    message: 'This isn’t a 21 CFR medical device part.',
    sentence: (s) =>
      find(/\b21\s*C\.?F\.?R\.?\s*(?:Parts?\s+|§+\s*)?(8\d\d)(?!\d)/gi, s.text, (m) => {
        const part = Number(m[1]);
        return DEVICE_PARTS.has(part) ? false : { message: `21 CFR Part ${part} isn’t a medical device part. Check the citation.` };
      }),
  },
  {
    id: 'cfr-format',
    name: 'CFR citation format',
    category: 'citations',
    severity: 'note',
    source: 'Office of the Federal Register citation style',
    why: 'Consistent citations are easier to check and search.',
    message: 'Write citations as “21 CFR 820.10” for a section and “21 CFR Part 11” for a part.',
    sentence: (s) => [
      ...find(/\b21CFR\s?\d+/gi, s.text, (m) => ({ replace: m[0].replace(/21CFR\s?/i, '21 CFR ') })),
      ...find(/\bCFR\s+21\b/g, s.text, () => ({ replace: '21 CFR' })),
      ...find(/\b21\s*CFR\s*Part\s*(\d+\.\d+)/gi, s.text, (m) => ({
        message: '“Part” goes with a whole part. For a section, write 21 CFR 11.10.',
        replace: `21 CFR ${m[1]}`,
      })),
    ],
  },
  {
    id: 'standard-edition',
    name: 'Standard edition',
    category: 'citations',
    severity: 'warning',
    source: `Biomedix standards catalog (checked ${CATALOG_DATE}); FDA Recognized Consensus Standards database`,
    why: 'Superseded or non-existent editions are common in model-written text, and a declaration of conformity has to name the edition you test to.',
    message: 'Check the edition.',
    example: { bad: 'Risk management follows ISO 14971:2007.', good: 'Risk management follows ISO 14971:2019.' },
    sentence: (s) =>
      standardHits(s.text).flatMap(({ m, en, num, year, amend }): Hit[] => {
        const std = STANDARDS[num];
        if (!std || !year) return [];
        const at = { start: m.index!, end: m.index! + m[0].length };
        const status = std.editions[year];
        const note = std.note ? ` ${std.note}` : '';
        if (status === 'superseded')
          return [{ ...at, message: `${std.name}:${year} has been replaced. The current edition is ${std.cite}.${note}`, replace: std.cite }];
        if (status === 'amendment' && !amend)
          return [{ ...at, message: `${year} is the year of an amendment to ${std.name}, not an edition. Cite ${std.cite}.`, replace: std.cite }];
        if (status === 'current' && std.cite.includes('+') && !amend && !en)
          return [{ ...at, severity: 'note', message: `Cite the amended edition: ${std.cite}.`, replace: std.cite }];
        if (!status && !en)
          return [
            {
              ...at,
              message: `There’s no ${std.name}:${year} in the Biomedix standards catalog (checked ${CATALOG_DATE}). Confirm the edition exists before citing it; the current one is ${std.cite}.`,
            },
          ];
        return [];
      }),
  },
  {
    id: 'standard-undated',
    name: 'Standard cited without an edition',
    category: 'citations',
    severity: 'note',
    source: 'FDA guidance “Appropriate Use of Voluntary Consensus Standards in Premarket Submissions”',
    why: 'Conformity is claimed to a specific edition. Give it at least once, usually in the references section.',
    message: 'Give the edition at least once in this document.',
    doc: (d, o) => {
      const dated = new Set<string>();
      const first = new Map<string, DocHit>();
      for (const u of d.units)
        for (const h of standardHits(u.text)) {
          if (!STANDARDS[h.num]) continue;
          if (h.year) dated.add(h.num);
          else if (!first.has(h.num)) first.set(h.num, { unit: u.i, start: h.m.index!, end: h.m.index! + h.m[0].length });
        }
      return [...first.entries()]
        .filter(([num]) => !dated.has(num) && !o.datedStandards?.has(num))
        .map(([num, h]) => ({ ...h, message: `${STANDARDS[num].name} has no edition anywhere in this document. Cite it once in full, e.g. ${STANDARDS[num].cite}.` }));
    },
  },
  {
    id: 'dangling-ref',
    name: 'Reference to a document that isn’t in the set',
    category: 'citations',
    severity: 'warning',
    source: 'ISO 13485:2016 §4.2.4 (documents referenced are identified and available)',
    why: 'A procedure that points at a document nobody wrote leaves its step undefined.',
    message: 'No document with this ID.',
    doc: (d, o) => {
      if (!o.knownIds) return [];
      const known = o.knownIds;
      const seen = new Set<string>();
      const out: DocHit[] = [];
      for (const u of d.units)
        for (const m of u.text.matchAll(/\b(?:SW-SOP|QM|SOP|WI|FRM|RMF|PLN|POL)-\d{2,4}\b|\bDHF-T\d\b/g)) {
          const id = m[0];
          if (known.has(id) || seen.has(id) || id === d.id) continue;
          seen.add(id);
          out.push({ unit: u.i, start: m.index!, end: m.index! + id.length, message: `There’s no ${id} in this document set. Add it, or point to the document that holds this.` });
        }
      return out;
    },
  },
];

/* ---------- Requirement wording ---------- */

const VAGUE = [
  'user-friendly', 'user friendly', 'easy', 'easily', 'easy to use', 'intuitive', 'intuitively', 'fast', 'quick', 'quickly', 'rapid', 'rapidly',
  'appropriate', 'appropriately', 'adequate', 'adequately', 'sufficient', 'sufficiently', 'reasonable', 'reasonably', 'robust', 'seamless',
  'seamlessly', 'minimal', 'minimally', 'optimal', 'optimally', 'efficient', 'efficiently', 'flexible', 'high quality', 'high-quality',
  'user-centric', 'some', 'several', 'many', 'few', 'various', 'numerous', 'significant', 'significantly', 'substantial', 'substantially',
  'approximately', 'almost', 'nearly', 'relatively', 'normally', 'typically', 'generally', 'usually', 'mostly', 'large', 'small', 'high',
  'low', 'maximize', 'minimize', 'state of the art',
];
const VAGUE_RE = words(VAGUE);

const ESCAPE = [
  'if possible', 'where possible', 'when possible', 'as far as possible', 'so far as is possible', 'if practical', 'where practical',
  'if practicable', 'where practicable', 'as appropriate', 'where appropriate', 'if appropriate', 'as applicable', 'where applicable',
  'if applicable', 'as necessary', 'where necessary', 'if necessary', 'when necessary', 'as needed', 'when needed', 'as required',
  'if required', 'to the extent possible', 'to the extent practical', 'to the extent practicable', 'to the extent necessary', 'when feasible',
  'where feasible', 'if feasible',
];

const UNITS = new Set(['mg', 'ml', 'dl', 'min', 'kg', 'km', 'hr', 'h', 'sec', 'day', 'week', 'month', 'year', 'dose', 'l', 'g', 'mmol', 'ug', 'mcg', 'beats', 'breaths', 'cm', 'mm', 'm', 's', 'kpa', 'mmhg', 'lb', 'in', 'ft', 'mol']);

const PARTICIPLE = /^(?:\w+(?:ed|en)|done|made|kept|held|sent|set|run|built|put|read|met|shown|known|given|taken|written|chosen|found|paid|left|bound|sold|told|brought|bought|taught|sought|led|spent|split|shut|cut|let|spread|drawn|thrown|hidden|begun|frozen|spoken|broken|driven|withheld|upheld|undertaken|overseen|seen)$/i;
const NOT_PARTICIPLE = /^(?:able|capable|open|even|often|seven|ten|eleven|token|screen|green|between|given)$/i;

const reqRules: Rule[] = [
  {
    id: 'should',
    name: '“Should” in a procedure or requirement',
    category: 'requirements',
    severity: 'warning',
    types: ['procedure', 'requirements', 'risk'],
    source: 'ISO/IEC Directives Part 2, Clause 7 (verbal forms); ISO/IEC/IEEE 29148:2018',
    why: '“Should” is a recommendation, so a step written with it is optional. An auditor can’t hold anyone to it.',
    message: '“Should” makes this optional. Use “shall” for a mandatory step, or “may” for a real option.',
    example: { bad: 'The Quality Lead should review complaints weekly.', good: 'The Quality Lead shall review complaints weekly.' },
    sentence: (s) => {
      if (/\b(?:guidance|recommend\w*|FDA (?:expects|suggests))\b/i.test(s.text)) return [];
      return find(/\bshould(?:n['’]t| not)?\b/gi, s.text, (m) => ({ replace: /not|n['’]t/i.test(m[0]) ? 'shall not' : keepCase(m[0], 'shall') }));
    },
  },
  {
    id: 'must',
    name: '“Must” mixed with “shall”',
    category: 'requirements',
    severity: 'note',
    types: ['procedure', 'requirements', 'risk', 'record', 'other'],
    source: 'ISO/IEC Directives Part 2, Clause 7; INCOSE GtWR R36 (consistent terms)',
    why: 'The document already uses “shall” for requirements. “Must” is for constraints from outside, such as the law, so mixing them makes readers ask whether they differ.',
    message: 'This document uses “shall” for requirements. Use “shall” here too, unless this states an external constraint such as a regulation.',
    sentence: (s) => {
      if (!facts(s.doc).shall) return [];
      if (/\b(?:CFR|FDA|regulations?|law|statute|FD&C|QMSR|ISO \d+|IEC \d+|524B)\b/.test(s.text)) return [];
      return find(/\bmust(?: not)?\b/gi, s.text, (m) => ({ replace: /not/i.test(m[0]) ? 'shall not' : keepCase(m[0], 'shall') }));
    },
  },
  {
    id: 'will',
    name: '“Will” in a requirement',
    category: 'requirements',
    severity: 'note',
    types: ['requirements'],
    source: 'ISO/IEC/IEEE 29148:2018 (requirement construct)',
    why: '“Will” states a fact or an intention, not a binding requirement.',
    message: 'If this is a requirement, write “shall”. “Will” states a fact or intent.',
    sentence: (s) =>
      find(/\b(?:system|device|software|application|app|product|unit|module|server|platform|component|firmware|algorithm|patch|sensor|interface|portal)\s+will(?: not)?\b/gi, s.text, (m) => ({
        replace: m[0].replace(/will/i, 'shall'),
      })),
  },
  {
    id: 'may-not',
    name: '“May not”',
    category: 'requirements',
    severity: 'warning',
    source: 'ISO/IEC Directives Part 2, Clause 7 (verbal forms)',
    why: '“May not” reads both as a prohibition and as a possibility.',
    message: '“May not” is ambiguous. Write “shall not” to prohibit, or “might not” for a possibility.',
    sentence: (s) => find(/\bmay not\b/gi, s.text, () => ({ replace: 'shall not' })),
  },
  {
    id: 'multiple-shall',
    name: 'More than one requirement in a sentence',
    category: 'requirements',
    severity: 'warning',
    reqOnly: true,
    source: 'INCOSE GtWR R18 (single thought sentence); ISO/IEC/IEEE 29148:2018 (singular)',
    why: 'Two “shalls” in one statement can’t be traced or verified separately; one test can pass half of it.',
    message: 'Two or more “shall”s in one sentence. Split it into one requirement each.',
    sentence: (s) => {
      const all = find(/\bshall\b/gi, s.text);
      return all.length > 1 ? [all[1]] : [];
    },
  },
  {
    id: 'escape-clause',
    name: 'Escape clause',
    category: 'requirements',
    severity: 'warning',
    source: 'INCOSE GtWR R8 (escape clauses); ISO/IEC/IEEE 29148:2018 (loopholes)',
    why: 'Phrases like “where possible” let anyone decide the step doesn’t apply, so it can’t be audited.',
    message: 'Escape clause: who decides when it applies? State the condition, or remove it.',
    example: { bad: 'Records shall be reviewed where appropriate.', good: 'Records shall be reviewed before each design review.' },
    sentence: (s) =>
      find(words(ESCAPE), s.text, (m) => {
        if (/as far as possible/i.test(m[0]) && (s.doc.type === 'risk' || /\brisks?\b/i.test(s.text))) return false;
        return { severity: (s.req ? 'warning' : 'note') as Severity };
      }),
  },
  {
    id: 'open-ended',
    name: 'Open-ended list',
    category: 'requirements',
    severity: 'warning',
    source: 'INCOSE GtWR R9 (open-ended clauses)',
    why: '“Etc.” and “including but not limited to” leave the reader to guess what else is covered.',
    message: 'Open-ended. List every item, or point to where the full list is kept.',
    sentence: (s) =>
      find(/\betc\.?(?=\W|$)|\bet cetera\b|\band so (?:on|forth)\b|\b(?:including )?but not limited to\b|\bamong others\b|\band the like\b|\bor similar\b/gi, s.text, () => ({
        severity: (s.req ? 'warning' : 'note') as Severity,
      })),
  },
  {
    id: 'vague-term',
    name: 'Vague or unmeasurable term',
    category: 'requirements',
    severity: 'warning',
    reqOnly: true,
    source: 'INCOSE GtWR R7 (vague terms) and R34 (measurable performance); ISO/IEC/IEEE 29148:2018 (unambiguous, verifiable)',
    why: 'A tester can’t measure “quickly” or “adequate”, so the requirement can’t be verified.',
    message: 'Vague. Give a value, unit and condition a tester can check.',
    example: { bad: 'The app shall alert the clinician quickly.', good: 'The app shall alert the clinician within 60 s of detection.' },
    sentence: (s) => {
      if (MEASURE_RE.test(s.text)) return [];
      return find(VAGUE_RE, s.text, (m) => {
        const before = s.text.slice(Math.max(0, m.index! - 7), m.index!);
        if (/\b(?:as|where|if|when)\s$/i.test(before)) return false; // escape clause rule covers it
        if (/^(?:high|low)$/i.test(m[0]) && /^\s*(?:risk|severity|probability|level|priority)/i.test(s.text.slice(m.index! + m[0].length))) return false;
        if (/state of the art/i.test(m[0]) && /acknowledged\s*$/i.test(s.text.slice(0, m.index!))) return false;
        return { message: `“${m[0]}” can’t be measured. Give a value, unit and condition a tester can check.` };
      });
    },
  },
  {
    id: 'vague-time',
    name: 'Undefined time frame',
    category: 'requirements',
    severity: 'warning',
    source: 'INCOSE GtWR R35 (temporal dependencies); ISO 13485:2016 §4.2.1',
    why: '“Timely” or “periodically” can’t be audited; inspectors expect procedures to say how often and how soon.',
    message: 'Undefined time frame. Say how soon or how often, e.g. “within 5 working days” or “monthly”.',
    example: { bad: 'CAPAs shall be closed in a timely manner.', good: 'CAPAs shall be closed within 90 calendar days, or extended with approval.' },
    sentence: (s) => {
      if (FREQUENCY_RE.test(s.text)) return [];
      return find(
        /\b(?:timely|in a timely (?:manner|fashion)|promptly|as soon as (?:possible|practicable)|ASAP|periodically|periodic(?! (?:table|safety update))|regularly|at regular intervals|routinely|from time to time|frequently|occasionally|on an ongoing basis|in due course|without (?:undue )?delay)\b/gi,
        s.text,
        () => ({ severity: (s.doc.type === 'procedure' || s.doc.type === 'requirements' || s.req ? 'warning' : 'note') as Severity }),
      );
    },
  },
  {
    id: 'infinitive',
    name: 'Superfluous infinitive',
    category: 'requirements',
    severity: 'note',
    reqOnly: true,
    source: 'INCOSE GtWR R10 (superfluous infinitives)',
    why: '“Shall be able to display” only requires the ability, not the display. Say what it does.',
    message: 'Superfluous infinitive. Say what it does: “shall display”, not “shall be able to display”.',
    sentence: (s) => find(/\bshall\s+(?:be (?:able|capable|designed) to|have the (?:ability|capability|capacity) to|be capable of)\b/gi, s.text, () => ({ replace: 'shall' })),
  },
  {
    id: 'passive',
    name: 'Passive requirement with no actor',
    category: 'requirements',
    severity: 'note',
    reqOnly: true,
    source: 'INCOSE GtWR R2 (active voice); ISO 13485:2016 §5.5.1 (responsibility and authority)',
    why: '“Shall be reviewed” doesn’t say who reviews. In a procedure that is the gap an auditor asks about.',
    message: 'Passive: who does this? Name the role or system, e.g. “The Quality Lead shall review…”.',
    sentence: (s) => {
      for (const m of s.text.matchAll(/\bshall\s+(?:not\s+)?be\s+([A-Za-z]+)\b/gi)) {
        const w = m[1];
        if (!PARTICIPLE.test(w) || NOT_PARTICIPLE.test(w)) continue;
        if (/\bby\b/i.test(s.text.slice(m.index! + m[0].length))) continue;
        return [{ start: m.index!, end: m.index! + m[0].length }];
      }
      return [];
    },
  },
  {
    id: 'pronoun',
    name: 'Pronoun as the subject',
    category: 'requirements',
    severity: 'warning',
    reqOnly: true,
    source: 'INCOSE GtWR R24 (pronouns)',
    why: 'A requirement is read on its own, out of order. “It” only makes sense next to the previous sentence.',
    message: 'Name the subject instead of using a pronoun.',
    sentence: (s) =>
      find(/^(?:it|this|that|they|these|those|its|their|he|she)\b(?=[^.]*\bshall\b)|\b(?:it|they|this|these|those)\s+shall\b/gi, s.text, (m) => ({
        end: m.index! + m[0].split(/\s+/)[0].length,
        message: `Name the subject instead of “${m[0].split(/\s+/)[0]}”.`,
      })).slice(0, 1),
  },
  {
    id: 'no-subject',
    name: 'Requirement with no subject',
    category: 'requirements',
    severity: 'warning',
    source: 'INCOSE GtWR R3 (appropriate subject-verb)',
    why: 'Every requirement names the entity responsible for it.',
    message: 'Add the subject: who or what shall do this?',
    sentence: (s) => find(/^shall\b/i, s.text),
  },
  {
    id: 'ears',
    name: 'Trigger not in EARS form',
    category: 'requirements',
    severity: 'note',
    reqOnly: true,
    types: ['requirements', 'risk'],
    source: 'EARS: Easy Approach to Requirements Syntax (Mavin et al., IEEE RE 2009)',
    why: 'EARS patterns put triggers and states in a fixed order, which makes conditions easy to find and test.',
    message: 'Use an EARS pattern: “When <trigger>, the <system> shall <response>”.',
    example: { bad: 'Upon loss of signal the app shall alert the patient.', good: 'When the signal is lost for 30 s, the app shall alert the patient.' },
    sentence: (s) => {
      const lead = /^(upon|on|in case of|in the event (?:of|that)|after|once|as soon as|during|whenever|in the absence of)\b/i.exec(s.text);
      if (lead) {
        const during = /^during$/i.test(lead[1]);
        return [
          {
            start: 0,
            end: lead[0].length,
            message: during
              ? 'Use the EARS state-driven pattern: “While <state>, the <system> shall <response>”.'
              : 'Use the EARS event-driven pattern: “When <trigger>, the <system> shall <response>”.',
          },
        ];
      }
      const iff = /^if\b/i.exec(s.text);
      const shallAt = s.text.search(/\bshall\b/i);
      if (iff && shallAt > 0 && !/\bthen\b/i.test(s.text.slice(0, shallAt)))
        return [{ start: 0, end: 2, message: 'Unwanted behaviour in EARS: “If <trigger>, then the <system> shall <response>”.' }];
      return [];
    },
  },
  {
    id: 'absolute',
    name: 'Unachievable absolute',
    category: 'requirements',
    severity: 'note',
    reqOnly: true,
    source: 'INCOSE GtWR R26 (absolutes)',
    why: '“Always”, “never” and “100%” can’t be verified by any finite test.',
    message: 'Absolute. State an achievable target with a tolerance.',
    sentence: (s) => find(/\b(?:always|never|at all times|under all (?:conditions|circumstances)|in all cases|without exception|any and all)\b|\b100\s?%|\bzero (?:defects|errors|failures|downtime)\b/gi, s.text),
  },
  {
    id: 'universal',
    name: '“All”, “any” or “both”',
    category: 'requirements',
    severity: 'note',
    reqOnly: true,
    types: ['requirements'],
    source: 'INCOSE GtWR R32 (universal qualification)',
    why: '“Each” makes clear the requirement applies to every item individually.',
    message: 'Use “each” instead of “all”, “any” or “both”.',
    sentence: (s) => find(/\b(?:all|any|both)\b(?! (?:and all|times|cases|conditions))/gi, s.text, () => ({ replace: 'each' })).slice(0, 1),
  },
  {
    id: 'oblique',
    name: 'Slash between words',
    category: 'requirements',
    severity: 'warning',
    source: 'INCOSE GtWR R17 (oblique symbol)',
    why: '“And/or” and “A/B” leave it unclear whether one, the other or both are meant.',
    message: 'The slash is ambiguous. Write “A or B, or both”, or “A and B”.',
    sentence: (s) => [
      ...find(/\band\/or\b/gi, s.text),
      ...find(/(?<![\w/:.])([a-z]{2,})\/([a-z]{2,})(?![\w/])/g, s.text, (m) => {
        if (UNITS.has(m[1].toLowerCase()) || UNITS.has(m[2].toLowerCase())) return false;
        if (/^and$|^or$/.test(m[1]) && /^or$/.test(m[2])) return false;
        if (/https?:|www\./.test(s.text.slice(Math.max(0, m.index! - 40), m.index!))) return false;
        return { severity: 'note' as Severity };
      }),
    ],
  },
  {
    id: 'purpose-phrase',
    name: 'Rationale inside the requirement',
    category: 'requirements',
    severity: 'note',
    reqOnly: true,
    types: ['requirements', 'risk'],
    source: 'INCOSE GtWR R20 (purpose phrases)',
    why: 'The reason for a requirement belongs in its rationale, not in what gets verified.',
    message: 'Move the “so that…” reason to a rationale field.',
    sentence: (s) => find(/\b(?:so that|so as to|for the purpose of)\b/gi, s.text),
  },
  {
    id: 'duplicate-id',
    name: 'Duplicate ID',
    category: 'requirements',
    severity: 'error',
    source: 'INCOSE GtWR R30; ISO 13485:2016 §7.3.2 and IEC 62304 §5.1.1 (traceability)',
    why: 'Two items with one ID break traceability: a test or risk control can’t say which it covers.',
    message: 'Duplicate ID.',
    doc: (d) => {
      const ID = /^[A-Z][A-Z0-9]{0,9}(?:[-_][A-Z0-9]{1,8})*[-_]\d{1,5}(?:\.\d{1,3})*\b/;
      const seen = new Map<string, Unit>();
      const out: DocHit[] = [];
      for (const u of d.units) {
        const idCell = u.kind === 'cell' && !u.head && (u.c === 0 || /^(?:id|ref|#|no\.?|req(?:uirement)? id|hazard id|control id)$/i.test(u.col ?? ''));
        const idItem = u.kind === 'li' && /^[A-Z][A-Z0-9-]*\d[\w.]*\s*[:–—-]\s/.test(u.text);
        if (!idCell && !idItem) continue;
        const m = ID.exec(u.text);
        if (!m || (idCell && m[0].length !== u.text.trim().length)) continue;
        const prev = seen.get(m[0]);
        if (prev && !(prev.table !== undefined && prev.table !== u.table && idCell))
          out.push({ unit: u.i, start: 0, end: m[0].length, message: `${m[0]} is used twice${prev.section ? ` (also in “${prev.section}”)` : ''}. Give each item its own ID.` });
        else if (!prev) seen.set(m[0], u);
      }
      return out;
    },
  },
];

/* ---------- Plain language ---------- */

const PLAIN: [string, string][] = [
  ['utilize', 'use'], ['utilizes', 'uses'], ['utilized', 'used'], ['utilizing', 'using'], ['utilization', 'use'], ['prior to', 'before'],
  ['subsequent to', 'after'], ['in order to', 'to'], ['commence', 'begin'], ['commences', 'begins'], ['commenced', 'began'],
  ['facilitate', 'help'], ['in the event that', 'if'], ['at this point in time', 'now'], ['at the present time', 'now'],
  ['with regard to', 'about'], ['in regard to', 'about'], ['with respect to', 'for'], ['in close proximity to', 'near'],
  ['due to the fact that', 'because'], ['in light of the fact that', 'because'], ['for the purpose of', 'to'], ['endeavor', 'try'],
  ['ascertain', 'find out'], ['the majority of', 'most'], ['a sufficient number of', 'enough'], ['in the near future', 'soon'],
];
const PLAIN_MAP = new Map(PLAIN.map(([a, b]) => [a, b]));

const clarityRules: Rule[] = [
  {
    id: 'long-sentence',
    name: 'Long sentence',
    category: 'clarity',
    severity: 'note',
    source: 'Federal Plain Language Guidelines (plainlanguage.gov)',
    why: 'Long sentences hide conditions and hold more than one requirement. Aim for about 20 words.',
    message: 'Long sentence. Split it.',
    sentence: (s) => (s.unit.kind !== 'cell' && s.words > 40 ? [{ start: 0, end: s.text.length, message: `${s.words} words. Aim for about 20; split it.` }] : []),
  },
  {
    id: 'plain-language',
    name: 'Wordy phrase',
    category: 'clarity',
    severity: 'note',
    source: 'Federal Plain Language Guidelines; Plain Writing Act of 2010',
    why: 'Plain words are read faster and translated more reliably.',
    message: 'Wordy.',
    sentence: (s) =>
      find(words(PLAIN.map(([a]) => a)), s.text, (m) => {
        if (/for the purpose of/i.test(m[0]) && s.req) return false; // purpose-phrase covers it
        const rep = PLAIN_MAP.get(m[0].toLowerCase().replace(/\s+/g, ' ')) ?? '';
        return { replace: keepCase(m[0], rep), message: `Write “${rep}”.` };
      }),
  },
  {
    id: 'filler',
    name: 'Filler phrase',
    category: 'clarity',
    severity: 'note',
    source: 'Federal Plain Language Guidelines; Biomedix review practice for model-drafted text',
    why: 'Phrases like these add words, not information, and are common in machine-generated drafts.',
    message: 'Filler. Cut it.',
    sentence: (s) =>
      find(
        /\bdelv(?:e|es|ing) (?:into|deeper)\b|\bit is (?:important|crucial|essential|worth|vital|key) (?:to note|noting|mentioning|highlighting|to remember)(?: that)?\b|\bit should be noted(?: that)?\b|\bplease note(?: that)?\b|\bneedless to say\b|\bin today['’]s (?:fast-paced|rapidly evolving|ever-changing|digital|complex)\b|\bplays? an? (?:crucial|pivotal|vital|key|critical) role\b|\bever-(?:evolving|changing)\b|\ba testament to\b|\bnavigat(?:e|ing) the complexit(?:y|ies)\b|\bin the realm of\b|\btapestry\b|\bembark on\b|\bunlock the (?:power|potential)\b|\bharness(?:ing)? the power\b|^(?:in conclusion|in summary|to summarize|overall|ultimately),/gi,
        s.text,
      ),
  },
  {
    id: 'first-person',
    name: '“We” instead of a role',
    category: 'clarity',
    severity: 'note',
    types: ['procedure', 'requirements', 'risk', 'record'],
    source: 'ISO 13485:2016 §5.5.1 (responsibility and authority)',
    why: '“We” doesn’t say who is responsible. Procedures name roles.',
    message: 'Name the role responsible instead of “we”.',
    sentence: (s) => [...find(/\b(?:we|our|ours|ourselves)\b/gi, s.text), ...find(/\bus\b/g, s.text)].slice(0, 1),
  },
  {
    id: 'contraction',
    name: 'Contraction',
    category: 'clarity',
    severity: 'note',
    types: ['procedure', 'requirements', 'risk', 'record', 'submission'],
    source: 'Biomedix technical writing style',
    why: 'Controlled documents and submissions use full forms; “don’t” is harder to scan than “do not” in a requirement.',
    message: 'Write the full form.',
    sentence: (s) =>
      find(/\b(?:do|does|did|is|are|was|were|has|have|had|could|should|would|ca|wo|need)n['’]t\b|\b(?:it|that|there|what)['’]s\b(?! (?:own|been))|\b(?:we|they|you)['’](?:re|ll|ve|d)\b|\blet['’]s\b/gi, s.text, (m) => {
        const full: Record<string, string> = { "can't": 'cannot', "won't": 'will not', "let's": 'let us' };
        const k = m[0].toLowerCase().replace(/’/g, "'");
        const rep =
          full[k] ??
          k
            .replace(/n't$/, ' not')
            .replace(/'s$/, ' is')
            .replace(/'re$/, ' are')
            .replace(/'ll$/, ' will')
            .replace(/'ve$/, ' have')
            .replace(/'d$/, ' would');
        return { replace: keepCase(m[0], rep), message: `Write “${keepCase(m[0], rep)}”.` };
      }),
  },
];

/* ---------- Consistency ---------- */

const DEF_SECTION = /\b(?:definitions?|terms|abbreviations|acronyms|glossary)\b/i;
const ACRONYM_RE = /(?<![\w-])([A-Z][A-Z0-9&]{1,7})(s?)(?![\w-])/g;

/** Acronyms a document defines, with their expansion and where. */
export function definitions(d: CheckDoc): Map<string, { long: string; unit: number }> {
  const out = new Map<string, { long: string; unit: number }>();
  const put = (acr: string, long: string, unit: number) => {
    if (!out.has(acr)) out.set(acr, { long: long.trim().toLowerCase(), unit });
  };
  for (const u of d.units) {
    // "Full Name (ABC)"
    for (const m of u.text.matchAll(/((?:[\w-]+\s+){0,8}?[\w-]+)\s*\(([A-Z][A-Za-z0-9&/-]{1,9}?)s?\)/g)) {
      const acr = m[2];
      if (!/[A-Z].*[A-Z]/.test(acr)) continue;
      const initials = acr.replace(/[^A-Z]/g, '');
      const ws = m[1].split(/\s+/);
      const take = ws.slice(-Math.min(ws.length, initials.length + 3));
      const head = take.map((w) => w[0]?.toUpperCase()).join('');
      if (head.includes(initials[0])) put(acr, take.slice(take.findIndex((w) => w[0]?.toUpperCase() === initials[0])).join(' '), u.i);
    }
    // "ABC (Full Name)"
    for (const m of u.text.matchAll(/(?<![\w-])([A-Z][A-Z0-9&]{1,7})\s*\(([a-zA-Z][^()]{3,80})\)/g)) put(m[1], m[2], u.i);
    // Definitions lists and tables: "ABC: …", "ABC – …", or a first-column cell.
    if (DEF_SECTION.test(u.section)) {
      const lead = /^([A-Z][A-Z0-9&]{1,7})s?\s*(?:[:–—=-]|means|stands for)\s*(.+)$/.exec(u.text);
      if (lead && (u.kind === 'li' || u.kind === 'p')) put(lead[1], lead[2], u.i);
      if (u.kind === 'cell' && !u.head && u.c === 0 && /^[A-Z][A-Z0-9&]{1,7}s?$/.test(u.text.trim())) {
        const next = d.units[u.i + 1];
        put(u.text.trim().replace(/s$/, ''), next?.kind === 'cell' && next.row === u.row ? next.text : '', u.i);
      }
    }
  }
  return out;
}

const consistencyRules: Rule[] = [
  {
    id: 'acronym',
    name: 'Undefined acronym',
    category: 'consistency',
    severity: 'warning',
    source: 'INCOSE GtWR R37 (acronyms); ISO/IEC/IEEE 29148:2018',
    why: 'Readers outside the team, including FDA reviewers and auditors, need each acronym spelled out once.',
    message: 'Define this acronym.',
    doc: (d, o) => {
      const defs = definitions(d);
      const out: DocHit[] = [];
      const seen = new Set<string>();
      for (const u of d.units) {
        if (u.kind === 'title' || u.kind === 'heading' || u.head) continue;
        const letters = u.text.replace(/[^A-Za-z]/g, '');
        if (letters.length > 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) continue; // a line in capitals
        for (const m of u.text.matchAll(ACRONYM_RE)) {
          const acr = m[1];
          if (seen.has(acr) || !/[A-Z].*[A-Z]/.test(acr) || /^[IVXLCDM]+$/.test(acr)) continue;
          if (KNOWN_ACRONYMS.has(acr) || CAPS_WORDS.has(acr) || o.glossary?.has(acr)) continue;
          const after = u.text.slice(m.index! + m[0].length);
          const before = u.text.slice(Math.max(0, m.index! - 16), m.index!);
          if (/^-\d/.test(after)) continue; // part of a document ID
          if (/product codes?\s*(?:[A-Z]{3},?\s*(?:and\s+)?)*$/i.test(before)) continue; // FDA product codes aren't acronyms
          if (acr.length === 2 && /^\s+\d{5}\b/.test(after)) continue; // a US state in an address
          seen.add(acr);
          const def = defs.get(acr);
          if (def && def.unit <= u.i) continue;
          out.push({
            unit: u.i,
            start: m.index!,
            end: m.index! + acr.length,
            severity: def ? 'note' : 'warning',
            message: def ? `${acr} is defined later in the document. Define it at first use.` : `Define ${acr} at first use, e.g. “Full Term (${acr})”, or add it to the definitions.`,
          });
        }
      }
      return out;
    },
  },
  {
    id: 'acronym-conflict',
    name: 'Acronym with two meanings',
    category: 'consistency',
    severity: 'warning',
    source: 'INCOSE GtWR R36 (consistent terms) and R37 (acronyms)',
    why: 'One acronym standing for two things makes the reader guess.',
    message: 'This acronym is defined two ways.',
    doc: (d) => {
      const first = new Map<string, string>();
      const out: DocHit[] = [];
      for (const u of d.units)
        for (const m of u.text.matchAll(/((?:[\w-]+\s+){0,8}?[\w-]+)\s*\(([A-Z][A-Z0-9&]{1,7})\)/g)) {
          const acr = m[2];
          const initials = acr.replace(/[^A-Z]/g, '');
          const ws = m[1].split(/\s+/).slice(-initials.length);
          if (ws.map((w) => w[0]?.toUpperCase()).join('') !== initials) continue;
          const long = ws.join(' ').toLowerCase();
          const prev = first.get(acr);
          if (prev === undefined) first.set(acr, long);
          else if (prev !== long) out.push({ unit: u.i, start: m.index!, end: m.index! + m[0].length, message: `${acr} is defined as “${prev}” earlier and “${long}” here. Use one meaning.` });
        }
      return out;
    },
  },
  {
    id: 'spelling-variant',
    name: 'Same word spelled two ways',
    category: 'consistency',
    severity: 'note',
    source: 'INCOSE GtWR R36 (consistent terms and units)',
    why: 'Two spellings of one term suggest two meanings and break search.',
    message: 'Spelled two ways in this document.',
    doc: (d) => {
      const joined = new Map<string, { unit: number; start: number; word: string }>();
      for (const u of d.units)
        for (const m of u.text.matchAll(/\b[A-Za-z]{2,}\b/g)) {
          const k = m[0].toLowerCase();
          if (!joined.has(k)) joined.set(k, { unit: u.i, start: m.index!, word: m[0] });
        }
      const out: DocHit[] = [];
      const done = new Set<string>();
      for (const u of d.units)
        for (const m of u.text.matchAll(/\b([A-Za-z]{2,})-([A-Za-z]{2,})\b/g)) {
          const k = (m[1] + m[2]).toLowerCase();
          if (done.has(k) || !joined.has(k)) continue;
          done.add(k);
          out.push({ unit: u.i, start: m.index!, end: m.index! + m[0].length, message: `Written both “${m[0]}” and “${joined.get(k)!.word}”. Pick one.` });
        }
      return out;
    },
  },
  {
    id: 'number-format',
    name: 'Number, unit or date format',
    category: 'consistency',
    severity: 'note',
    source: 'NIST SP 811 §7.2 (space before the unit); ISMP error-prone dose designations; INCOSE GtWR R6 and R40; ISO 8601',
    why: 'A missing leading zero or a misread date causes real errors; consistent number formats are part of a style guide.',
    message: 'Number format.',
    sentence: (s) => [
      ...find(/\b\d+(?:\.\d+)?(ms|mg|kg|mL|ml|mm|cm|km|kPa|Hz|kHz|MHz|GHz|mA|mV|kV|mW|kW|dB|bpm|mmHg|µm|µg|mcg|nm|GB|MB|kB|TB|min|sec|hrs?)\b/g, s.text, (m) => ({
        message: `Put a space between the number and the unit: “${m[0].replace(/(\d)([a-zµ])/i, '$1 $2')}”.`,
        replace: m[0].replace(/(\d)([a-zµ])/i, '$1 $2'),
      })),
      ...find(/(?<![\w.,])\.\d+\b/g, s.text, (m) => ({
        severity: (s.doc.type === 'labeling' ? 'warning' : 'note') as Severity,
        message: `Write a leading zero: “0${m[0]}”. A missed decimal point causes tenfold errors.`,
        replace: `0${m[0]}`,
      })),
      ...(s.doc.type === 'labeling'
        ? find(/\b\d+\.0+\s?(?:mg|mcg|µg|g|mL|ml|units?|IU|mmol|mEq)\b/g, s.text, (m) => ({
            severity: 'warning' as Severity,
            message: 'Drop the trailing zero in a dose: “5 mg”, not “5.0 mg”, which can be misread as 50 mg.',
            replace: m[0].replace(/\.0+/, ''),
          }))
        : []),
      ...find(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, s.text, () => ({ message: 'Ambiguous date: 03/04/2026 reads as March or April. Write 2026-04-03 (ISO 8601) or 3 April 2026.' })),
    ],
  },
];

/* ---------- Structure ---------- */

const structureRules: Rule[] = [
  {
    id: 'doc-control',
    name: 'Document control details missing',
    category: 'structure',
    severity: 'warning',
    types: ['procedure', 'requirements', 'risk', 'record'],
    source: 'ISO 13485:2016 §4.2.4 (identification, revision status, approval)',
    why: 'A controlled document shows what it is, which revision it is and who approved it.',
    message: 'Document control details missing.',
    doc: (d) => {
      const all = d.units.map((u) => `${u.col ?? ''} ${u.text}`).join('\n');
      const missing: string[] = [];
      if (!/\b(?:rev(?:ision)?\.?|version|issue)\b\s*(?:no\.?|number)?\s*[:#]?\s*[A-Z0-9]/i.test(all)) missing.push('a revision');
      if (!/\b(?:approved by|approver|approval|signatures?|signed by)\b/i.test(all)) missing.push('who approves it');
      if (!d.id && !/\b[A-Z]{2,6}(?:-[A-Z]{1,4})?-\d{2,4}\b/.test(all)) missing.push('a document ID');
      if (!missing.length) return [];
      const at = d.units.find((u) => u.kind === 'title') ?? d.units[0];
      return at ? [{ unit: at.i, start: 0, end: Math.min(at.text.length, 80), message: `Doesn’t show ${missing.join(', ')}.` }] : [];
    },
  },
  {
    id: 'sop-sections',
    name: 'Standard procedure sections',
    category: 'structure',
    severity: 'note',
    types: ['procedure'],
    source: 'ISO 13485:2016 §4.2.1 and §4.2.4; Biomedix SOP template',
    why: 'Readers and auditors look for the purpose, scope, responsibilities and references in the same place in every procedure.',
    message: 'Missing standard sections.',
    doc: (d) => {
      const heads = d.units
        .filter((u) => u.kind === 'heading' || u.kind === 'field' || (u.kind === 'cell' && u.c === 0 && u.table === 0))
        .map((u) => `${u.col ?? ''} ${u.text}`)
        .join('\n')
        .toLowerCase();
      const want: [string, RegExp][] = [
        ['Purpose', /purpose|objective|intent/],
        ['Scope', /scope|applies|application|applicability/],
        ['Responsibilities', /responsib|roles?|authorit|owner/],
        ['References', /references?|basis|related documents|standards/],
        ['Records', /records?|forms?/],
      ];
      const missing = want.filter(([, re]) => !re.test(heads)).map(([n]) => n);
      if (!missing.length) return [];
      const at = d.units.find((u) => u.kind === 'title') ?? d.units[0];
      return at ? [{ unit: at.i, start: 0, end: Math.min(at.text.length, 80), message: `No section for: ${missing.join(', ')}.` }] : [];
    },
  },
];

export const RULES: Rule[] = [...releaseRules, ...fdaRules, ...citationRules, ...reqRules, ...clarityRules, ...consistencyRules, ...structureRules];
export const RULE_BY_ID = new Map(RULES.map((r) => [r.id, r]));

export type { CheckOptions };
