import boto3

# ================= CONFIGURATION =================
BUCKET_NAME = 'himanjal-portfolio-gallery-assets'
PREFIX = 'images/gallery/'
# =================================================

s3 = boto3.client('s3')

def trigger_all():
    print(f"🚀 Scanning albums in s3://{BUCKET_NAME}/{PREFIX}...")

    # 1. List all "Subfolders" (Albums)
    paginator = s3.get_paginator('list_objects_v2')
    result = paginator.paginate(Bucket=BUCKET_NAME, Prefix=PREFIX, Delimiter='/')

    for page in result:
        if 'CommonPrefixes' not in page:
            continue

        for p in page['CommonPrefixes']:
            album_folder = p['Prefix'] # e.g., "images/gallery/air_camera/"
            album_name = album_folder.strip('/').split('/')[-1]

            # 2. Find ONE valid file in this album to "touch"
            response = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=album_folder, MaxKeys=5)

            trigger_file = None
            if 'Contents' in response:
                for obj in response['Contents']:
                    key = obj['Key']
                    # Look for a jpg/png to touch
                    if key.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                        trigger_file = key
                        break

            if trigger_file:
                print(f"   ⚡ Triggering: {album_name} (touching {trigger_file.split('/')[-1]})")

                # 3. THE MAGIC TRICK: Copy the file to itself
                # This fires the "ObjectCreated" event --> Wakes up Lambda
                s3.copy_object(
                    Bucket=BUCKET_NAME,
                    Key=trigger_file,
                    CopySource={'Bucket': BUCKET_NAME, 'Key': trigger_file},
                    MetadataDirective='REPLACE' # Forces update of timestamp
                )
            else:
                print(f"   ⚠️  Skipping {album_name} (No images found)")

if __name__ == "__main__":
    trigger_all()