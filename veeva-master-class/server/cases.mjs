import { CASE_VERSION } from './config.mjs';

export const STAGES = ['clarify', 'structure', 'exhibit', 'math', 'pressure', 'synthesis'];

const STAGE_META = {
  clarify: {
    task: 'Ask only the decision-relevant clarifying questions that could change the approach.',
    weights: { recommendation_evidence_consistency: 10, prompt_comprehension: 35, numeric_interpretation: 0, partner_level_concision: 25, immediate_followup_responsiveness: 30 },
    softWords: [8, 40]
  },
  structure: {
    task: 'Lay out a prioritized, decision-oriented structure for solving the case.',
    weights: { recommendation_evidence_consistency: 15, prompt_comprehension: 35, numeric_interpretation: 5, partner_level_concision: 25, immediate_followup_responsiveness: 20 },
    softWords: [60, 140]
  },
  exhibit: {
    task: 'State the decisive exhibit insight, explain the implication, and name the next analysis.',
    weights: { recommendation_evidence_consistency: 25, prompt_comprehension: 20, numeric_interpretation: 30, partner_level_concision: 10, immediate_followup_responsiveness: 15 },
    softWords: [50, 120]
  },
  math: {
    task: 'Walk through the equation, unit, result, and decision implication.',
    weights: { recommendation_evidence_consistency: 20, prompt_comprehension: 15, numeric_interpretation: 45, partner_level_concision: 5, immediate_followup_responsiveness: 15 },
    softWords: [30, 100]
  },
  pressure: {
    task: 'Answer the interviewer challenge directly, defend or update the recommendation, and state what evidence would change it.',
    weights: { recommendation_evidence_consistency: 25, prompt_comprehension: 15, numeric_interpretation: 10, partner_level_concision: 15, immediate_followup_responsiveness: 35 },
    softWords: [50, 120]
  },
  synthesis: {
    task: 'Give an answer-first recommendation with two or three reasons, the key number, one risk, and the next gate.',
    weights: { recommendation_evidence_consistency: 35, prompt_comprehension: 15, numeric_interpretation: 20, partner_level_concision: 20, immediate_followup_responsiveness: 10 },
    softWords: [140, 220]
  }
};

