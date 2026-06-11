import json
from datetime import datetime

har_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/local-resources/localhost.har"

def dump_api_calls():
    with open(har_path, 'r', encoding='utf-8') as f:
        har_data = json.load(f)
        
    entries = har_data.get('log', {}).get('entries', [])
    
    parsed = []
    for entry in entries:
        req = entry.get('request', {})
        url = req.get('url', '')
        if 'scryfall.com' in url and 'scryfall.io' not in url:
            started_time_str = entry.get('startedDateTime', '')
            try:
                clean_time_str = started_time_str.split('+')[0].split('Z')[0]
                started_dt = datetime.strptime(clean_time_str, "%Y-%m-%dT%H:%M:%S.%f")
            except Exception:
                started_dt = datetime.now()
            parsed.append((started_dt, req.get('method', ''), url, entry.get('time', 0)))
            
    parsed.sort(key=lambda x: x[0])
    
    if not parsed:
        print("No API calls found.")
        return
        
    first_time = parsed[0][0]
    print(f"Total API calls: {len(parsed)}")
    for dt, method, url, dur in parsed[:100]:
        rel = (dt - first_time).total_seconds()
        print(f"{rel:<8.3f}s | {method:<6} | {dur:<8.1f}ms | {url}")

if __name__ == "__main__":
    dump_api_calls()
