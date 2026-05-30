import sys
import os
import json
import time
import requests
from PIL import Image

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
        else:
            print(f"Error fetching printings (status {res.status_code}): {res.text}")
            return []
    except Exception as e:
        print(f"Error fetching printings for {card_name}: {e}")
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
        else:
            print(f"Error downloading {url} (status {res.status_code})")
            return False
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return False

def get_image_hash(image_path):
    """Generate a simple average hash for a 16x16 grayscale image."""
    try:
        with Image.open(image_path) as img:
            img = img.convert('L').resize((16, 16), Image.Resampling.BILINEAR)
            # Use getdata() for compatibility with simple Python list conversion
            pixels = list(img.getdata())
            avg = sum(pixels) / len(pixels)
            return [1 if p > avg else 0 for p in pixels]
    except Exception as e:
        print(f"Error hashing {image_path}: {e}")
        return None

def hash_distance(hash1, hash2):
    if not hash1 or not hash2:
        return 999
    return sum(abs(p1 - p2) for p1, p2 in zip(hash1, hash2))

def match_artwork(card_name, artofmtg_url):
    print(f"\nMatching artwork for: {card_name}")
    print(f"ArtOfMtg URL: {artofmtg_url}")
    
    temp_art = "temp_artofmtg.jpg"
    if not download_image(artofmtg_url, temp_art):
        print("Failed to download artofmtg image.")
        return None
        
    artofmtg_hash = get_image_hash(temp_art)
    if not artofmtg_hash:
        return None

    print("Fetching printings from Scryfall...")
    printings = get_printings(card_name)
    print(f"Found {len(printings)} unique artwork printings.")

    best_match = None
    min_distance = 999

    for idx, card in enumerate(printings):
        image_uris = card.get('image_uris', {})
        crop_url = image_uris.get('art_crop') or image_uris.get('border_crop')
        if not crop_url:
            faces = card.get('card_faces', [])
            if faces:
                crop_url = faces[0].get('image_uris', {}).get('art_crop')

        if not crop_url:
            continue

        temp_scry = f"temp_scryfall_{idx}.jpg"
        print(f"  Checking printing {idx+1}/{len(printings)}: Set: {card['set_name']} ({card['set'].upper()}), Artist: {card['artist']}")
        
        if download_image(crop_url, temp_scry):
            scry_hash = get_image_hash(temp_scry)
            dist = hash_distance(artofmtg_hash, scry_hash)
            print(f"    Hash distance: {dist}")
            if dist < min_distance:
                min_distance = dist
                best_match = card
            try:
                os.remove(temp_scry)
            except:
                pass
        time.sleep(0.1)

    try:
        os.remove(temp_art)
    except:
        pass

    if best_match and min_distance < 80: # Threshold of 80 is very safe for 16x16 binary compare
        print(f"-> MATCH FOUND! Best match: Set: {best_match['set_name']}, Artist: {best_match['artist']}, Distance: {min_distance}")
        return best_match
    else:
        print("-> NO RELIABLE MATCH FOUND.")
        return None

# Test run
if __name__ == "__main__":
    match_artwork("Flooded Strand", "https://www.artofmtg.com/wp-content/uploads/2014/09/Flooded-Strand-MtG-Art.jpg")