const CASES = [
  {
    id: 'safety_ai_operating_model',
    title: 'Safety AI operating model',
    decision: 'Fund, stage, or stop a 12-month safety transformation.',
    brief: 'A mid-size oncology sponsor has a 3,600-case safety backlog. Monthly intake is 1,250 cases and sustainable closure capacity is 980. Leadership wants to fund a vendor team plus AI-assisted intake before two Phase 3 readouts.',
    pressure: 'The COO says: If capacity finally exceeds intake, why not approve the full rollout today?',
    facts: [
      ['fact_backlog', 'Current safety backlog is 3,600 cases.'],
      ['fact_intake', 'Monthly intake is 1,250 cases.'],
      ['fact_baseline_capacity', 'Sustainable baseline closure capacity is 980 cases per month.'],
      ['fact_reopen', 'Site B reports high gross output, but 18% of cases reopen.'],
      ['fact_vendor', 'Vendor capacity adds 180 closures per month and can start in six weeks.'],
      ['fact_ai', 'Automation uplift is a 16% scenario on the original 980-case baseline, not a validated forecast.'],
      ['fact_validation', 'AI validation takes 12 weeks and requires human review and audit-trail controls.'],
      ['fact_buffer', 'The scenario produces about 1,317 closures per month, only 67 above intake.'],
      ['fact_twelve_month_target', 'Clearing 3,600 backlog cases in 12 months requires about 1,550 closures per month, roughly 233 more than the proposed scenario.'],
      ['fact_exhibit_site_a', 'Base exhibit: Site A intake is 310 and closures are 285 cases per month.'],
      ['fact_exhibit_site_b', 'Base exhibit: Site B intake is 420 and quality-adjusted closures are 344 cases per month.'],
      ['fact_exhibit_site_c', 'Base exhibit: Site C intake is 290 and closures are 276 cases per month.']
    ],
    math: { question: 'At the resulting net burn rate, about how many months are needed to clear the 3,600-case backlog?', expected: 54, tolerance: 2, unit: 'months', integer: false, equation: '(3600) / ((980 + 980×0.16 + 180) - 1250)', fact_ids: ['fact_backlog','fact_intake','fact_baseline_capacity','fact_vendor','fact_ai'] },
    conflicts: [
      ['rule_full_rollout', 'Approving a full rollout solely because scenario capacity exceeds intake conflicts with the unvalidated uplift, fragile 67-case buffer, and failure to meet the 12-month clearance target.'],
      ['rule_remove_review', 'Replacing human review before validation conflicts with the required quality and audit controls.']
    ]
  },
  {
    id: 'oncology_launch_access',
    title: 'Oncology launch under access friction',
    decision: 'Choose the launch wedge and investment sequence.',
    brief: 'A specialty oncology therapy launches in nine months. Leadership uses 120,000 diagnosed patients as the headline, but payer interviews show step edits and prior authorization. Build a realistic year-1 patient forecast and recommend where to focus launch investment.',
    pressure: 'The Commercial VP says: Competitors will own awareness if we do not launch broadly. Why prioritize access and referral first?',
    facts: [
      ['fact_diagnosed', 'Diagnosed population is 120,000.'],
      ['fact_eligible', 'Only 60% of diagnosed patients are clinically eligible.'],
      ['fact_access', '55% of eligible patients are access-cleared in the base case.'],
      ['fact_referral', 'Base referral is 20%; the improvement scenario is 28%.'],
      ['fact_start', '50% of referred patients start treatment.'],
      ['fact_base_treated', 'The base funnel yields about 3,960 treated patients.'],
      ['fact_leak', 'Referral and treatment initiation are the largest controllable leaks.'],
      ['fact_friction', 'Step edits and prior authorization constrain conversion.'],
      ['fact_eligible_count', 'Base exhibit: 72,000 of 120,000 diagnosed patients are clinically eligible.'],
      ['fact_access_count', 'Base exhibit: 39,600 eligible patients are access-cleared.'],
      ['fact_referred_count', 'Base exhibit: 7,920 patients are referred after access clearance.'],
      ['fact_treated_count', 'Base exhibit: 3,960 patients are treated after a 50% treatment-start rate.']
    ],
    math: { question: 'If referral improves from 20% to 28% with all other rates unchanged, how many incremental treated patients are added?', expected: 1584, tolerance: 30, unit: 'patients', integer: false, equation: '120000×0.60×0.55×(0.28-0.20)×0.50', fact_ids: ['fact_diagnosed','fact_eligible','fact_access','fact_referral','fact_start'] },
    conflicts: [
      ['rule_prevalence_forecast', 'Using diagnosed prevalence as the year-1 forecast ignores eligibility, access, referral, and initiation.'],
      ['rule_broad_first', 'Broad promotion before access and referral can absorb demand is weakly supported by the base funnel.']
    ]
  },
  {
    id: 'rare_disease_trial_rescue',
    title: 'Rare-disease trial rescue',
    decision: 'Close the eight-month enrollment target while protecting data quality.',
    brief: 'A global rare-disease Phase 3 trial must enroll 240 additional patients in eight months. Twenty active sites enroll 1.1 patients per month each. The sponsor proposes eight new countries, but patient groups report travel burden and screen failures.',
    pressure: 'The Clinical Lead says: Country C activates in six weeks, faster than all others. Why not put the full budget there?',
    facts: [
      ['fact_target', 'The trial needs 240 additional patients over eight months.'],
      ['fact_current', 'Current active sites produce about 22 patients per month, or about 176 patients over eight months.'],
      ['fact_gap', 'The eight-month enrollment shortfall is 64 patients before adding new sites.'],
      ['fact_site_rate', 'A new active site enrolls 1.1 patients per month once active.'],
      ['fact_activation', 'New-site activation takes 10 weeks and screening adds two more, leaving about five productive months in the eight-month window.'],
      ['fact_country_c', 'Country C activates quickly but has the worst screen-failure and travel profile.'],
      ['fact_quality', 'The rescue cannot weaken endpoint reliability or data quality.'],
      ['fact_support', 'Pre-screening, travel support, and selective site additions can improve conversion.'],
      ['fact_country_a', 'Base exhibit Country A: 12-week activation, 28% screen failure, medium travel burden, high data quality.'],
      ['fact_country_b', 'Base exhibit Country B: 9-week activation, 34% screen failure, low travel burden, high data quality.'],
      ['fact_country_c_detail', 'Base exhibit Country C: 6-week activation, 49% screen failure, high travel burden, medium data quality.'],
      ['fact_country_d', 'Base exhibit Country D: 10-week activation, 25% screen failure, medium travel burden, high data quality.']
    ],
    math: { question: 'What is the minimum whole number of equally productive new sites needed to reach the 240-patient target after accounting for the 12-week activation and screening delay?', expected: 12, tolerance: 0.1, unit: 'sites', integer: true, equation: 'ceiling((240 - 22×8) / (1.1×5))', fact_ids: ['fact_target','fact_current','fact_gap','fact_site_rate','fact_activation'] },
    conflicts: [
      ['rule_country_c_only', 'Concentrating the full budget in Country C based on activation speed alone ignores its high screen failure and travel burden.'],
      ['rule_capacity_only', 'Treating site count as the only lever ignores conversion, retention, and patient burden.']
    ]
  },
  {
    id: 'biotech_acquisition',
    title: 'Biotech acquisition: pay for the pipeline?',
    decision: 'Value the lead asset, test the $800M ask, and structure the deal.',
    brief: 'A top-20 pharma can acquire Auralis Bio, whose lead oncology asset is entering Phase 2. The seller asks $800M. If approved, the lead asset is worth $3.2B in present value. Decide whether the ask is justified and how to structure the offer.',
    pressure: 'The banker says two recent Phase 2 oncology deals cleared $1B, so anchoring below the $800M ask will lose the process. How do you respond?',
    facts: [
      ['fact_ask', 'Seller ask is $800M and two strategic bidders remain.'],
      ['fact_approved_value', 'Approved present value is $3.2B.'],
      ['fact_probabilities', 'Base pass probabilities are 40% for Phase 2, 55% for Phase 3, and 90% for approval.'],
      ['fact_cost_p2', '$120M Phase 2 cost is spent now.'],
      ['fact_cost_p3', '$200M Phase 3 cost is incurred only if Phase 2 passes.'],
      ['fact_cost_filing', '$10M filing cost is incurred only if Phase 3 passes.'],
      ['fact_probability_limit', 'Probabilities are solid-tumor industry averages; the biomarker subset has only preclinical validation.'],
      ['fact_ra_value', 'The lead asset risk-adjusted net value is about $431M.'],
      ['fact_cumulative_probability', 'Base exhibit: cumulative probability of approval is 19.8%.']
    ],
    math: { question: 'What is the risk-adjusted net value of the lead asset in $M?', expected: 431, tolerance: 15, unit: '$M', integer: false, equation: '3200×0.40×0.55×0.90 - (120 + 200×0.40 + 10×0.40×0.55)', fact_ids: ['fact_approved_value','fact_probabilities','fact_cost_p2','fact_cost_p3','fact_cost_filing'] },
    conflicts: [
      ['rule_approved_value', 'Calling the deal cheap because $3.2B approved value exceeds the ask ignores development probability and remaining costs.'],
      ['rule_comps_only', 'Using headline comparables alone ignores asset-specific probability, platform value, and contingent structure.']
    ]
  }
];

