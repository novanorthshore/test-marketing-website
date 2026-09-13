const { timingSafeEqual } = require("crypto");

const isVotingAdmin = (event) => {
  const expected = String(process.env.VOTING_ADMIN_TOKEN || "").trim();
  const supplied = String(event.headers?.["x-voting-admin-token"] || "").trim();
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
};

module.exports = { isVotingAdmin };
