import sys
import os
import json
import time
import requests
import re
from PIL import Image

resolved_art_path = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/resolved-art.js'
backgrounds_path = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/backgrounds.js'
selected_art_path = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/selected-art.json'

def get_printings(card_name):
    url = "https://api.scryfall.com/cards/search"
    params = {
        'q': f'!"{card_name}"',
        'unique': 'art'
    }
    headers = {
        'User-Agent': 'BudgeriCards/1.0 (contact@budgericards.pages.dev)'
    }
    try:
        res = requests.get(url, params=params, headers=headers)
        if res.ok:
            return res.json().get('data', [])
    except Exception as e:
        print(f"Error fetching printings: {e}")
    return []

def download_image(url, filepath):
    headers = {
        'User-Agent': 'BudgeriCards/1.0 (contact@budgericards.pages.dev)'
    }
    try:
        res = requests.get(url, headers=headers, stream=True)
        if res.ok:
            with open(filepath, 'wb') as f:
                for chunk in res.iter_content(chunk_size=8192):
                    f.write(chunk)
            return True
    except Exception as e:
        pass
    return False

def get_image_hash(image_path):
    try:
        with Image.open(image_path) as img:
            img = img.convert('L').resize((16, 16), Image.Resampling.BILINEAR)
            pixels = list(img.getflat() if hasattr(img, 'getflat') else img.getdata())
            avg = sum(pixels) / len(pixels)
            return [1 if p > avg else 0 for p in pixels]
    except Exception as e:
        return None

def hash_distance(hash1, hash2):
    if not hash1 or not hash2:
        return 999
    return sum(abs(p1 - p2) for p1, p2 in zip(hash1, hash2))

def get_mtgpics_set(setCode, setName):
    code = setCode.lower()
    if code == 'm10': return '10m'
    if code == 'm11': return '11m'
    if code == 'm12': return '12m'
    if code == 'm13': return '13m'
    if code == 'm14': return '14m'
    if code == 'm15': return '15m'
    if code == 'm19': return '19m'
    if code == 'm20': return '20m'
    if code == 'm21': return '21m'
    if code == '2x2': return '2xm'
    return code

def verify_url(url):
    try:
        res = requests.head(url, timeout=3)
        return res.ok
    except:
        return False

def load_resolved_art():
    with open(resolved_art_path, 'r', encoding='utf-8') as f:
        content = f.read()
    # Extract the JSON array string between "export const RESOLVED_ART = " and ";"
    match = re.search(r'export const RESOLVED_ART =\s*(\[[\s\S]*?\]);', content)
    if match:
        return json.loads(match.group(1)), content
    return [], content

def load_backgrounds():
    with open(backgrounds_path, 'r', encoding='utf-8') as f:
        content = f.read()
    match = re.search(r'export const BACKGROUNDS =\s*(\[[\s\S]*?\]);', content)
    if match:
        return json.loads(match.group(1)), content
    return [], content

