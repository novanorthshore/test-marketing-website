const assert = require("assert");
const { validateApplication } = require("../netlify/functions/lib/validate-application");
const { isPublishedMarketplaceListing, toPublicMarketplaceListing } = require("../netlify/functions/lib/applications-sheet");

const photos = Array.from({ length: 5 }, (_, index) => ({
  photoUrl: `https://res.cloudinary.com/nova/image/upload/marketplace-${index}.jpg`,
  fileId: `nova/marketplace-${index}`,
}));

const application = {
  registrationType: "marketplace",
  name: "Giant Tsai",
  email: "giant@example.com",
  phone: "778-846-3109",
  vehicleYear: "2018",
  vehicleMake: "Honda",
  vehicleModel: "Civic",
  licensePlate: "NOVA001",
  askingPrice: "16,000",
  mileage: "188000",
  transmission: "manual",
  drivetrain: "FWD",
  knownIssues: "None known",
  listingDescription: "My daily for two years.",
  marketplaceDisplayName: "Giant",
  publicContactMethods: ["phone"],
  marketplacePhotos: photos,
};

const validated = validateApplication(application);
assert.equal(validated.ok, true);
assert.equal(validated.data.askingPrice, "16000");
assert.equal(validated.data.mileage, "188000");
assert.equal(validateApplication({ ...application, marketplacePhotos: photos.concat(photos[0]) }).ok, false);
assert.equal(validateApplication({ ...application, knownIssues: "" }).ok, false);
assert.equal(validateApplication({ ...application, publicContactMethods: [] }).ok, false);

const row = {
  ...validated.data,
  applicationId: "abc-123",
  status: "Approved",
  paymentStatus: "Paid",
  marketplaceListingStatus: "Published",
  marketplacePhotoUrls: photos.map((photo) => photo.photoUrl),
  timestamp: "2026-08-28T00:00:00.000Z",
  majorModifications: "Intake",
  instagram: "",
};
assert.equal(isPublishedMarketplaceListing(row), true);
assert.equal(isPublishedMarketplaceListing({ ...row, paymentStatus: "" }), false);
assert.equal(isPublishedMarketplaceListing({ ...row, marketplaceListingStatus: "Sold" }), false);
const publicListing = toPublicMarketplaceListing(row);
assert.equal(publicListing.seller.contact.phone, "+17788463109");
assert.equal("email" in publicListing.seller.contact, false);
assert.equal("licensePlate" in publicListing, false);

console.log("Marketplace validation and publication tests passed.");
