import React from "react";
import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Car,
  CreditCard,
  FileText,
  Folder,
  GraduationCap,
  HeartPulse,
  MapPin,
  Phone,
  ShieldCheck,
  Shirt,
  User,
  Users,
  Wrench,
} from "lucide-react";
import type { AgencyLanguage, AgencySectionIconKey } from "../../types/agency";

export interface AgencySectionIconOption {
  key: AgencySectionIconKey;
  en: string;
  sk: string;
  hu: string;
  Icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
}

export const AGENCY_SECTION_ICON_OPTIONS: AgencySectionIconOption[] = [
  { key: "user", en: "Person / Identity", sk: "Osoba / Identita", hu: "Személy", Icon: User },
  { key: "passport", en: "Passport / Document", sk: "Pas / Doklad", hu: "Útlevél / Okmány", Icon: BookOpen },
  { key: "shield", en: "Permit / Security", sk: "Povolenie / Bezpečnosť", hu: "Engedély / Védelem", Icon: ShieldCheck },
  { key: "briefcase", en: "Work / Employment", sk: "Práca / Zamestnanie", hu: "Munka", Icon: Briefcase },
  { key: "mapPin", en: "Address / Location", sk: "Adresa / Lokalita", hu: "Lakcím / Helyszín", Icon: MapPin },
  { key: "users", en: "Family / Contacts", sk: "Rodina / Kontakty", hu: "Család / Kapcsolat", Icon: Users },
  { key: "graduationCap", en: "Education / Training", sk: "Vzdelanie / Kurzy", hu: "Végzettség / Képzés", Icon: GraduationCap },
  { key: "creditCard", en: "Bank / Finance", sk: "Banka / Financie", hu: "Bank / Pénzügy", Icon: CreditCard },
  { key: "heartPulse", en: "Health / Medical", sk: "Zdravie / Lekár", hu: "Egészség / Orvosi", Icon: HeartPulse },
  { key: "shirt", en: "Uniform / Gear", sk: "Oblečenie / Výstroj", hu: "Munkaruha", Icon: Shirt },
  { key: "car", en: "Transport / Vehicle", sk: "Doprava / Vozidlo", hu: "Közlekedés / Jármű", Icon: Car },
  { key: "wrench", en: "Skills / Tools", sk: "Zručnosti / Náradie", hu: "Készségek / Eszközök", Icon: Wrench },
  { key: "award", en: "Certificates", sk: "Certifikáty", hu: "Tanúsítványok", Icon: Award },
  { key: "building", en: "Company / Facility", sk: "Firma / Prevádzka", hu: "Cég / Telephely", Icon: Building2 },
  { key: "phone", en: "Phone / Emergency", sk: "Telefón / Pohotovosť", hu: "Telefon / Sürgősségi", Icon: Phone },
  { key: "fileText", en: "Notes / Contract", sk: "Poznámky / Zmluva", hu: "Jegyzet / Szerződés", Icon: FileText },
  { key: "folder", en: "General Block", sk: "Všeobecný blok", hu: "Általános blokk", Icon: Folder },
];

export const DEFAULT_SECTION_ICON_BY_ID: Record<string, { icon: AgencySectionIconKey; color: string }> = {
  applicant: { icon: "user", color: "#0d9488" },
  passport: { icon: "passport", color: "#0284c7" },
  permit: { icon: "shield", color: "#6366f1" },
  stayWork: { icon: "briefcase", color: "#10b981" },
  addresses: { icon: "mapPin", color: "#f59e0b" },
  family: { icon: "users", color: "#ec4899" },
};

export function resolveSectionIconAndColor(sec: {
  id: string;
  icon?: AgencySectionIconKey | string;
  color?: string;
}): {
  iconKey: AgencySectionIconKey;
  color: string;
  Icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
} {
  const fallback = DEFAULT_SECTION_ICON_BY_ID[sec.id] || { icon: "folder" as AgencySectionIconKey, color: "#0d9488" };
  const rawIcon = (sec.icon || fallback.icon) as AgencySectionIconKey;
  const match = AGENCY_SECTION_ICON_OPTIONS.find((opt) => opt.key === rawIcon) || AGENCY_SECTION_ICON_OPTIONS[0];
  const color = sec.color && /^#[0-9a-fA-F]{3,8}$/.test(sec.color.trim()) ? sec.color.trim() : fallback.color;
  return {
    iconKey: match.key,
    color,
    Icon: match.Icon,
  };
}

export function getSectionIconOptionLabel(opt: AgencySectionIconOption, lang: AgencyLanguage): string {
  return lang === "sk" ? opt.sk : lang === "hu" ? opt.hu : opt.en;
}
