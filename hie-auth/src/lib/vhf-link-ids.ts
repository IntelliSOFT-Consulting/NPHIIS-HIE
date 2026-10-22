/**
 * linkIds of the mobile VHF forms (android-fhir nphiis/src/main/assets, pinned in
 * forms/vhf/platform/). Stored data uses these, so hie-auth reads and writes them; the generated
 * forms/vhf/out forms have drifted from them.
 */
export const VHF_CASE_LINK_IDS = {
  demographics: "vhf-demographics",
  familyName: "486402457213",
  givenNames: "873240407472",
  sex: "929966324957",
  birthDateKnown: "442636360588",
  birthDate: "257830485990",
  idType: "vhf-id-type",
  idTypeMinor: "vhf-id-type-minor",
  idNumber: "vhf-national-id",
  phone: "vhf-phone",
  currentResidence: "vhf-current-residence",
  village: "vhf-village",
  clinical: "vhf-clinical",
  symptoms: "vhf-symptoms",
  bleedingSite: "vhf-bleeding-site",
  symptomsOther: "vhf-symptoms-other",
  firstOnset: "728034137219",
  onsetPrefix: "vhf-onset-",
  travel: "vhf-travel",
  travelled: "vhf-travelled",
  originCountry: "vhf-travel-origin-country",
  originPlace: "vhf-travel-origin-place",
  departureDate: "vhf-travel-departure-date",
  means: "vhf-travel-means",
  stopovers: "vhf-travel-stopovers",
  destinationCountry: "vhf-travel-destination-country",
  destinationPlace: "vhf-travel-destination-place",
  arrivalDate: "vhf-travel-arrival-date",
} as const;

/** Case-form questions a contact is registered and linked with (vhf-case.json). */
export const VHF_CONTACT_LINK_IDS = {
  caseType: "vhf-case-type",
  sourceCaseEpid: "vhf-source-case-epid",
  exposureType: "vhf-exposure-type",
  contactDate: "vhf-contact-date",
  relationship: "vhf-relationship",
  relationshipOther: "vhf-relationship-other",
  contactLocation: "vhf-contact-location",
  exposureLocation: "vhf-exposure-location",
  county: "a4-county",
  subCounty: "a3-sub-county",
  ageYears: "492731638700",
} as const;

/** Daily follow-up form (vhf-contact-follow-up.json), one child Encounter per day. */
export const VHF_FOLLOW_UP_LINK_IDS = {
  day: "vhf-follow-up-day",
  date: "vhf-follow-up-date",
  symptomatic: "vhf-follow-up-symptomatic",
  symptoms: "vhf-follow-up-symptoms",
} as const;

/** Contact monitoring form (vhf-contact-monitoring.json): status set by a person. */
export const VHF_MONITORING_LINK_IDS = {
  status: "vhf-monitoring-status",
} as const;

/** Encounter.reasonCode[0].coding[0].code of the case and its child forms, as mobile writes them. */
export const VHF_REASONS = {
  case: "VHF Case Information",
  followUp: "VHF Contact Follow Up",
  monitoring: "VHF Contact Monitoring",
} as const;

/** Follow-up window: day 0 is the date of contact, days 1-21 are followed up. */
export const VHF_FOLLOW_UP_WINDOW_DAYS = 21;