const PROBE_FOCUS = [
  {
    clarify: ['Demand and case mix','Quality baseline','Control requirements','Timing and capacity'],
    structure: ['Demand','Quality-adjusted capacity','Workflow and rework','Governance and adoption'],
    exhibit: ['Binding buffer','Rework signal','Scenario caveat','Next analysis'],
    pressure: ['Acknowledge urgency','Protect quality','Stage the decision','Change condition']
  },
  {
    clarify: ['Eligible population','Coverage','Referral funnel','Capacity'],
    structure: ['Patient funnel','Payer economics','Care delivery','Persistence and support'],
    exhibit: ['Accessible base','Controllable leak','Promotion caveat','Next analysis'],
    pressure: ['Acknowledge awareness','Protect conversion','Stage investment','Change condition']
  },
  {
    clarify: ['Screen failure','Activation time','Patient burden','Endpoint integrity'],
    structure: ['Enrollment funnel','Site capacity','Patient support','Evidence integrity'],
    exhibit: ['Eight-patient gap','Country C trade-off','Speed is insufficient','Next analysis'],
    pressure: ['Acknowledge speed','Protect yield','Diversify action','Change condition']
  },
  {
    clarify: ['Approved-value assumptions','Stage gates','Remaining costs','Deal process'],
    structure: ['Lead asset value','Platform value','Deal structure','Integration risk'],
    exhibit: ['Cumulative probability','Value gap','Average caveat','Next analysis'],
    pressure: ['Acknowledge competition','Defend valuation','Use structure','Walk-away condition']
  }
];

