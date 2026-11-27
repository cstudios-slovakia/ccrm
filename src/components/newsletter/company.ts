/** The company profile as the newsletter's default header and footer want it. Kept apart from `composeEmail.ts` so Settings does not pull the builder in just for this. */
import type { CompanyBillingSettings } from "../../types";
import type { CompanyInfo } from "./builder";

/** Name, address (street, then postal code and city) and logo. A `data:` logo is dropped: the server refuses data: images. */
export const companyInfoFrom = (billing: CompanyBillingSettings | null | undefined): CompanyInfo => {
  if (!billing) return { name: "" };
  const city = [billing.postalCode, billing.city].filter((p) => p && p.trim()).join(" ").trim();
  const address = [billing.street, city].filter((p) => p && p.trim()).join("\n");
  const logo = billing.companyLogoUrl || "";
  const info: CompanyInfo = { name: billing.companyName || "" };
  if (address) info.address = address;
  if (logo && !/^data:/i.test(logo)) info.logoUrl = logo;
  return info;
};
