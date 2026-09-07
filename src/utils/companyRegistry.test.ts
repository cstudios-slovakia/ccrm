import assert from "node:assert/strict";
import test from "node:test";
import {
  companyAddressFields,
  companyDetailsToLeadFields,
  identifierDigits,
  isCompanyQuerySearchable,
  looksLikeIdentifier,
  registerLabel,
  registryCountryOf,
  suggestionSubtitle,
  type CompanyDetails,
  type CompanySuggestion,
} from "./companyRegistry.ts";

const details = (over: Partial<CompanyDetails> = {}): CompanyDetails => ({
  country: "Slovakia",
  countryCode: "SK",
  name: "ESET, spol. s r.o.",
  companyId: "31333532",
  taxId: "2020317068",
  vatId: "SK2020317068",
  street: "Einsteinova 24",
  city: "Bratislava",
  postalCode: "85101",
  region: "SK010",
  district: "Bratislava V",
  legalForm: "Spoločnosť s ručením obmedzeným",
  legalFormCode: "112",
  establishmentDate: "1992-09-17",
  dissolutionDate: "",
  skNace: "62090",
  organizationSize: "31",
  ownershipType: "2",
  dataSource: "SUSR",
  register: "orsr",
  registerLabel: "Obchodný register",
  registrationNumber: "Sro/3586/B",
  registrationOffice: "Mestský súd Bratislava III",
  contactPerson: "Miroslav Trnka",
  mainActivity: "Ostatné služby týkajúce sa informačných technológií",
  activities: ["poskytovanie softwaru"],
  rpoId: "937053",
  registerUzId: "154048",
  active: true,
  ...over,
});

const suggestion = (over: Partial<CompanySuggestion> = {}): CompanySuggestion => ({
  source: "rpo",
  id: "937053",
  registerUzId: "154048",
  name: "ESET, spol. s r.o.",
  companyId: "31333532",
  taxId: "2020317068",
  street: "Einsteinova 24",
  city: "Bratislava",
  postalCode: "85101",
  register: "orsr",
  active: true,
  ...over,
});

test("registryCountryOf maps the country names the forms store", () => {
  assert.equal(registryCountryOf("Slovakia"), "SK");
  assert.equal(registryCountryOf("slovensko"), "SK");
  assert.equal(registryCountryOf("SK"), "SK");
  assert.equal(registryCountryOf("Czech Republic"), "CZ");
  assert.equal(registryCountryOf("Czechia"), "CZ");
  assert.equal(registryCountryOf("cz"), "CZ");
});

test("registryCountryOf returns null where no register is available", () => {
  assert.equal(registryCountryOf("Austria"), null);
  assert.equal(registryCountryOf(""), null);
  assert.equal(registryCountryOf(null), null);
  assert.equal(registryCountryOf(undefined), null);
});

test("looksLikeIdentifier separates numbers from trade names", () => {
  assert.equal(looksLikeIdentifier("31333532"), true);
  assert.equal(looksLikeIdentifier("SK2020317068"), true);
  assert.equal(looksLikeIdentifier("sk 2020 317 068"), true);
  assert.equal(looksLikeIdentifier("CZ26168685"), true);
  assert.equal(looksLikeIdentifier("ESET"), false);
  assert.equal(looksLikeIdentifier("Novák 2"), false);
});

test("identifierDigits strips the VAT prefix and spacing", () => {
  assert.equal(identifierDigits("SK 2020 317 068"), "2020317068");
  assert.equal(identifierDigits("CZ26168685"), "26168685");
  assert.equal(identifierDigits("ESET"), "");
});

test("isCompanyQuerySearchable holds back queries the registers cannot answer", () => {
  assert.equal(isCompanyQuerySearchable("es"), false);
  assert.equal(isCompanyQuerySearchable("eset"), true);
  assert.equal(isCompanyQuerySearchable("  eset  "), true);
  // "SK1" is 3 characters but only one digit — not worth a round trip.
  assert.equal(isCompanyQuerySearchable("SK1"), false);
  assert.equal(isCompanyQuerySearchable("313"), true);
});

test("suggestionSubtitle lists only what the register actually returned", () => {
  assert.equal(
    suggestionSubtitle(suggestion()),
    "IČO 31333532 · DIČ 2020317068 · Einsteinova 24, Bratislava"
  );
  assert.equal(
    suggestionSubtitle(suggestion({ taxId: "", street: "", city: "" })),
    "IČO 31333532"
  );
});

test("registerLabel tells a company apart from a sole trader", () => {
  assert.equal(registerLabel("orsr", "sk"), "OR SR");
  assert.equal(registerLabel("zrsr", "sk"), "ŽR SR");
  assert.equal(registerLabel("zrsr", "en"), "Sole trader");
  assert.equal(registerLabel("ares", "sk"), "ARES");
  assert.equal(registerLabel("other", "sk"), "");
});

test("companyAddressFields carries the address the form stores", () => {
  assert.deepEqual(companyAddressFields(details()), {
    street: "Einsteinova 24",
    city: "Bratislava",
    postalCode: "85101",
    country: "Slovakia",
  });
});

test("companyDetailsToLeadFields prefers the readable legal form", () => {
  const fields = companyDetailsToLeadFields(details());
  assert.equal(fields.legalForm, "Spoločnosť s ručením obmedzeným");
  assert.equal(fields.vatId, "SK2020317068");
  assert.equal(fields.contactPerson, "Miroslav Trnka");
  assert.equal(fields.district, "Bratislava V");
});

test("companyDetailsToLeadFields omits empty values so it never wipes typed data", () => {
  // A sole trader: zrsr publishes no DIČ, so the DIČ the user typed must survive.
  const fields = companyDetailsToLeadFields(
    details({ taxId: "", vatId: "", register: "zrsr", contactPerson: "Viera Nováková" })
  );
  assert.equal("taxId" in fields, false);
  assert.equal("vatId" in fields, false);
  assert.equal(fields.contactPerson, "Viera Nováková");
});
