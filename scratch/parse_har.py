import json
from datetime import datetime

har_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/local-resources/localhost.har"

def analyze_har():
    print(f"Loading {har_path}...")
    with open(har_path, 'r', encoding='utf-8') as f:
        har_data = json.load(f)
        
    entries = har_data.get('log', {}).get('entries', [])
    parsed_requests = []
    
    for entry in entries:
        req = entry.get('request', {})
        res = entry.get('response', {})
        url = req.get('url', '')
        method = req.get('method', '')
        status = res.get('status', 0)
        
        if 'scryfall.com' not in url and 'scryfall.io' not in url:
            continue
            
        started_time_str = entry.get('startedDateTime', '')
        try:
            clean_time_str = started_time_str.split('+')[0].split('Z')[0]
            started_dt = datetime.strptime(clean_time_str, "%Y-%m-%dT%H:%M:%S.%f")
        except Exception:
            started_dt = datetime.now()
            
        duration = entry.get('time', 0.0)
        
        body_size = res.get('bodySize', 0)
        if body_size < 0:
            body_size = len(res.get('content', {}).get('text', ''))
            
        parsed_requests.append({
            'url': url,
            'method': method,
            'status': status,
            'time': started_dt,
            'duration': duration,
            'size': body_size
        })
        
    parsed_requests.sort(key=lambda x: x['time'])
    if not parsed_requests:
        print("No Scryfall requests found.")
        return

    # Cluster requests by time gap of > 10 seconds (representing separate paste actions)
    clusters = []
    current_cluster = []
    
    for req in parsed_requests:
        if not current_cluster:
            current_cluster.append(req)
        else:
            gap = (req['time'] - current_cluster[-1]['time']).total_seconds()
            if gap > 10.0:
                clusters.append(current_cluster)
                current_cluster = [req]
            else:
                current_cluster.append(req)
    if current_cluster:
        clusters.append(current_cluster)
        
    print(f"\nGrouped requests into {len(clusters)} activity clusters.")
    
    for i, cluster in enumerate(clusters):
        start_time = cluster[0]['time']
        end_time = cluster[-1]['time']
        span = (end_time - start_time).total_seconds()
        
        # Categorize
        api_requests = [r for r in cluster if '/cards/collection' in r['url'] or 'api.scryfall.com' in r['url']]
        small_images = [r for r in cluster if '/small/' in r['url']]
        normal_images = [r for r in cluster if '/normal/' in r['url']]
        
        print("\n" + "="*80)
        print(f"Cluster #{i+1}: Started at {start_time.strftime('%H:%M:%S.%f')[:-3]} (span: {span:.2f}s)")
        print(f"Total requests in cluster: {len(cluster)}")
        print(f" - Scryfall API / Metadata calls: {len(api_requests)}")
        print(f" - Small Image requests:        {len(small_images)}")
        print(f" - Normal Image requests:       {len(normal_images)}")
        
        # Calculate stats for small images
        if small_images:
            avg_small_dur = sum(r['duration'] for r in small_images) / len(small_images)
            max_small_dur = max(r['duration'] for r in small_images)
            min_small_dur = min(r['duration'] for r in small_images)
            avg_small_size = sum(r['size'] for r in small_images) / len(small_images) / 1024
            print(f"   * Small images stats: count={len(small_images)}, size={avg_small_size:.1f}KB, avg_dur={avg_small_dur:.1f}ms, min_dur={min_small_dur:.1f}ms, max_dur={max_small_dur:.1f}ms")
            
        # Calculate stats for normal images
        if normal_images:
            avg_normal_dur = sum(r['duration'] for r in normal_images) / len(normal_images)
            max_normal_dur = max(r['duration'] for r in normal_images)
            min_normal_dur = min(r['duration'] for r in normal_images)
            avg_normal_size = sum(r['size'] for r in normal_images) / len(normal_images) / 1024
            print(f"   * Normal images stats: count={len(normal_images)}, size={avg_normal_size:.1f}KB, avg_dur={avg_normal_dur:.1f}ms, min_dur={min_normal_dur:.1f}ms, max_dur={max_normal_dur:.1f}ms")
            
        if api_requests:
            avg_api_dur = sum(r['duration'] for r in api_requests) / len(api_requests)
            print(f"   * API requests stats: count={len(api_requests)}, avg_dur={avg_api_dur:.1f}ms")

if __name__ == "__main__":
    analyze_har()
