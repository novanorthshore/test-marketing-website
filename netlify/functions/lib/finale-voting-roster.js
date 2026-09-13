const roster = require("./finale-voting-roster.json");

const listFinaleVotingCars = () => roster.map((car) => ({
  ...car,
  vehicleLabel: [car.vehicleYear, car.vehicleMake, car.vehicleModel]
    .filter(Boolean)
    .join(" "),
  eligibleCategoryIds: [...car.eligibleCategoryIds],
}));

module.exports = { listFinaleVotingCars };
