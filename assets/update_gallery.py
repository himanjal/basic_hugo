import boto3
import json
import os
from collections import defaultdict
from PIL import Image
from io import BytesIO

# ================= CONFIGURATION =================
BUCKET_NAME = 'himanjal-portfolio-gallery-assets'
S3_PREFIX = 'images/gallery/'
LOCAL_ASSETS_ROOT = 'assets/images/gallery'
JSON_FILENAME = 'images_meta.json'
AWS_REGION = 'us-east-1'
CLOUDFRONT_DOMAIN = 'd1f1sorz2edz9k.cloudfront.net'
# =================================================

s3 = boto3.client('s3')

def process_album(album_name, images_in_s3):
    print(f"\n📂 Processing Album: {album_name}")

    processed_images = []

    # Check/Create local folder for the JSON file
    local_album_path = os.path.join(LOCAL_ASSETS_ROOT, album_name)
    if not os.path.exists(local_album_path):
        os.makedirs(local_album_path, exist_ok=True)

    for filename in images_in_s3:
        if "thumb_" in filename: continue

        original_key = f"{S3_PREFIX}{album_name}/{filename}"
        thumb_filename = f"thumb_{filename}"
        thumb_key = f"{S3_PREFIX}{album_name}/thumbs/{thumb_filename}"

        # 1. CHECK IF THUMBNAIL EXISTS
        try:
            s3.head_object(Bucket=BUCKET_NAME, Key=thumb_key)
            print(f"   🔹 Checked: {filename}", end='\r')

            # Optimization: If thumb exists, we assume we want to keep it.
            # To get W/H without downloading, we'd need a DB, but for now
            # we will quickly download the thumb header or original to get size.
            # For simplicity in this fix, we will just redownload original to be safe.
        except:
            print(f"   ⚡ Generating thumb: {filename}")

        # 2. DOWNLOAD & PROCESS
        try:
            # Download Original
            obj = s3.get_object(Bucket=BUCKET_NAME, Key=original_key)
            img_data = obj['Body'].read()
            im = Image.open(BytesIO(img_data))

            width, height = im.size

            # Create Thumbnail
            im.thumbnail((600, 600))

            thumb_buffer = BytesIO()
            if im.mode in ("RGBA", "P"): im = im.convert("RGB")
            im.save(thumb_buffer, format="JPEG", quality=80)
            thumb_buffer.seek(0)

            # Upload Thumbnail (FIXED: Removed ACL parameter)
            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=thumb_key,
                Body=thumb_buffer,
                ContentType='image/jpeg'
                # ACL='public-read'  <-- REMOVED THIS LINE
            )

            processed_images.append({
                            "name": filename,
                            "width": width,
                            "height": height,
                            # NEW FAST CLOUDFRONT URL
                            "src": f"https://{CLOUDFRONT_DOMAIN}/{original_key}",
                            "thumb": f"https://{CLOUDFRONT_DOMAIN}/{thumb_key}"
                        })

        except Exception as e:
            print(f"   ❌ Error processing {filename}: {e}")

    # 3. SAVE JSON
    json_path = os.path.join(local_album_path, JSON_FILENAME)
    data = {}

    if os.path.exists(json_path):
        with open(json_path, 'r') as f:
            try:
                existing = json.load(f)
                data['title'] = existing.get('title', album_name.replace('_', ' ').title())
                data['description'] = existing.get('description', "")
            except: pass

    if 'title' not in data: data['title'] = album_name.replace('_', ' ').title()

    data['images'] = processed_images

    with open(json_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"   ✅ Saved metadata for {len(processed_images)} images.")

def main():
    print(f"🚀 Scanning S3 Bucket: '{BUCKET_NAME}'...")

    paginator = s3.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=BUCKET_NAME, Prefix=S3_PREFIX)

    album_map = defaultdict(list)
    valid_extensions = ('.jpg', '.jpeg', '.png', '.webp')

    for page in pages:
        if 'Contents' not in page: continue
        for obj in page['Contents']:
            key = obj['Key']
            rel = key[len(S3_PREFIX):]
            parts = rel.split('/')

            if len(parts) >= 2:
                album = parts[0]
                fname = parts[-1]

                if "thumbs/" not in key and fname.lower().endswith(valid_extensions):
                    album_map[album].append(fname)

    for album, files in album_map.items():
        process_album(album, sorted(files))

if __name__ == "__main__":
    main()