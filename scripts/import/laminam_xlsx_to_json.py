#!/usr/bin/env python3
"""One-off converter: LAMINAM CRM 2026.xlsx -> leads.json for import_leads.php.

This is intentionally specific to the Laminam lead spreadsheet layout
(Sheet1, header on row 1, data from row 4). Other deployments of this CRM
should get their own converter instead of a generic import UI.

Usage:
    python laminam_xlsx_to_json.py "LAMINAM CRM 2026.xlsx" leads.json

Column map (0-based) and status mapping are documented inline below.
Requires: openpyxl
"""
import json
import re
import sys
from datetime import datetime

import openpyxl

# Columns in the sheet (0-based index)
COL_OWNER = 0        # Zodp. - responsible person initials (C, T, F, M, ...)
COL_IMPORTANCE = 1   # Dolezitost - "*" .. "*****"
COL_NAME = 3         # Meno (projekt)
COL_CITY = 5         # Mesto real.
COL_PHONE = 6        # Tel.
COL_EMAIL = 7        # E-mail
COL_DATE = 8         # Datum - lead creation date, dd.mm.yyyy
COL_INFO = 9         # Info - free text describing the project
COL_STATUS = 10      # Stav CP
COL_SENT_CP = 11     # Sent CP - date the offer was sent
COL_NEXT_STEP = 12   # NEXT STEP
COL_FU = [13, 14, 15, 16]  # Follow up 1-4 (contact method: Telefon/Email/Osobne)
COL_ORDERS = 17      # Objednavky
COL_INVOICING = 18   # Fakturacia
COL_DELIVERY = 19    # Dodanie
COL_DATE2 = 20       # Datum (2nd) - delivery/installation date
COL_INSTALL = 21     # Montaz
COL_MASTER = 22      # Majster
COL_REFERENCE = 23   # Referencia

# Owner initials that map 1:1 to existing app users; everything else is
# kept as the literal text from the sheet so it can be reassigned later.
OWNER_MAP = {"C": "Cyprián", "T": "Tata"}

# Stav CP -> app lead state (LEAD_STATES in system_settings)
STATUS_MAP = {
    "odoslané": "cp odoslané",
    "podklady od klienta": "čakáme na podklady od klienta",
    "vypracovať": "vypracovať cp",
    "slavkovský": "čakáme na ponuku majstrov",  # majster name, waiting for his quote
    "montáž": "objednané",
    "montáž prac.dosky": "objednané",
}

NOT_INTERESTED = "klient nemá záujem"


def clean(v):
    if v is None:
        return ""
    return str(v).strip()


def parse_date(v):
    """dd.mm.yyyy -> yyyy-mm-dd, else None."""
    s = clean(v)
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", s)
    if not m:
        return None
    try:
        return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1))).strftime("%Y-%m-%d")
    except ValueError:
        return None


def map_owner(v):
    s = clean(v)
    return OWNER_MAP.get(s, s)


def map_status(row):
    """Derive the app lead state from Stav CP + downstream columns."""
    orders = clean(row[COL_ORDERS])
    if orders.lower() == NOT_INTERESTED:
        return "rejected"
    # Any order/invoicing/delivery/installation activity means the deal closed.
    if orders or clean(row[COL_INVOICING]) or clean(row[COL_DELIVERY]) or clean(row[COL_INSTALL]):
        return "objednané"
    status = clean(row[COL_STATUS]).lower()
    mapped = STATUS_MAP.get(status)
    if mapped == "cp odoslané":
        # Escalate to the highest follow-up that actually happened.
        for n in (4, 3, 2, 1):
            if clean(row[COL_FU[n - 1]]):
                return f"followup {n}"
        return "cp odoslané"
    if mapped:
        return mapped
    return "new"


def build_note(row):
    """Consolidate all remaining sheet columns into a single note body."""
    parts = []

    def add(label, col):
        v = clean(row[col])
        if v:
            parts.append(f"{label}: {v}")

    add("Info", COL_INFO)
    add("Stav CP (Excel)", COL_STATUS)
    add("Next step", COL_NEXT_STEP)
    for n in (1, 2, 3, 4):
        add(f"Follow up {n}", COL_FU[n - 1])
    add("Objednávky", COL_ORDERS)
    add("Fakturácia", COL_INVOICING)
    add("Dodanie", COL_DELIVERY)
    add("Dátum dodania/montáže", COL_DATE2)
    add("Montáž", COL_INSTALL)
    add("Majster", COL_MASTER)
    add("Referencia", COL_REFERENCE)
    return "\n".join(parts)


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    xlsx_path, out_path = sys.argv[1], sys.argv[2]

    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb["Sheet1"]

    leads = []
    seq = 0
    for row in ws.iter_rows(min_row=4, values_only=True):
        row = (list(row) + [None] * 24)[:24]
        name = clean(row[COL_NAME])
        if not name:
            continue
        seq += 1
        lead_id = f"lead-imp-{seq:04d}"
        created = parse_date(row[COL_DATE]) or datetime.now().strftime("%Y-%m-%d")
        stars = clean(row[COL_IMPORTANCE]).count("*")

        timeline = []
        note = build_note(row)
        if note:
            timeline.append({
                "id": f"ev-imp-{seq:04d}-note",
                "type": "note",
                "timestamp": f"{created} 09:00:00",
                "title": "Import z Excelu (LAMINAM CRM 2026)",
                "content": note,
            })
        sent = parse_date(row[COL_SENT_CP])
        if sent:
            timeline.append({
                "id": f"ev-imp-{seq:04d}-offer",
                "type": "offer",
                "timestamp": f"{sent} 09:00:00",
                "title": "CP odoslaná",
                "content": "Cenová ponuka odoslaná klientovi (import z Excelu).",
            })

        leads.append({
            "id": lead_id,
            "name": name,
            "city": clean(row[COL_CITY]),
            "status": map_status(row),
            "owner": map_owner(row[COL_OWNER]),
            "rating": stars if 1 <= stars <= 5 else 3,
            "phone": clean(row[COL_PHONE]) or None,
            "email": clean(row[COL_EMAIL]) or None,
            "createdAt": created,
            "timeline": timeline,
        })

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"leads": leads}, f, ensure_ascii=False, indent=1)

    # Console-safe summary (statuses/owners may contain diacritics)
    from collections import Counter
    statuses = Counter(l["status"] for l in leads)
    owners = Counter(l["owner"] for l in leads)
    print(f"leads: {len(leads)}")
    print("statuses:", json.dumps(dict(statuses), ensure_ascii=True))
    print("owners:", json.dumps(dict(owners.most_common(20)), ensure_ascii=True))


if __name__ == "__main__":
    main()
