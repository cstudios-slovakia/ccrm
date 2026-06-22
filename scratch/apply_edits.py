import json

target_path = "/Users/erik/Documents/vibe coding/crm/src/components/EmailView.tsx"

with open(target_path, 'r', encoding='utf-8') as f:
    content = f.read()

with open("scratch/all_edits.json", "r", encoding="utf-8") as f:
    edits = json.load(f)

# We want to apply edits from Step 2827 onwards.
# We will skip step 3293 and 3295 as they had incorrect offsets.
# Also skip 3267 and 3277 because we will apply layout changes explicitly.
skipped_steps = [3293, 3295, 3267, 3277]

def clean_string(val):
    if not isinstance(val, str):
        return val
    # If the string is double JSON encoded (starts and ends with literal double quotes)
    if val.startswith('"') and val.endswith('"') and len(val) >= 2:
        try:
            return json.loads(val)
        except:
            return val[1:-1]
    return val

for e in edits:
    step = e["step"]
    if step < 2827 or step in skipped_steps:
        continue
    
    args = e["args"]
    target = clean_string(args.get("TargetContent"))
    replacement = clean_string(args.get("ReplacementContent"))
    
    if not target or not replacement:
        continue
        
    # Replace backslashes/newlines properly
    target = target.replace("\\n", "\n").replace('\\"', '"')
    replacement = replacement.replace("\\n", "\n").replace('\\"', '"')
    
    if target in content:
        content = content.replace(target, replacement, 1)
        print(f"Applied Step {step}: {args.get('Description')}")
    else:
        # Try finding normalized or fallback matches
        # Normalize line endings
        target_norm = target.replace("\r\n", "\n")
        replacement_norm = replacement.replace("\r\n", "\n")
        content_norm = content.replace("\r\n", "\n")
        if target_norm in content_norm:
            content = content_norm.replace(target_norm, replacement_norm, 1)
            print(f"Applied Step {step} (normalized line endings)")
        else:
            print(f"Target not found for Step {step} (Skipped/Already applied)")

with open(target_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Finished applying edits.")
