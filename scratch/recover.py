import json

log_path = "/Users/erik/.gemini/antigravity-ide/brain/fd22998a-a0d3-4f63-b350-a18806249727/.system_generated/logs/transcript.jsonl"

with open(log_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            step = data.get("step_index", 0)
            
            # Check for tool calls
            tcalls = data.get("tool_calls", [])
            for tc in tcalls:
                args = tc.get("Arguments") or tc.get("args") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except:
                        pass
                
                args_str = json.dumps(args)
                if "isLargeFont" in args_str or "font" in args_str:
                    print(f"=== STEP {step} TOOL CALL: {tc.get('name')} ===")
                    print(json.dumps(args, indent=2))
                    print()
        except:
            pass
