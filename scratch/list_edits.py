import json

with open("scratch/all_edits.json", "r", encoding="utf-8") as f:
    edits = json.load(f)

for e in edits:
    args = e["args"]
    desc = args.get("Description") or args.get("Instruction") or ""
    print(f"Step {e['step']}: {e['tool']} - {desc}")
