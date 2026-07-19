const { BLOCK_PARTY_CONFIG } = require("./event-config");

const VOTING_CATEGORIES = [
  {
    id: "peoples-choice",
    label: "People's Choice",
    rule: "all",
  },
  {
    id: "american-muscle",
    label: "American Muscle",
    rule: "sheet",
    sheetValues: ["american muscle"],
  },
  {
    id: "euro-classic",
    label: "Euro Classic",
    rule: "sheet",
    sheetValues: ["euro classic"],
  },
  {
    id: "jdm",
    label: "JDM",
    rule: "sheet",
    sheetValues: ["jdm"],
  },
  {
    id: "modified-builds",
    label: "Modified Builds",
    rule: "modified",
  },
];

const normalizeSheetValue = (value) => String(value || "").trim().toLowerCase();

const isPeoplesChoiceOnlyMarker = (value) => {
  const normalized = normalizeSheetValue(value);
  return normalized === "p" || normalized === "people's choice" || normalized === "peoples choice";
};

const isModifiedMarker = (value) => {
  const normalized = normalizeSheetValue(value);
  return normalized === "x" || normalized === "yes" || normalized === "true" || normalized === "modified";
};

/**
 * Eligibility:
 * - People's Choice: every approved car
 * - Marked P: People's Choice only (plus Modified if X)
 * - Otherwise: typed category from sheet (American Muscle / Euro Classic / JDM)
 * - Marked X: also in Modified Builds
 */
const getEligibleVotingCategoryIds = ({ votingCategory = "", modifiedFlag = "" } = {}) => {
  const ids = ["peoples-choice"];
  const sheetCategory = normalizeSheetValue(votingCategory);
  const modified = isModifiedMarker(modifiedFlag);

  if (modified) {
    ids.push("modified-builds");
  }

  if (!sheetCategory || isPeoplesChoiceOnlyMarker(sheetCategory)) {
    return ids;
  }

  const typeCategory = VOTING_CATEGORIES.find((category) => (
    category.rule === "sheet"
    && Array.isArray(category.sheetValues)
    && category.sheetValues.includes(sheetCategory)
  ));

  if (typeCategory) {
    ids.push(typeCategory.id);
  }

  return ids;
};

const isVotingOpen = () => {
  const value = String(process.env.VOTING_OPEN || "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
};

const getVotingVerificationMode = () => {
  const mode = String(process.env.VOTING_VERIFICATION_MODE || "twilio").trim().toLowerCase();
  return mode === "email" ? "email" : "twilio";
};

const getVotingCategoryIds = () => VOTING_CATEGORIES.map((category) => category.id);

const getVotingCategoryById = (categoryId) => (
  VOTING_CATEGORIES.find((category) => category.id === categoryId) || null
);

module.exports = {
  VOTING_CATEGORIES,
  VOTING_EVENT_ID: BLOCK_PARTY_CONFIG.id,
  VOTING_EVENT_NAME: BLOCK_PARTY_CONFIG.name,
  isVotingOpen,
  getVotingVerificationMode,
  getVotingCategoryIds,
  getVotingCategoryById,
  getEligibleVotingCategoryIds,
  isModifiedMarker,
  isPeoplesChoiceOnlyMarker,
  normalizeSheetValue,
};
