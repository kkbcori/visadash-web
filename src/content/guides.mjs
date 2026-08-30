// VisaDash form guides — single source of truth, rendered statically at build time.
// `slug` drives /form-guides/{slug}; `faq` powers FAQPage JSON-LD + an on-page Q&A block.
export const GUIDES = [
  {code:"DS-160", slug:"ds-160", name:"Online Nonimmigrant Visa Application", who:"Visa applicants abroad",
   purpose:"The form every nonimmigrant visa applicant completes online before a U.S. consular interview (H-1B, F-1, B-1/B-2, etc.). Generates the barcode confirmation page you bring to the interview.",
   fields:["Use your name <b>exactly</b> as printed in your passport — same spelling, same order.","List <b>every</b> country you've visited in the last five years, and all prior U.S. visits and visas.","Travel/contact, work and education history must line up with your résumé and prior filings.","Social-media handles are required — list the accounts you actually use."],
   mistakes:["Misspelling your name or transposing given/surname vs. the passport.","Leaving the SEVIS/petition receipt number blank or mistyped for petition-based visas.","Forgetting a short trip or a previously refused visa — both are asked and are checkable."],
   docs:["Passport (valid 6+ months)","Petition receipt (I-797) or SEVIS I-20/DS-2019 if applicable","Travel dates & U.S. point-of-contact","Employment and education history"],
   tip:"Print the full <i>Application</i> PDF from the review screen, not just the one-page confirmation. Run two versions through the <b>DS-160 Compare</b> tool to catch any drift between a prior filing and a refile.",
   faq:[
     {q:"What is the DS-160 used for?", a:"It is the online nonimmigrant visa application every applicant completes before a U.S. consular interview. Submitting it produces the barcode confirmation page you bring to the interview."},
     {q:"Who has to file a DS-160?", a:"Any nonimmigrant visa applicant abroad — including H-1B, F-1 student, and B-1/B-2 visitor applicants. Each traveler files their own."},
     {q:"What is the most common DS-160 mistake?", a:"Entering your name differently from the passport — a misspelling or swapping the given name and surname. Match the passport character-for-character, in passport order."}
   ]},
  {code:"I-129", slug:"i-129", name:"Petition for a Nonimmigrant Worker", who:"U.S. employers",
   purpose:"Employer-filed petition to classify a worker in H-1B, L-1, O-1, TN and similar categories. The H-1B version requires a certified LCA first.",
   fields:["Job title, SOC code and worksite must match the certified LCA exactly.","Offered wage must be at or above the prevailing wage for that SOC, area and level.","Beneficiary's name and dates of birth must match the passport and prior I-94s."],
   mistakes:["Filing before the LCA is certified, or with an LCA wage level below prevailing.","Worksite address on the petition not matching the LCA.","Specialty-occupation argument that doesn't tie the degree to the duties."],
   docs:["Certified LCA (ETA-9035)","Beneficiary's degree/credential evaluation","Detailed job description & itinerary","Company financials / ability to pay"],
   tip:"Check the offer against the <b>Prevailing Wage</b> tool before filing — a wage below the prevailing level is the most common avoidable RFE.",
   faq:[
     {q:"Who files the I-129?", a:"The U.S. employer files it to classify a worker in a nonimmigrant category such as H-1B, L-1, O-1 or TN. The worker is the beneficiary, not the filer."},
     {q:"Does the I-129 require an LCA?", a:"The H-1B version does — you need a certified Labor Condition Application (ETA-9035) first, and the job title, SOC code and worksite on the petition must match it."},
     {q:"What triggers an I-129 wage RFE?", a:"An offered wage below the prevailing wage for the occupation, area and level. Verify the offer against the prevailing wage before filing."}
   ]},
  {code:"I-140", slug:"i-140", name:"Immigrant Petition for Alien Worker", who:"Employers (EB-1/2/3)",
   purpose:"Establishes the employment-based green-card category (EB-1/2/3). For PERM-based cases it follows a certified labor certification and sets your priority date.",
   fields:["Priority date = PERM filing date (or I-140 receipt for categories without PERM). Track it on the <b>Visa Bulletin</b> tool.","Job requirements must match the PERM exactly.","Ability-to-pay evidence must cover from the priority date forward."],
   mistakes:["Education/experience that doesn't meet the PERM minimum requirements.","Switching the offered position or worksite from the PERM without explanation."],
   docs:["Approved PERM (ETA-9089) where required","Degrees, transcripts, experience letters","Employer's tax returns / audited financials"],
   tip:"Your priority date controls everything downstream — note it the day the I-140 is filed and watch it against the bulletin.",
   faq:[
     {q:"What does the I-140 establish?", a:"It establishes the employment-based immigrant category (EB-1, EB-2 or EB-3) and, for PERM-based cases, sets your priority date."},
     {q:"What is my I-140 priority date?", a:"For PERM-based cases it is the date the PERM labor certification was filed; for categories without PERM it is the I-140 receipt date. Track it against the Visa Bulletin."}
   ]},
  {code:"I-485", slug:"i-485", name:"Application to Register Permanent Residence", who:"Applicants in the U.S.",
   purpose:"Adjusts status to lawful permanent resident without leaving the U.S. Can only be filed when a visa number is available for your category and priority date.",
   fields:["Confirm your priority date is current on the bulletin's <i>Dates for Filing</i> chart before filing.","Address and immigration history must be complete and consistent across all I-485 sections.","Medical exam (I-693) should be signed and sealed by a civil surgeon."],
   mistakes:["Filing when the category is retrogressed and no number is available.","Gaps or inconsistencies in the 5-year address/employment history.","Letting underlying nonimmigrant status lapse before AOS is filed (non-214(b) cases)."],
   docs:["I-797 approval for the underlying I-140/I-130","Sealed I-693 medical exam","Birth certificate + certified translation","Two passport photos, I-94, EAD/AP if applicable"],
   tip:"You can usually file I-765 (EAD) and I-131 (Advance Parole) together with the I-485 — bundle them to get a work/travel document while you wait.",
   faq:[
     {q:"When can I file the I-485?", a:"Only when a visa number is available for your category and priority date — confirm you are current on the Visa Bulletin's Dates for Filing chart before filing."},
     {q:"Can I work while the I-485 is pending?", a:"You can file I-765 (EAD) and I-131 (Advance Parole) together with the I-485 to obtain a work and travel document while the case is pending."}
   ]},
  {code:"I-130", slug:"i-130", name:"Petition for Alien Relative", who:"U.S. citizens / residents",
   purpose:"Establishes a qualifying family relationship (spouse, child, parent, sibling) so the relative can pursue a green card.",
   fields:["Relationship evidence must be specific — marriage certificate, joint accounts, birth records.","Petitioner's status (USC vs. LPR) decides the category and the wait.","Beneficiary's biographic details must match their passport/birth certificate."],
   mistakes:["Thin marriage evidence in bona-fides — one document instead of a pattern over time.","Mismatched names across the marriage certificate, passport and prior filings."],
   docs:["Proof of petitioner's citizenship/residency","Marriage or birth certificates establishing the relationship","Bona-fide-relationship evidence (for spouses)"],
   tip:"For spouse cases, build the bona-fides file from day one — joint lease, accounts, photos over time beat a last-minute stack.",
   faq:[
     {q:"What does the I-130 do?", a:"It establishes a qualifying family relationship — spouse, child, parent or sibling — so the relative can pursue a green card. It does not by itself grant any status."},
     {q:"Does the petitioner's status matter?", a:"Yes. Whether the petitioner is a U.S. citizen or a lawful permanent resident decides the category and how long the beneficiary waits."}
   ]},
  {code:"N-400", slug:"n-400", name:"Application for Naturalization", who:"Eligible green-card holders",
   purpose:"Application to become a U.S. citizen, generally after 5 years as a permanent resident (3 if married to a U.S. citizen).",
   fields:["Confirm continuous residence and physical-presence day counts before filing.","Disclose every trip outside the U.S. of 24 hours or more.","Answer the good-moral-character questions honestly — omissions are the real risk."],
   mistakes:["A single trip of 6+ months that breaks continuous residence, filed too early.","Unpaid taxes, unreported arrests, or missed selective-service registration left undisclosed."],
   docs:["Green card (both sides)","Travel history for the statutory period","Tax transcripts","Records for any citations/arrests, if any"],
   tip:"Count your physical-presence days carefully — applying even a few weeks early on the residence requirement gets the case denied.",
   faq:[
     {q:"When am I eligible to file the N-400?", a:"Generally after 5 years as a permanent resident, or 3 years if married to and living with a U.S. citizen — provided you meet the continuous-residence and physical-presence requirements."},
     {q:"What is the biggest N-400 risk?", a:"Filing before you actually meet the residence requirement, or failing to disclose trips, taxes, or arrests. Omissions on the good-moral-character questions are the real danger."}
   ]}
];

export const GUIDE_BY_SLUG = Object.fromEntries(GUIDES.map(g => [g.slug, g]));