def main():
    resolved_art, original_resolved_js = load_resolved_art()
    backgrounds, original_backgrounds_js = load_backgrounds()
    
    with open(selected_art_path, 'r', encoding='utf-8') as f:
        selected_art = json.load(f)

    artofmtg_cards = [c for c in resolved_art if 'artofmtg.com' in c['url']]
    print(f"Found {len(artofmtg_cards)} artofmtg entries to visually match and migrate...")

    migration_map = {} # old_url -> new_url
    artist_map = {} # old_url -> correct_artist
    set_map = {} # old_url -> { set, setCode, collectorNumber }

    for idx, art in enumerate(artofmtg_cards):
        print(f"\n[{idx+1}/{len(artofmtg_cards)}] Processing: {art['name']}")
        
        # 1. Visual Match against Scryfall printings
        temp_art = f"temp_artofmtg_{idx}.jpg"
        if not download_image(art['url'], temp_art):
            print("  Failed to download artofmtg image.")
            continue
            
        art_hash = get_image_hash(temp_art)
        if not art_hash:
            try: os.remove(temp_art)
            except: pass
            continue

        print("  Fetching printings from Scryfall...")
        printings = get_printings(art['name'])
        best_match = None
        min_distance = 999

        for p_idx, card in enumerate(printings):
            image_uris = card.get('image_uris', {})
            crop_url = image_uris.get('art_crop') or image_uris.get('border_crop')
            if not crop_url:
                faces = card.get('card_faces', [])
                if faces:
                    crop_url = faces[0].get('image_uris', {}).get('art_crop')

            if not crop_url:
                continue

            temp_scry = f"temp_scryfall_{idx}_{p_idx}.jpg"
            if download_image(crop_url, temp_scry):
                scry_hash = get_image_hash(temp_scry)
                dist = hash_distance(art_hash, scry_hash)
                if dist < min_distance:
                    min_distance = dist
                    best_match = card
                try: os.remove(temp_scry)
                except: pass
            time.sleep(0.05)

        try: os.remove(temp_art)
        except: pass

        # Threshold of 60 ensures we have a very strong visual match
        if best_match and min_distance < 60:
            correct_artist = best_match['artist']
            set_name = best_match['set_name']
            set_code = best_match['set'].upper()
            cn = best_match['collector_number']
            
            artist_map[art['url']] = correct_artist
            set_map[art['url']] = { 'set': set_name, 'setCode': set_code, 'collectorNumber': cn }
            print(f"  -> Match found! Set: {set_name} ({set_code} #{cn}) by {correct_artist} (Distance: {min_distance})")

            # 2. Try to map to mtgpics URL
            mtgpics_set = get_mtgpics_set(best_match['set'], set_name)
            candidates = [
                f"https://www.mtgpics.com/pics/art/{mtgpics_set}/{cn}.jpg",
                f"https://www.mtgpics.com/pics/art/{mtgpics_set}/{cn}_1.jpg",
                f"https://www.mtgpics.com/pics/art/{mtgpics_set}/{cn}_2.jpg"
            ]
            
            found_url = None
            for cand in candidates:
                if verify_url(cand):
                    found_url = cand
                    break
                    
            if found_url:
                print(f"  -> Verified mtgpics URL: {found_url}")
                migration_map[art['url']] = found_url
            else:
                print("  -> No valid mtgpics URL found. Keeping artofmtg URL but updating metadata.")
        else:
            print("  -> Could not find a visual match.")

    # 3. Write updates
    if artist_map:
        print("\nApplying updates to files...")
        
        # Update selected-art.json
        updated_selected = [migration_map.get(url, url) for url in selected_art]
        with open(selected_art_path, 'w', encoding='utf-8') as f:
            json.dump(updated_selected, f, indent=4)
        print("Updated selected-art.json")

        # Update backgrounds.js
        updated_backgrounds = []
        for bg in backgrounds:
            url = bg['url']
            if url in artist_map:
                new_url = migration_map.get(url, url)
                updated_backgrounds.append({
                    "url": new_url,
                    "title": bg['title'],
                    "set": set_map[url]['set'],
                    "artist": artist_map[url]
                })
            else:
                updated_backgrounds.append(bg)
        
        new_bg_js = f"// Automatically generated with pre-fetched artist metadata\nexport const BACKGROUNDS = {json.dumps(updated_backgrounds, indent=4)};\n"
        with open(backgrounds_path, 'w', encoding='utf-8') as f:
            f.write(new_bg_js)
        print("Updated backgrounds.js")

        # Update resolved-art.js
        updated_resolved = []
        for art in resolved_art:
            url = art['url']
            if url in artist_map:
                new_url = migration_map.get(url, url)
                updated_resolved.append({
                    "category": art['category'],
                    "url": new_url,
                    "name": art['name'],
                    "artist": artist_map[url],
                    "set": set_map[url]['set'],
                    "setCode": set_map[url]['setCode'],
                    "collectorNumber": set_map[url]['collectorNumber']
                })
            else:
                updated_resolved.append(art)
        
        new_res_js = f"// Automatically generated resolved art metadata\nexport const RESOLVED_ART = {json.dumps(updated_resolved, indent=4)};\n"
        with open(resolved_art_path, 'w', encoding='utf-8') as f:
            f.write(new_res_js)
        print("Updated resolved-art.js")

if __name__ == "__main__":
    main()
