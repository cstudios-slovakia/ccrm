import json

log_path = "/Users/erik/.gemini/antigravity-ide/brain/fd22998a-a0d3-4f63-b350-a18806249727/.system_generated/logs/transcript.jsonl"
edits = []

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            step = data.get("step_index", 0)
            tcalls = data.get("tool_calls", [])
            for tc in tcalls:
                if tc.get("name") in ["replace_file_content", "multi_replace_file_content", "write_to_file"]:
                    args = tc.get("Arguments") or tc.get("args") or {}
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except:
                            pass
                    
                    target = args.get("TargetFile") or args.get("Target") or ""
                    if "EmailView.tsx" in target:
                        edits.append({
                            "step": step,
                            "tool": tc.get("name"),
                            "args": args
                        })
        except:
            pass

with open("scratch/all_edits.json", "w", encoding="utf-8") as out:
    json.dump(edits, out, indent=2)

print(f"Extracted {len(edits)} tool calls to scratch/all_edits.json")