const PROBE_TERMS = [
  {clarify:[['intake','source','serious','case mix','readout'],['quality','reopen','rework','deadline'],['validation','human review','audit','control'],['capacity','vendor','six week','timeline']],structure:[['demand','intake','case mix'],['capacity','closure','quality adjusted','reopen'],['workflow','rework','triage'],['governance','validation','human review','adoption']],exhibit:[['67','buffer','fragile'],['reopen','rework','quality adjusted'],['scenario','assumption','not validated'],['pilot','test','sensitivity','monitor']],pressure:[['urgency','phase 3','backlog'],['quality','compliance','audit','human review'],['pilot','gate','stage'],['if','threshold','only when','evidence']]},
  {clarify:[['eligible','label','clinical'],['coverage','payer','prior authorization','step edit'],['referral','funnel','abandonment'],['supply','treatment center','capacity']],structure:[['eligible','access','referral','treated'],['payer','coverage','gross to net','rebate'],['referral','center','initiation'],['persistence','support','abandonment']],exhibit:[['39,600','39600','access cleared'],['referral','initiation','leak'],['awareness','promotion','blocked'],['approval','abandonment','conversion','measure']],pressure:[['awareness','competitor','share of voice'],['prior authorization','referral','conversion','access'],['focused','wedge','sequence','stage'],['if','threshold','only when','measure']]},
  {clarify:[['screen failure','eligibility','criterion'],['activation','startup','weeks'],['travel','caregiver','burden'],['endpoint','data quality','retention']],structure:[['funnel','screen','conversion'],['site','activation','capacity'],['travel','support','decentralized'],['endpoint','quality','retention']],exhibit:[['8 patient','eight patient','30','22'],['country c','screen failure','travel'],['activation alone','speed alone','conversion'],['randomized','yield','retention','sensitivity']],pressure:[['six week','speed','activation'],['screen failure','conversion','randomized'],['selective','patient support','pre-screen'],['if','threshold','only when','evidence']]},
  {clarify:[['indication','line of therapy','exclusivity'],['probability','phase 2','phase 3','approval'],['cost','timeline','stage gated'],['bidder','platform','retention','integration']],structure:[['risk adjusted','rnpv','probability'],['platform','follow-on','pipeline'],['milestone','contingent','upfront'],['retention','scientist','integration']],exhibit:[['19.8','19.8%','cumulative'],['431','800','gap'],['industry average','asset specific','biomarker'],['platform','sensitivity','diligence','retention']],pressure:[['bidder','process','comparable'],['431','risk adjusted','probability'],['milestone','contingent','upfront'],['walk away','ceiling','if','threshold']]}
];

