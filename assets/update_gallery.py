import boto3
import json
import urllib.parse
from io import BytesIO
from PIL import Image

# ================= CONFIGURATION =================
BUCKET_NAME = 'himanjal-portfolio-gallery-assets'
CLOUDFRONT_DOMAIN = 'd1f1sorz2edz9k.cloudfront.net'

# PATH DEFINITIONS
GALLERY_PREFIX = 'images/gallery/'
THUMB_PREFIX   = 'images/thumbs/'
CONFIG_PREFIX  = 'images/configs/'
# =================================================

s3 = boto3.client('s3')

def get_public_url(key):
    return f"https://{CLOUDFRONT_DOMAIN}/{key}"

def lambda_handler(event, context):
    print("🚀 Event received!")

    albums_to_process = set()

    # 1. Identify which albums were touched
    for record in event.get('Records', []):
        key = urllib.parse.unquote_plus(record['s3']['object']['key'])

        if not key.startswith(GALLERY_PREFIX): continue

        # Extract Album Name (images/gallery/ALBUM/photo.jpg)
        relative_path = key[len(GALLERY_PREFIX):]
        parts = relative_path.split('/')

        if len(parts) >= 2:
            albums_to_process.add(parts[0])

    # 2. Process specific albums
    for album in albums_to_process:
        process_album(album)

    # 3. UPDATE THE MASTER MANIFEST
    update_manifest()

    return {'statusCode': 200, 'body': json.dumps('Sync Complete')}

def update_manifest():
    """Scans S3 for all available JSON configs and saves a master list."""
    print("   📝 Updating Global Manifest...")

    paginator = s3.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=BUCKET_NAME, Prefix=CONFIG_PREFIX)

    albums = []
    for page in pages:
        if 'Contents' not in page: continue
        for obj in page['Contents']:
            key = obj['Key']
            filename = key.split('/')[-1]

            if filename.endswith('.json') and filename != 'manifest.json':
                album_id = filename.replace('.json', '')
                albums.append(album_id)

    albums.sort()

    manifest_key = f"{CONFIG_PREFIX}manifest.json"
    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=manifest_key,
        Body=json.dumps(albums),
        ContentType='application/json',
        CacheControl='max-age=0, must-revalidate'
    )
    print(f"   ✅ Manifest updated with {len(albums)} albums.")

def process_album(album_name):
    print(f"📂 Syncing Album: {album_name}")

    album_source_path = f"{GALLERY_PREFIX}{album_name}/"
    config_key        = f"{CONFIG_PREFIX}{album_name}.json"
    meta_input_key    = f"{GALLERY_PREFIX}{album_name}/meta.json"

    # 1. Load Defaults & Meta
    existing_images_map = {}
    try:
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=config_key)
        old_data = json.loads(obj['Body'].read().decode('utf-8'))
        for img in old_data.get('images', []):
            existing_images_map[img['name']] = img
    except: pass

    album_meta = {}
    try:
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=meta_input_key)
        album_meta = json.loads(obj['Body'].read().decode('utf-8'))
    except: pass

    # 2. Process Images
    processed_images = []
    paginator = s3.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=BUCKET_NAME, Prefix=album_source_path)
    valid_exts = ('.jpg', '.jpeg', '.png', '.webp')

    for page in pages:
        if 'Contents' not in page: continue
        for obj in page['Contents']:
            key = obj['Key']
            filename = key.split('/')[-1]
            if not filename.lower().endswith(valid_exts): continue

            thumb_key = f"{THUMB_PREFIX}{album_name}/thumb_{filename}"

            width = 0
            height = 0

            if filename in existing_images_map:
                width = existing_images_map[filename]['width']
                height = existing_images_map[filename]['height']
                try: s3.head_object(Bucket=BUCKET_NAME, Key=thumb_key)
                except: width, height = generate_thumbnail(key, thumb_key)
            else:
                width, height = generate_thumbnail(key, thumb_key)

            if width > 0:
                processed_images.append({
                    "name": filename,
                    "width": width,
                    "height": height,
                    "src": get_public_url(key),
                    "thumb": get_public_url(thumb_key)
                })

    # ---------------------------------------------------------
    # NEW LOGIC: Resolve Thumbnail URL
    # ---------------------------------------------------------
    raw_thumb_val = album_meta.get('thumbnail', "")
    final_thumb_url = ""

    if raw_thumb_val:
        # If it's a full URL (e.g. external link), keep it as is
        if raw_thumb_val.startswith("http"):
            final_thumb_url = raw_thumb_val
        else:
            # Otherwise, assume it's a filename (e.g. "img1.jpg") and
            # link to the generated thumbnail version (e.g. ".../thumbs/ALBUM/thumb_img1.jpg")
            t_key = f"{THUMB_PREFIX}{album_name}/thumb_{raw_thumb_val}"
            final_thumb_url = get_public_url(t_key)

    # 3. Save Config
    final_data = {
        "title": album_meta.get('title', album_name.replace('_', ' ').title()),
        "description": album_meta.get('caption', ""),
        "thumbnail": final_thumb_url,  # <--- Uses the resolved URL
        "s3_base_url": f"https://{CLOUDFRONT_DOMAIN}/{GALLERY_PREFIX}{album_name}/",
        "images": sorted(processed_images, key=lambda x: x['name'])
    }

    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=config_key,
        Body=json.dumps(final_data, indent=2),
        ContentType='application/json'
    )

def generate_thumbnail(source_key, target_key):
    try:
        print(f"   ⚙️ Generating thumb: {source_key.split('/')[-1]}")
        obj = s3.get_object(Bucket=BUCKET_NAME, Key=source_key)
        im = Image.open(BytesIO(obj['Body'].read()))
        width, height = im.size

        im.thumbnail((800, 800))
        thumb_buffer = BytesIO()
        if im.mode in ("RGBA", "P"): im = im.convert("RGB")
        im.save(thumb_buffer, format="JPEG", quality=80)
        thumb_buffer.seek(0)

        s3.put_object(Bucket=BUCKET_NAME, Key=target_key, Body=thumb_buffer, ContentType='image/jpeg')
        return width, height
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return 0, 0