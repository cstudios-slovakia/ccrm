import json

with open("scratch/all_edits.json", "r", encoding="utf-8") as f:
    edits = json.load(f)

# Find Step 2831 (which is simple text: green button)
for e in edits:
    if e["step"] == 2831:
        args = e["args"]
        target = args.get("TargetContent")
        print("Target (repr):", repr(target))
        
        target_path = "/Users/erik/Documents/vibe coding/crm/src/components/EmailView.tsx"
        with open(target_path, 'r', encoding='utf-8') as tf:
            content = tf.read()
            
        print("Is in file?", target in content)
        # Try finding a substring
        sub = "bg-emerald-650"
        print("Is substring 'bg-emerald-650' in file?", sub in content)