function stagePrompt(caseDef, stage) {
  if(stage==='clarify') return caseDef.brief;
  if(stage==='structure') return `Structure the decision: ${caseDef.decision}`;
  if(stage==='exhibit') return 'Read the base exhibit aloud: state the decisive pattern, the decision implication, and the next analysis.';
  if(stage==='math') return caseDef.math.question;
  if(stage==='pressure') return caseDef.pressure;
  return `Deliver the board answer for this decision: ${caseDef.decision}`;
}

function probeOptions(caseDef, caseIndex, stage) {
  if(stage==='math') return [
    { id:'math_worse', text:'What assumption would make this result materially worse?' },
    { id:'math_recheck', text:'Your result is outside the expected range. Which term, gate, or unit would you recheck first?' },
    { id:'math_setup', text:'Walk me through the equation and the unit before you commit to a number.' }
  ];
  if(stage==='synthesis') return [{ id:'reverse_recommendation', text:'What is the one fact that would make you reverse this recommendation?' }];
  const focus=(PROBE_FOCUS[caseIndex]&&PROBE_FOCUS[caseIndex][stage])||[];
  return focus.map((label,index)=>({id:`missing_${index}`,text:`You have not yet addressed ${label.toLowerCase()}. What would you ask, test, or change?`})).concat({id:'change_evidence',text:'What evidence would make you change this answer?'});
}

function makePacket(caseDef, caseIndex, stage) {
  const meta = STAGE_META[stage];
  return Object.freeze({
    case_id: caseDef.id,
    case_index: caseIndex,
    case_version: CASE_VERSION,
    stage,
    title: caseDef.title,
    decision: caseDef.decision,
    brief: caseDef.brief,
    candidate_task: stage === 'math' ? `${meta.task} ${caseDef.math.question}` : meta.task,
    stage_prompt: stagePrompt(caseDef, stage),
    canonical_pressure: caseDef.pressure,
    exhibit_mode: 'base',
    probe_options: probeOptions(caseDef, caseIndex, stage),
    probe_signals: (PROBE_TERMS[caseIndex]&&PROBE_TERMS[caseIndex][stage])||[],
    facts: caseDef.facts.map(([id, text]) => ({ id, text })),
    math: caseDef.math,
    contradiction_rules: caseDef.conflicts.map(([id, text]) => ({ id, text })),
    rubric_weights: meta.weights,
    soft_word_target: meta.softWords
  });
}

export const CASE_PACKETS = Object.freeze(CASES.flatMap((caseDef, caseIndex) =>
  STAGES.map(stage => makePacket(caseDef, caseIndex, stage))
));

export function getCasePacket(caseIndex, stage) {
  if (!Number.isInteger(caseIndex) || caseIndex < 0 || caseIndex >= CASES.length) return null;
  if (!STAGES.includes(stage)) return null;
  return CASE_PACKETS.find(packet => packet.case_index === caseIndex && packet.stage === stage) || null;
}

export function expectedProbe(packet, answer, lockedNumber) {
  if (!packet) return null;
  if (packet.stage === 'math') {
    if (!Number.isFinite(lockedNumber)) return getProbe(packet,'math_setup');
    const correct=(!packet.math.integer||Number.isInteger(lockedNumber))&&Math.abs(lockedNumber-packet.math.expected)<=packet.math.tolerance;
    return getProbe(packet,correct?'math_worse':'math_recheck');
  }
  if(packet.stage==='synthesis')return getProbe(packet,'reverse_recommendation');
  const lower=String(answer||'').toLowerCase();
  const missing=packet.probe_signals.findIndex(group=>!group.some(term=>lower.includes(String(term).toLowerCase())));
  return getProbe(packet,missing>=0?'missing_'+missing:'change_evidence');
}

export function getProbe(packet, probeId) {
  if (!packet || typeof probeId !== 'string') return null;
  return packet.probe_options.find(probe => probe.id === probeId) || null;
}

export function caseCount() { return CASES.length; }
