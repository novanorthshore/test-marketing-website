const { BLOCK_PARTY_CONFIG } = require("./event-config");

const VOTING_CATEGORIES = [
  {
    id: "peoples-choice",
    label: "People's Choice",
  },
  {
    id: "best-american-muscle",
    label: "Best American Muscle",
  },
  {
    id: "best-european-classic",
    label: "Best European Classic",
  },
];

const isVotingOpen = () => {
  const value = String(process.env.VOTING_OPEN || "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
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
  getVotingCategoryIds,
  getVotingCategoryById,
};
