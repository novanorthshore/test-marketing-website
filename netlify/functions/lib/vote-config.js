const { FINALE_CONFIG } = require("./event-config");

const VOTING_CATEGORIES = [
  { id: "peoples-choice", label: "People's Choice" },
  { id: "top-build", label: "Top Build" },
  { id: "top-classic", label: "Top Classic" },
];

const isVotingOpen = () => {
  const value = String(process.env.FINALE_VOTING_OPEN || "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
};

const getVotingVerificationMode = () => {
  const value = String(process.env.VOTING_VERIFICATION_MODE || "email").trim().toLowerCase();
  return value === "twilio" ? "twilio" : "email";
};
const getVotingCategoryIds = () => VOTING_CATEGORIES.map(({ id }) => id);
const getVotingCategoryById = (categoryId) => (
  VOTING_CATEGORIES.find(({ id }) => id === categoryId) || null
);

module.exports = {
  VOTING_CATEGORIES,
  VOTING_EVENT_ID: FINALE_CONFIG.id,
  VOTING_EVENT_NAME: FINALE_CONFIG.name,
  isVotingOpen,
  getVotingVerificationMode,
  getVotingCategoryIds,
  getVotingCategoryById,
};
